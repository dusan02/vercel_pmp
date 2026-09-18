/**
 * BFS site crawler — discovers every URL reachable via <a href> in SSR HTML.
 *
 *   npx tsx scripts/crawl-site.ts [--base https://premarketprice.com] [--max 2000] [--out crawl.json]
 *
 * Faster and more complete than random clicking: deterministic coverage of
 * everything linked. Limitation: router.push() navigations without <a>
 * (e.g. heatmap tiles) are not discovered — those paths are listed manually
 * in KNOWN_JS_ONLY below.
 *
 * Output: JSON { pages: [{url, status, redirectTo, discoveredFrom[]}] } +
 * console summary grouped by path prefix.
 */

import { writeFileSync } from 'fs';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};

const BASE = arg('--base', 'https://premarketprice.com').replace(/\/$/, '');
const MAX_PAGES = parseInt(arg('--max', '2000'), 10);
const CONCURRENCY = 4;
const DELAY_MS = 50;
const OUT = arg('--out', `crawl-${new Date().toISOString().slice(0, 10)}.json`);

// Paths JS navigates to without <a href> — can't be found by HTML crawling
const KNOWN_JS_ONLY = ['/analysis/[ticker] (heatmap tile click → router.push)'];

const SKIP_PREFIXES = ['/api/', '/_next/', '/admin', '/auth', '/login', '/logout', '/register', '/embed/'];
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|map|json|xml|txt|woff2?|ttf|webmanifest|mp4|pdf)$/i;

type PageInfo = {
  status: number;
  redirectTo?: string;
  contentType?: string;
  discoveredFrom: string[];
};

const pages = new Map<string, PageInfo>();
const queue: string[] = [];

function normalize(href: string, from: string): string | null {
  try {
    const u = new URL(href, from.startsWith('http') ? from : BASE + from);
    if (u.origin !== new URL(BASE).origin) return null;
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    // sort query params for stable dedup
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of params) u.searchParams.append(k, v);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const url = u.origin + path + (u.search ? u.search : '');
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return null;
    if (SKIP_EXT.test(path)) return null;
    return url;
  } catch {
    return null;
  }
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  // Only <a href> — <link href> (dns-prefetch, stylesheets) is not navigation
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
      links.push(href);
    }
  }
  return links;
}

function enqueue(url: string, from: string) {
  const existing = pages.get(url);
  if (existing) {
    if (!existing.discoveredFrom.includes(from)) existing.discoveredFrom.push(from);
    return;
  }
  pages.set(url, { status: -1, discoveredFrom: [from] });
  queue.push(url);
}

async function crawlOne(url: string): Promise<void> {
  const info = pages.get(url)!;
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'PMP-SiteAudit/1.0 (internal link crawler)' },
      signal: AbortSignal.timeout(20000),
    });
    info.status = res.status;
    info.contentType = res.headers.get('content-type') ?? '';
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      info.redirectTo = loc ?? undefined;
      const target = loc ? normalize(loc, url) : null;
      if (target) enqueue(target, url + ' [redirect]');
      return;
    }
    if (res.status === 200 && info.contentType.includes('text/html')) {
      const html = await res.text();
      for (const href of extractLinks(html)) {
        const link = normalize(href, url);
        if (link) enqueue(link, url);
      }
    }
  } catch (e) {
    info.status = 0;
    info.contentType = String(e).slice(0, 100);
  }
}

async function main() {
  console.log(`Crawling ${BASE} (max ${MAX_PAGES} pages, ${CONCURRENCY} workers)...`);
  enqueue(BASE + '/', 'seed');
  // seed a few entry points that may not be linked from home
  for (const seed of ['/heatmap', '/premarket-movers', '/screener', '/sectors', '/earnings', '/blog', '/gainers', '/losers']) {
    enqueue(BASE + seed, 'seed');
  }

  let done = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      const info = pages.get(url)!;
      if (info.status !== -1) continue;
      await crawlOne(url);
      done++;
      if (done % 100 === 0) console.log(`  ${done} fetched, ${queue.length} queued, ${pages.size} discovered`);
      if (done >= MAX_PAGES) return;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  });
  await Promise.all(workers);

  const arr = [...pages.entries()].map(([url, info]) => ({
    url,
    status: info.status,
    ...(info.redirectTo ? { redirectTo: info.redirectTo } : {}),
    discoveredFrom: info.discoveredFrom.slice(0, 5),
    discoveredCount: info.discoveredFrom.length,
  }));
  writeFileSync(OUT, JSON.stringify({ base: BASE, crawledAt: new Date().toISOString(), pages: arr }, null, 2));

  // --- summary ---
  const byStatus = new Map<number, string[]>();
  const notFetched: string[] = [];
  for (const [url, info] of pages) {
    if (info.status === -1) { notFetched.push(url); continue; }
    const list = byStatus.get(info.status) ?? [];
    list.push(url);
    byStatus.set(info.status, list);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Discovered: ${pages.size} URLs, fetched: ${done}`);
  for (const [status, urls] of [...byStatus.entries()].sort()) {
    console.log(`  ${status}: ${urls.length}`);
  }
  if (notFetched.length) console.log(`  not fetched (over limit): ${notFetched.length}`);

  const redirects = arr.filter((p) => p.status >= 300 && p.status < 400);
  const errors = arr.filter((p) => p.status === 404 || p.status >= 500 || p.status === 0);
  if (redirects.length) {
    console.log(`\n--- Redirects (${redirects.length}) ---`);
    for (const p of redirects.slice(0, 40)) console.log(`  ${p.url} → ${p.redirectTo}`);
  }
  if (errors.length) {
    console.log(`\n--- Errors (${errors.length}) ---`);
    for (const p of errors.slice(0, 40)) console.log(`  ${p.status} ${p.url} (found on ${p.discoveredFrom[0]})`);
  }

  // group 200s by first path segment
  const groups = new Map<string, number>();
  for (const p of arr) {
    if (p.status !== 200) continue;
    const seg = new URL(p.url).pathname.split('/')[1] || '/';
    groups.set(seg, (groups.get(seg) ?? 0) + 1);
  }
  console.log(`\n--- 200 pages by section ---`);
  for (const [seg, n] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  /${seg}: ${n}`);
  }

  console.log(`\nJS-only navigations (not discoverable via HTML): ${KNOWN_JS_ONLY.join(', ')}`);
  console.log(`\nWritten to ${OUT}`);
}

main();

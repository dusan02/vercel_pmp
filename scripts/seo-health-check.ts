/**
 * SEO Health Check — deterministic, reusable technical SEO audit.
 *
 * Usage:
 *   npx tsx scripts/seo-health-check.ts                          # production, default tickers
 *   npx tsx scripts/seo-health-check.ts http://localhost:3000    # local
 *   npx tsx scripts/seo-health-check.ts https://premarketprice.com AAPL MSFT NVDA
 *
 * Reports what a crawler sees: status, title, canonical, robots, headings,
 * clean text length, meta description, JSON-LD, internal links, sitemap.
 *
 * NOTE: reports "technically indexable" only — actual indexation is a GSC question.
 */

const DEFAULT_BASE = 'https://premarketprice.com';
const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'META', 'WMT'];
const USER_AGENT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const FETCH_TIMEOUT_MS = 30_000;
const THIN_TEXT_THRESHOLD = 2500;
const TITLE_MAX = 60;

interface PageReport {
  url: string;
  status: number;
  ms: number;
  htmlBytes: number;
  title: string;
  titleLen: number;
  canonical: string | null;
  robots: string | null;
  h1: number;
  h2: number;
  cleanText: number;
  hasDescription: boolean;
  jsonLd: number;
  internalLinks: number;
  analysisLinks: number;
  issues: string[];
}

interface SitemapReport {
  status: number;
  totalUrls: number;
  uniqueUrls: number;
  duplicates: string[];
  byType: Record<string, number>;
  lastmodDates: number;
  sampleUrls: string[];
}

const args = process.argv.slice(2);
const baseUrl = (args[0] && args[0].startsWith('http') ? args[0] : DEFAULT_BASE).replace(/\/$/, '');
const tickers = args[0] && args[0].startsWith('http') ? args.slice(1) : args;
const TICKERS = tickers.length > 0 ? tickers.map((t) => t.toUpperCase()) : DEFAULT_TICKERS;

async function fetchPage(url: string): Promise<{ html: string; status: number; ms: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const html = await res.text();
  return { html, status: res.status, ms: Date.now() - start };
}

function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(html)) !== null) out.push(m[1] ?? '');
  return out;
}

function analyzePage(url: string, html: string, status: number, ms: number): PageReport {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const canonical =
    html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ??
    null;
  const robots =
    html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
  const hasDescription = /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html);
  // Strip scripts/styles before counting headings — Next.js RSC payloads
  // serialize the DOM inside <script> blocks, inflating raw counts.
  const bodyOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const h1 = (bodyOnly.match(/<h1[\s>]/gi) ?? []).length;
  const h2 = (bodyOnly.match(/<h2[\s>]/gi) ?? []).length;
  const jsonLd = (html.match(/<script[^>]*type=["']application\/ld\+json["']/gi) ?? []).length;

  const hrefs = extractAll(html, /<a[^>]*href=["']([^"'#]+)["']/gi);
  const internalLinks = hrefs.filter(
    (h) => h.startsWith('/') && !h.startsWith('//'),
  ).length;
  const analysisLinks = hrefs.filter((h) => /^\/analysis\//.test(h)).length;

  const cleanText = stripToText(html).length;

  const issues: string[] = [];
  if (status !== 200) issues.push(`HTTP_${status}`);
  if (!title) issues.push('MISSING_TITLE');
  else if (title.length > TITLE_MAX) issues.push(`TITLE_TOO_LONG (${title.length})`);
  if (h1 === 0) issues.push('MISSING_H1');
  if (h1 > 1) issues.push(`DUPLICATE_H1 (${h1})`);
  if (!canonical) issues.push('MISSING_CANONICAL');
  if (robots && /noindex/i.test(robots)) issues.push(`NOINDEX (${robots})`);
  if (status === 200 && cleanText < THIN_TEXT_THRESHOLD)
    issues.push(`THIN_CONTENT (${cleanText})`);
  if (!hasDescription) issues.push('MISSING_DESCRIPTION');

  return {
    url, status, ms, htmlBytes: html.length, title, titleLen: title.length,
    canonical, robots, h1, h2, cleanText, hasDescription, jsonLd,
    internalLinks, analysisLinks, issues,
  };
}

function parseSitemap(xml: string, base: string): SitemapReport {
  const locs = extractAll(xml, /<loc>\s*([^<]+?)\s*<\/loc>/gi);
  const lastmods = extractAll(xml, /<lastmod>\s*([^<]+?)\s*<\/lastmod>/gi);
  const seen = new Map<string, number>();
  for (const l of locs) seen.set(l, (seen.get(l) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, c]) => c > 1).map(([u]) => u);

  const byType: Record<string, number> = {};
  for (const l of locs) {
    const path = l.replace(base, '').replace(/^https?:\/\/[^/]+/, '') || '/';
    const type =
      path === '/' ? 'home'
      : path.startsWith('/analysis/') ? 'analysis'
      : path.startsWith('/valuation/') ? 'valuation'
      : path.startsWith('/financials/') ? 'financials'
      : path.startsWith('/movers/') ? 'movers'
      : path.startsWith('/sectors') ? 'sectors'
      : path.startsWith('/earnings') ? 'earnings'
      : path.startsWith('/blog') ? 'blog'
      : path.startsWith('/premarket-') ? 'archive'
      : 'other';
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return {
    status: 200,
    totalUrls: locs.length,
    uniqueUrls: seen.size,
    duplicates,
    byType,
    lastmodDates: new Set(lastmods).size,
    sampleUrls: locs.slice(0, 5),
  };
}

function printTable(reports: PageReport[]): void {
  const row = (r: PageReport) =>
    `${r.url.padEnd(46)} ${String(r.status).padEnd(5)} ${String(r.h1).padEnd(3)} ` +
    `${String(r.h2).padEnd(3)} ${String(r.titleLen).padEnd(4)} ${String(r.cleanText).padEnd(7)} ` +
    `${String(r.analysisLinks).padEnd(4)} ${String(r.ms).padEnd(5)}ms ${r.issues.join(', ') || 'ok'}`;

  console.log('\n=== PAGE REPORTS ===');
  console.log(
    'URL'.padEnd(47) + 'HTTP  H1  H2  TLen Text   ALink ms    Issues',
  );
  console.log('-'.repeat(110));
  for (const r of reports) console.log(row(r));
}

async function main(): Promise<void> {
  console.log(`SEO Health Check — ${baseUrl}`);
  console.log(`User-Agent: ${USER_AGENT.slice(0, 50)}…\n`);

  const paths = [
    '/',
    '/screener',
    '/sectors',
    '/heatmap',
    '/earnings',
    '/premarket-movers',
    ...TICKERS.map((t) => `/analysis/${t}`),
    `/valuation/${TICKERS[0]}`,
    `/financials/${TICKERS[0]}`,
    `/movers/${TICKERS[0]}`,
  ];

  const reports: PageReport[] = [];
  for (const p of paths) {
    const url = `${baseUrl}${p}`;
    try {
      const { html, status, ms } = await fetchPage(url);
      reports.push(analyzePage(url, html, status, ms));
    } catch (e) {
      reports.push({
        url, status: 0, ms: 0, htmlBytes: 0, title: '', titleLen: 0,
        canonical: null, robots: null, h1: 0, h2: 0, cleanText: 0,
        hasDescription: false, jsonLd: 0, internalLinks: 0, analysisLinks: 0,
        issues: [`FETCH_ERROR (${(e as Error).message.slice(0, 60)})`],
      });
    }
  }

  printTable(reports);

  // Sitemap + robots.txt
  console.log('\n=== SITEMAP ===');
  try {
    const { html: xml, status } = await fetchPage(`${baseUrl}/sitemap.xml`);
    if (status !== 200) {
      console.log(`sitemap.xml: HTTP ${status}`);
    } else {
      const sm = parseSitemap(xml, baseUrl);
      console.log(`sitemap.xml: HTTP ${status}, ${sm.totalUrls} URLs (${sm.uniqueUrls} unique)`);
      console.log(`by type: ${Object.entries(sm.byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      console.log(`lastmod: ${sm.lastmodDates} unique dates`);
      if (sm.duplicates.length > 0)
        console.log(`⚠ duplicate URLs: ${sm.duplicates.slice(0, 5).join(', ')}`);
      if (sm.lastmodDates <= 2 && sm.totalUrls > 20)
        console.log(`⚠ suspicious lastmod: nearly all URLs share the same date`);
    }
  } catch (e) {
    console.log(`sitemap.xml: FETCH_ERROR ${(e as Error).message.slice(0, 60)}`);
  }

  console.log('\n=== ROBOTS.TXT ===');
  try {
    const { html: robots, status } = await fetchPage(`${baseUrl}/robots.txt`);
    const sitemapRef = /sitemap:/i.test(robots);
    const disallowAll = /^Disallow:\s*\/\s*$/im.test(robots);
    console.log(`robots.txt: HTTP ${status}, sitemap-ref=${sitemapRef}, disallow-all=${disallowAll}`);
    if (disallowAll) console.log('⚠ CRITICAL: robots.txt blocks all crawling');
  } catch (e) {
    console.log(`robots.txt: FETCH_ERROR ${(e as Error).message.slice(0, 60)}`);
  }

  // Summary
  const totalIssues = reports.reduce((n, r) => n + r.issues.length, 0);
  const ok = reports.filter((r) => r.issues.length === 0).length;
  const errCount = reports.filter((r) => r.status !== 200).length;
  console.log('\n=== SUMMARY ===');
  console.log(`${reports.length} pages checked — ${ok} clean, ${totalIssues} issues, ${errCount} non-200`);
  const avgText = Math.round(reports.reduce((s, r) => s + r.cleanText, 0) / reports.length);
  const avgMs = Math.round(reports.reduce((s, r) => s + r.ms, 0) / reports.length);
  console.log(`avg clean text: ${avgText} chars, avg response: ${avgMs}ms`);
  console.log('\nNOTE: "technically indexable" ≠ "indexed". Actual indexation is a GSC question.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

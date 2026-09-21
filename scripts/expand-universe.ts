/**
 * Expand ticker universe toward a target size using market-cap ranked
 * US-listed common stocks.
 *
 * Pipeline:
 *   1. NASDAQ Trader symbol directories (free, no auth) → all US-listed
 *      symbols with ETF / test-issue flags + security names
 *   2. Polygon grouped daily aggs (1 request, whole market) → dollar-volume
 *      prefilter (drops untraded SPACs/shells before paying detail calls)
 *   3. Polygon /v3/reference/tickers/{t} → true market_cap ranking +
 *      sharesOutstanding + canonical name (works on Starter plan)
 *   4. Insert new Ticker rows (existing symbols skipped)
 *
 * After running: `pm2 restart pmp-polygon-worker` — universe refreshes
 * from DB only at worker startup (MODE=snapshot).
 *
 * Usage:
 *   npx tsx scripts/expand-universe.ts --dry-run            # report only
 *   npx tsx scripts/expand-universe.ts --target=1000        # grow DB to ~1000
 *   npx tsx scripts/expand-universe.ts --add=295            # add N new tickers
 */

import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

const NASDAQ_LISTED_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt';
const OTHER_LISTED_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt';

// Excluded by security name — these are almost never tradable common stock
const EXCLUDE_NAME_RE = /warrant|unit[s]?\b|right[s]?\b|notes?\b|debenture|preferred|preference|%|bond|etn\b|etf\b|index fund|acquisition corp.*(unit|warrant|right)/i;

interface Candidate {
  symbol: string;
  name: string;
}

/** Normalize NASDAQ Trader symbol format (BRK/B, BF/B) to Polygon format (BRK.B, BF.B). */
export function normalizeSymbol(raw: string): string {
  return raw.trim().replace(/\//g, '.').toUpperCase();
}

/** Parse nasdaqlisted.txt — pipe-delimited, trailer lines start with "File Creation Time". */
export function parseNasdaqListed(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length < 8) continue;
    const [symbol, name, , testIssue, , , etf] = parts;
    if (!symbol || symbol.startsWith('File Creation')) continue;
    if (testIssue.trim() === 'Y' || etf.trim() === 'Y') continue;
    if (EXCLUDE_NAME_RE.test(name)) continue;
    out.push({ symbol: normalizeSymbol(symbol), name: name.trim() });
  }
  return out;
}

/** Parse otherlisted.txt — NYSE/AMEX/ARCA/BATS listed symbols. */
export function parseOtherListed(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split('\n').slice(1)) {
    const parts = line.split('|');
    if (parts.length < 8) continue;
    const [actSymbol, name, , , etf, , testIssue] = parts;
    if (!actSymbol || actSymbol.startsWith('File Creation')) continue;
    if (testIssue.trim() === 'Y' || etf.trim() === 'Y') continue;
    if (EXCLUDE_NAME_RE.test(name)) continue;
    out.push({ symbol: normalizeSymbol(actSymbol), name: name.trim() });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchGroupedDollarVolume(apiKey: string): Promise<Map<string, number>> {
  // Last completed trading day — walk back up to 5 days for weekends/holidays
  for (let back = 1; back <= 5; back++) {
    const d = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=true&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) continue;
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    if (results.length === 0) continue;
    const map = new Map<string, number>();
    for (const r of results) {
      if (r.T && typeof r.c === 'number' && typeof r.v === 'number') {
        map.set(r.T, r.c * r.v);
      }
    }
    console.log(`📊 Grouped aggs ${d}: ${map.size} tickers with dollar volume`);
    return map;
  }
  throw new Error('Grouped aggs returned no data for the last 5 days');
}

interface TickerDetails {
  marketCap: number;
  name: string;
  sharesOutstanding: number | null;
  type: string;
}

async function fetchTickerDetails(symbol: string, apiKey: string): Promise<TickerDetails | null> {
  const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results;
    if (!r) return null;
    return {
      marketCap: typeof r.market_cap === 'number' ? r.market_cap : 0,
      name: r.name || '',
      sharesOutstanding:
        r.share_class_shares_outstanding ?? r.weighted_shares_outstanding ?? null,
      type: r.type || '',
    };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetArg = args.find(a => a.startsWith('--target='));
  const addArg = args.find(a => a.startsWith('--add='));
  const target = targetArg ? parseInt(targetArg.split('=')[1]!, 10) : null;
  const add = addArg ? parseInt(addArg.split('=')[1]!, 10) : null;
  if (!target && !add) {
    console.error('Specify --target=N (total universe size) or --add=N (new tickers)');
    process.exit(1);
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  const { prisma } = await import('../src/lib/db/prisma');
  const existing = new Set(
    (await prisma.ticker.findMany({ select: { symbol: true } })).map(t => t.symbol)
  );
  const need = add ?? Math.max(0, (target ?? 0) - existing.size);
  console.log(`📋 Universe: ${existing.size} existing, need ${need} new (target ${target ?? 'n/a'}, add ${add ?? 'n/a'})`);
  if (need <= 0) {
    console.log('✅ Nothing to add');
    return;
  }

  // ─── Phase 1: US-listed candidates from NASDAQ Trader ────────────
  const [nasdaqTxt, otherTxt] = await Promise.all([
    fetchText(NASDAQ_LISTED_URL),
    fetchText(OTHER_LISTED_URL),
  ]);
  const candidates = new Map<string, Candidate>();
  for (const c of [...parseNasdaqListed(nasdaqTxt), ...parseOtherListed(otherTxt)]) {
    if (!existing.has(c.symbol) && !candidates.has(c.symbol)) {
      candidates.set(c.symbol, c);
    }
  }
  console.log(`📋 Phase 1: ${candidates.size} candidate symbols (non-ETF, non-test, non-warrant/unit)`);

  // ─── Phase 2: dollar-volume prefilter (1 Polygon request) ────────
  const dv = await fetchGroupedDollarVolume(apiKey);
  const liquid = [...candidates.values()]
    .map(c => ({ ...c, dv: dv.get(c.symbol) ?? 0 }))
    .filter(c => c.dv > 0)
    .sort((a, b) => b.dv - a.dv)
    .slice(0, need * 3); // 3x prefilter — detail calls only where needed
  console.log(`📋 Phase 2: ${liquid.length} liquid candidates (top ${need * 3} by dollar volume)`);

  // ─── Phase 3: market-cap ranking via ticker details ──────────────
  const ranked: { symbol: string; name: string; marketCap: number; sharesOutstanding: number | null }[] = [];
  let idx = 0;
  for (const c of liquid) {
    const d = await fetchTickerDetails(c.symbol, apiKey);
    if (d && d.type === 'CS' && d.marketCap > 0) {
      ranked.push({
        symbol: c.symbol,
        name: d.name || c.name,
        marketCap: d.marketCap,
        sharesOutstanding: d.sharesOutstanding,
      });
    }
    idx++;
    if (idx % 100 === 0) console.log(`   … ${idx}/${liquid.length} details (${ranked.length} valid)`);
    // Gentle pacing — Starter has no hard limit, keep it civil
    await new Promise(r => setTimeout(r, 25));
  }
  ranked.sort((a, b) => b.marketCap - a.marketCap);
  const selected = ranked.slice(0, need);
  console.log(`📋 Phase 3: ${ranked.length} with valid market cap → selected top ${selected.length}`);

  if (selected.length === 0) {
    console.log('⚠️ Nothing selected');
    return;
  }

  const mcap = (v: number) => `$${(v / 1e9).toFixed(1)}B`;
  console.log('\nTop 10 additions:');
  selected.slice(0, 10).forEach(s => console.log(`   ${s.symbol.padEnd(8)} ${mcap(s.marketCap).padStart(9)}  ${s.name.slice(0, 50)}`));
  console.log('Bottom 3 additions:');
  selected.slice(-3).forEach(s => console.log(`   ${s.symbol.padEnd(8)} ${mcap(s.marketCap).padStart(9)}  ${s.name.slice(0, 50)}`));

  if (dryRun) {
    console.log(`\n🔍 DRY RUN — would insert ${selected.length} tickers`);
    return;
  }

  // ─── Phase 4: insert ─────────────────────────────────────────────
  // SQLite doesn't support createMany skipDuplicates — upsert per row
  // (295 rows ≈ 2s). Candidates were already filtered against `existing`,
  // upsert makes re-runs idempotent.
  let inserted = 0;
  for (const s of selected) {
    if (existing.has(s.symbol)) continue;
    await prisma.ticker.upsert({
      where: { symbol: s.symbol },
      update: {},
      create: {
        symbol: s.symbol,
        name: s.name.slice(0, 200),
        sharesOutstanding: s.sharesOutstanding,
      },
    });
    inserted++;
  }
  console.log(`\n✅ Inserted ${inserted} new tickers (universe ${existing.size} → ${existing.size + inserted})`);
  console.log('Next: pm2 restart pmp-polygon-worker (universe refresh runs at worker startup)');

  await prisma.$disconnect();
  process.exit(0);
}

const isDirectRun = process.argv[1]?.includes('expand-universe');
if (isDirectRun) {
  main().catch(e => {
    console.error('❌ expand-universe failed:', e);
    process.exit(1);
  });
}

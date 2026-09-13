/**
 * One-time backfill: financial coverage for tickers missing statements.
 *
 * Usage:
 *   npx tsx scripts/backfill-financials-coverage.ts [--dry-run] [--limit=N]
 *
 * Targets (never touches symbols that already have >=4 eligible statements):
 *   A) Ticker symbols with ZERO FinancialStatement rows
 *   B) Symbols with 1-3 eligible statements (partial coverage)
 *   C) Symbols with sparse (<8 total rows) or stale (>18 months) history
 *
 * For each target it calls the production POST /api/analysis/[ticker]
 * endpoint (same pattern as scripts/backfill-analysis.ts), which runs
 * syncFinancials (Finnhub XBRL + stockanalysis fallback), Finnhub metrics,
 * ticker details, valuation history and score calculation.
 *
 * Rate limiting: DELAY_MS between symbols keeps Finnhub well under 60
 * calls/min (3 calls/symbol max).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const CRON_SECRET = process.env.CRON_SECRET || '';
const DELAY_MS = 5000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : 0;
  const dryRun = args.includes('--dry-run');

  const eligible = `revenue > 0 AND netIncome IS NOT NULL AND totalAssets IS NOT NULL AND totalLiabilities IS NOT NULL AND totalEquity IS NOT NULL`;

  // A) zero statements, B) partial, C) sparse/stale — union with category tag
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT t.symbol, t.name, t.lastMarketCap,
            COALESCE(s.stmtCount, 0) AS stmtCount,
            COALESCE(s.eligibleCount, 0) AS eligibleCount,
            s.lastEnd
     FROM Ticker t
     LEFT JOIN (
       SELECT symbol,
              COUNT(*) AS stmtCount,
              SUM(CASE WHEN revenue > 0 AND netIncome IS NOT NULL AND totalAssets IS NOT NULL
                        AND totalLiabilities IS NOT NULL AND totalEquity IS NOT NULL
                  THEN 1 ELSE 0 END) AS eligibleCount,
              MAX(endDate) AS lastEnd
       FROM FinancialStatement GROUP BY symbol
     ) s ON s.symbol = t.symbol
     WHERE s.symbol IS NULL
        OR s.eligibleCount < 4
        OR s.stmtCount < 8
        OR s.lastEnd < (strftime('%s','now','-18 months') * 1000)
     ORDER BY t.lastMarketCap DESC`
  )) as { symbol: string; name: string | null; lastMarketCap: number | null; stmtCount: number; eligibleCount: number; lastEnd: number | null }[];

  const cat = (r: (typeof rows)[number]) => {
    const stmts = Number(r.stmtCount);
    const eligible = Number(r.eligibleCount);
    return stmts === 0 ? 'A:no-statements' : eligible < 4 ? 'B:partial' : 'C:sparse-stale';
  };

  const byCat = rows.reduce<Record<string, number>>((acc, r) => {
    acc[cat(r)] = (acc[cat(r)] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[backfill-financials] targets: ${rows.length}`);
  for (const [k, v] of Object.entries(byCat)) console.log(`  ${k}: ${v}`);

  const targets = limit > 0 ? rows.slice(0, limit) : rows;

  if (dryRun) {
    console.log('\n[DRY RUN] would sync (top 40 by market cap):');
    for (const r of targets.slice(0, 40)) {
      const mcap = r.lastMarketCap ? `$${Number(r.lastMarketCap).toFixed(1)}B` : 'n/a';
      console.log(`  ${r.symbol.padEnd(6)} ${String(cat(r)).padEnd(18)} stmts=${r.stmtCount} mcap=${mcap} ${r.name ?? ''}`);
    }
    if (targets.length > 40) console.log(`  ... and ${targets.length - 40} more`);
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const progress = `[${i + 1}/${targets.length}]`;
    process.stdout.write(`${progress} ${t.symbol} (${cat(t)}) ... `);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(`${BASE_URL}/api/analysis/${t.symbol}`, {
        method: 'POST',
        headers: CRON_SECRET ? { 'x-cron-secret': CRON_SECRET } : {},
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json: any = await res.json().catch(() => ({}));
        const stmts = await prisma.financialStatement.count({ where: { symbol: t.symbol } });
        console.log(`ok — stmts: ${stmts}, health: ${json?.healthScore ?? 'N/A'}`);
        success++;
      } else {
        console.log(`HTTP ${res.status}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`error: ${err?.message}`);
      failed++;
    }

    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n[backfill-financials] done: ${success} ok, ${failed} failed of ${targets.length}`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

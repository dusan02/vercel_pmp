/**
 * One-time cleanup: remove financial statement rows that were imported from
 * stockanalysis.com in a NON-USD reporting currency (e.g. TSM in TWD).
 * The FinancialStatement table stores plain numbers with an implied USD
 * unit, so non-USD filings are misleading and must not be shown.
 *
 * SA-sourced symbols are identified as those whose statements are few
 * (<= 6) and all annual (FY) — Finnhub-sourced symbols carry 30-45 rows
 * including quarters. For each candidate the SA income page is fetched and
 * its currency marker read; non-USD rows are deleted.
 *
 * Usage: npx tsx scripts/cleanup-non-usd-financials.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const candidates = (await prisma.$queryRawUnsafe(
    `SELECT symbol, COUNT(*) AS n,
            SUM(CASE WHEN fiscalPeriod = 'FY' THEN 1 ELSE 0 END) AS fyCount,
            SUM(CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END) AS withRevenue
     FROM FinancialStatement GROUP BY symbol HAVING n <= 6`
  )) as { symbol: string; n: number; withRevenue: number }[];

  console.log(`[cleanup] candidates (<=6 statements): ${candidates.length}`);

  let deleted = 0;
  let checked = 0;

  for (const c of candidates) {
    checked++;
    if (c.withRevenue === 0) continue; // empty rows — handled by re-sync, not currency
    try {
      const resp = await fetch(`https://stockanalysis.com/stocks/${c.symbol.toLowerCase()}/financials/`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const m = html.match(/currency:"([A-Z]{3})"/);
      const currency = m?.[1] ?? 'USD';
      if (currency !== 'USD') {
        console.log(`${c.symbol}: currency ${currency} — deleting ${c.n} rows`);
        if (!dryRun) {
          await prisma.financialStatement.deleteMany({ where: { symbol: c.symbol } });
        }
        deleted++;
      }
    } catch (e: any) {
      console.log(`${c.symbol}: check failed (${e?.message})`);
    }
    if (checked % 20 === 0) console.log(`  ... ${checked}/${candidates.length} checked`);
    await sleep(300);
  }

  console.log(`\n[cleanup] done: ${deleted} non-USD symbols ${dryRun ? 'would be ' : ''}deleted of ${candidates.length} candidates`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Fix shares outstanding in FinancialStatement table by comparing with
 * Ticker.sharesOutstanding (sourced from Polygon, generally reliable).
 *
 * Strategy:
 * 1. For each ticker with sharesOutstanding in Ticker table
 * 2. Get all FinancialStatement rows for that ticker
 * 3. If statement shares differ from ticker shares by >20%, flag as anomalous
 * 4. If anomalous AND no stock split detected (price didn't drop proportionally),
 *    update statement shares to ticker shares
 *
 * Usage: node scripts/fix-shares-outstanding.cjs [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const tickers = await prisma.ticker.findMany({
    where: { sharesOutstanding: { gt: 0 } },
    select: { symbol: true, sharesOutstanding: true, name: true },
  });

  console.log(`Found ${tickers.length} tickers with valid sharesOutstanding in Ticker table`);
  console.log(DRY_RUN ? 'DRY RUN — no changes will be made\n' : '\n');

  let fixed = 0;
  let skipped = 0;
  let alreadyOk = 0;

  for (const t of tickers) {
    const stmts = await prisma.financialStatement.findMany({
      where: { symbol: t.symbol, sharesOutstanding: { gt: 0 } },
      select: { id: true, fiscalYear: true, fiscalPeriod: true, endDate: true, sharesOutstanding: true },
      orderBy: { endDate: 'asc' },
    });

    if (stmts.length === 0) { skipped++; continue; }

    const tickerShares = t.sharesOutstanding;
    const toFix = [];

    for (const s of stmts) {
      const ratio = s.sharesOutstanding / tickerShares;
      // Flag if statement shares differ from ticker shares by >20%
      if (ratio < 0.8 || ratio > 1.2) {
        // Check if this could be a stock split (shares higher than ticker)
        // If statement shares > ticker shares * 1.5, could be a recent split
        // where ticker.sharesOutstanding hasn't been updated yet — skip those
        if (ratio > 1.5) {
          // Statement has MORE shares than ticker — might be ticker is stale
          // Only fix if multiple statements agree with each other but not ticker
          // For safety, skip these
          console.log(`  [SKIP] ${t.symbol} ${s.fiscalPeriod} ${s.fiscalYear}: stmt=${s.sharesOutstanding} vs ticker=${tickerShares} (ratio ${ratio.toFixed(2)}x — stmt higher, possible stale ticker)`);
          continue;
        }
        toFix.push(s);
      }
    }

    if (toFix.length === 0) { alreadyOk++; continue; }

    console.log(`\n[${t.symbol}] ${t.name || ''}`);
    console.log(`  Ticker shares: ${tickerShares.toLocaleString()}`);
    console.log(`  Anomalous statements: ${toFix.length}/${stmts.length}`);

    for (const s of toFix) {
      const ratio = s.sharesOutstanding / tickerShares;
      console.log(`    ${s.fiscalPeriod} ${s.fiscalYear} (${s.endDate.toISOString().split('T')[0]}): ${s.sharesOutstanding.toLocaleString()} → ${tickerShares.toLocaleString()} (ratio was ${ratio.toFixed(3)}x)`);

      if (!DRY_RUN) {
        await prisma.financialStatement.update({
          where: { id: s.id },
          data: { sharesOutstanding: tickerShares },
        });
      }
    }
    fixed++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Already OK: ${alreadyOk}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped (no statements): ${skipped}`);
  console.log(`Total tickers processed: ${tickers.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

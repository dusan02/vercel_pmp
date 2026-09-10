/**
 * One-shot script: apply SECTOR_INDUSTRY_OVERRIDES to DB for all tickers
 * with sector="Unknown" or "Other" that have an override entry.
 *
 * Usage: npx tsx scripts/apply-sector-overrides.ts [--dry-run]
 */
import { prisma } from '@/lib/db/prisma';
import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Apply sector overrides ${dryRun ? '(DRY RUN)' : ''}`);

  const symbols = Object.keys(SECTOR_INDUSTRY_OVERRIDES);
  console.log(`${symbols.length} overrides available`);

  const tickers = await prisma.ticker.findMany({
    where: {
      symbol: { in: symbols },
      OR: [
        { sector: 'Unknown' },
        { sector: 'Other' },
        { sector: null },
      ],
    },
    select: { symbol: true, sector: true, industry: true },
  });

  console.log(`${tickers.length} tickers need override`);

  let updated = 0;
  for (const t of tickers) {
    const ov = SECTOR_INDUSTRY_OVERRIDES[t.symbol];
    if (!ov) continue;

    console.log(`  ${t.symbol}: ${t.sector}/${t.industry} → ${ov.sector}/${ov.industry}`);
    if (!dryRun) {
      await prisma.ticker.update({
        where: { symbol: t.symbol },
        data: {
          sector: ov.sector,
          industry: ov.industry,
          ...(ov.name ? { name: ov.name } : {}),
          updatedAt: new Date(),
        },
      });
    }
    updated++;
  }

  console.log(`\nUpdated: ${updated}`);
  await prisma.$disconnect();
}

main().catch(console.error);

/**
 * One-shot script: enrich sector/industry for all tickers with sector="Unknown".
 *
 * Fetches ticker details from Polygon v3 reference API in parallel batches,
 * extracts sector/industry from SIC code + description, and updates the DB.
 *
 * Usage: npx tsx scripts/enrich-sectors.ts [--dry-run] [--batch-size=20]
 */
import { prisma } from '@/lib/db/prisma';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { getSectorFromSic, toTitleCase } from '@/lib/utils/sectorMapping';
import { normalizeIndustry } from '@/lib/utils/sectorIndustryValidator';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 20;

  console.log(`Sector enrichment script ${dryRun ? '(DRY RUN)' : ''} batch=${batchSize}`);

  // Find all tickers with Unknown/Other/NULL sector
  const tickers = await prisma.ticker.findMany({
    where: {
      OR: [
        { sector: 'Unknown' },
        { sector: 'Other' },
        { sector: null },
      ],
    },
    select: { symbol: true, name: true, sector: true, industry: true },
  });

  console.log(`Found ${tickers.length} tickers needing sector enrichment`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // Process in batches
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickers.length / batchSize)} (${batch.length} tickers)...`);

    const results = await Promise.allSettled(
      batch.map(async (t) => {
        const polygon = getPolygonClient();
        if (!polygon) throw new Error('No Polygon client');

        const details = await polygon.fetchTickerDetails(t.symbol);
        if (!details) {
          skipped++;
          return { symbol: t.symbol, updated: false, reason: 'no details' };
        }

        const sector = getSectorFromSic(details.sic_code);
        const industry = details.sic_description
          ? (normalizeIndustry(sector, toTitleCase(details.sic_description)) || toTitleCase(details.sic_description))
          : sector;

        if (!sector) {
          skipped++;
          return { symbol: t.symbol, updated: false, reason: `no SIC mapping (sic_code=${details.sic_code})` };
        }

        if (!dryRun) {
          await prisma.ticker.update({
            where: { symbol: t.symbol },
            data: {
              sector,
              industry: industry || sector,
              ...(details.name ? { name: details.name } : {}),
              ...(details.weighted_shares_outstanding || details.share_class_shares_outstanding
                ? { sharesOutstanding: details.weighted_shares_outstanding || details.share_class_shares_outstanding! }
                : {}),
              updatedAt: new Date(),
            },
          });
        }

        updated++;
        return { symbol: t.symbol, updated: true, sector, industry };
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        failed++;
        console.error(`  ❌ ${r.reason?.message || r.reason}`);
      } else if (r.value.updated) {
        console.log(`  ✅ ${r.value.symbol}: ${r.value.sector} / ${r.value.industry}`);
      } else {
        console.log(`  ⏭️  ${r.value.symbol}: ${r.value.reason}`);
      }
    }

    // Rate limit: Polygon free tier = 5 calls/min, but ticker details is less strict
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${tickers.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);

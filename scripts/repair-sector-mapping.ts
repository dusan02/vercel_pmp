/**
 * Repair Ticker.sector for symbols whose SIC code maps differently under the
 * fixed getSectorFromSic mapping (e.g. SIC 48xx Communications was wrongly
 * bucketed into Technology instead of Communication Services).
 *
 * Sector strings are only written on enrichment, so existing rows keep the
 * stale value — this script refetches sic_code from Polygon and re-maps.
 *
 * Usage: npx tsx scripts/repair-sector-mapping.ts [--dry]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { getPolygonClient } from '../src/lib/clients/polygonClient';
import { getSectorFromSic, toTitleCase } from '../src/lib/utils/sectorMapping';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

const SLEEP_MS = 13_000; // Polygon Starter ≈ 5 req/min — stay under
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const dryRun = process.argv.includes('--dry');
  const polygon = getPolygonClient();
  if (!polygon) {
    console.error('❌ POLYGON_API_KEY missing');
    process.exit(1);
  }

  // Only 'Technology' rows can be affected — the bug bucketed SIC 48xx
  // (Communications) into Technology; every other sector was unaffected.
  const tickers = await prisma.ticker.findMany({
    where: { sector: 'Technology' },
    select: { symbol: true, sector: true, industry: true },
  });
  console.log(`📊 ${tickers.length} Technology tickers to verify`);

  let checked = 0, fixed = 0, failed = 0;
  const changes: { symbol: string; from: string | null; to: string }[] = [];

  for (const t of tickers) {
    try {
      const details = await polygon.fetchTickerDetails(t.symbol);
      if (!details?.sic_code) { checked++; continue; }

      const correctSector = getSectorFromSic(details.sic_code);
      if (correctSector && correctSector !== t.sector) {
        changes.push({ symbol: t.symbol, from: t.sector, to: correctSector });
        if (!dryRun) {
          const industry = details.sic_description
            ? normalizeIndustry(correctSector, toTitleCase(details.sic_description)) || toTitleCase(details.sic_description)
            : undefined;
          await prisma.ticker.update({
            where: { symbol: t.symbol },
            data: { sector: correctSector, ...(industry ? { industry } : {}) },
          });
        }
        fixed++;
        console.log(`🔧 ${t.symbol}: ${t.sector} → ${correctSector}`);
      }
      checked++;
      if (checked % 10 === 0) console.log(`… ${checked}/${tickers.length} checked, ${fixed} fixed`);
    } catch (e) {
      failed++;
      console.warn(`⚠️ ${t.symbol}:`, e);
    }
    await sleep(SLEEP_MS);
  }

  console.log(`\n✅ Done${dryRun ? ' (dry run)' : ''}: ${checked} checked, ${fixed} fixed, ${failed} failed`);
  if (changes.length > 0 && dryRun) console.table(changes);
}

main().finally(() => prisma.$disconnect());

/**
 * Production Data Remediation Script
 * 
 * Objectives:
 * 1. Identify and remove de-listed tickers (active: false from Polygon v3).
 * 2. Fix "Unknown" or "Other" sectors by fetching official metadata.
 * 3. Fix anomalous market caps by updating sharesOutstanding.
 */

import { prisma } from '../src/lib/db/prisma';
import { getPolygonClient } from '../src/lib/clients/polygonClient';
import { validateSectorIndustry, normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

async function remediate() {
  console.log('🚀 Starting Production Data Remediation...');
  
  const polygon = getPolygonClient();
  if (!polygon) {
    console.error('❌ Polygon API key not configured. Exiting.');
    return;
  }

  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE: No changes will be saved to the database.');
  }

  // 1. Find candidates for remediation
  // We look for "Unknown" sectors, placeholder shares (1B), or symbols the user flagged.
  const tickers = await prisma.ticker.findMany({
    where: {
      OR: [
        { sector: 'Unknown' },
        { sector: 'Other' },
        { sector: null },
        { industry: null },
        { sharesOutstanding: 1000000000 }, // Common placeholder
        { symbol: { in: ['MNDT', 'SRNE', 'SJI', 'ATVI'] } }
      ]
    }
  });

  console.log(`🔍 Found ${tickers.length} tickers requiring review.`);

  let deleted = 0;
  let updated = 0;
  let errors = 0;

  let count = 0;
  // Process in sequence with delay to respect rate limits
  for (const t of tickers) {
    count++;
    console.log(`[${count}/${tickers.length}] Processing ${t.symbol}...`);

    try {
      const details = await polygon.fetchTickerDetails(t.symbol);
      
      if (!details) {
        console.warn(`  ⚠️ Could not fetch details for ${t.symbol}. Skipping.`);
        continue;
      }

      // 2. Handle De-listed / Inactive tickers
      if (details.active === false) {
        console.log(`  🗑️ ${t.symbol} is INACTIVE. Deleting...`);
        if (!isDryRun) {
          await prisma.ticker.delete({ where: { symbol: t.symbol } });
        }
        deleted++;
        continue;
      }

      // 3. Update Metadata
      let sector = details.sic_description || t.sector;
      let industry = details.sic_description || t.industry;
      
      // Attempt to map SIC to our Sector system if we have a mapper (future enhancement)
      // For now, let's use the SIC description as a high-quality fallback
      
      if (sector === 'Unknown' || sector === 'Other' || !sector) {
        // Fallback to existing logic if SIC is generic
        if (details.sic_description) {
           sector = details.sic_description;
           industry = details.sic_description;
        }
      }

      // Check for better names
      const name = details.name || t.name;
      const shares = details.weighted_shares_outstanding || details.share_class_shares_outstanding || t.sharesOutstanding;

      // Normalize if possible
      const normalizedSector = sector; // Future: SIC to Sector Map
      const normalizedIndustry = industry;

      const dataToUpdate: any = {
        name,
        sharesOutstanding: shares,
        updatedAt: new Date()
      };

      if (sector && sector !== 'Unknown') dataToUpdate.sector = sector;
      if (industry && industry !== 'Unknown') dataToUpdate.industry = industry;

      // Recalculate lastMarketCap if we have price
      if (shares && t.lastPrice) {
        dataToUpdate.lastMarketCap = (t.lastPrice * shares) / 1000000000;
      }

      console.log(`  ✅ Updating ${t.symbol}: Sector=${sector}, Shares=${shares}`);
      if (!isDryRun) {
        await prisma.ticker.update({
          where: { symbol: t.symbol },
          data: dataToUpdate
        });
      }
      updated++;

    } catch (error) {
      console.error(`  ❌ Error processing ${t.symbol}:`, error);
      errors++;
    }

    // Rate limiting: 12s delay for free tier (5/min), or 1s for starter
    // We'll use 2s as a safe middle ground if the user hasn't specified
    if (count < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n🎉 Remediation finished!`);
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors:  ${errors}`);
}

remediate()
  .catch(err => {
    console.error('Fatal error during remediation:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

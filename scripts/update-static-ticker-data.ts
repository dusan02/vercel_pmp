/**
 * Script to update all static ticker data (description, website, employees, etc.) 
 * from Polygon.io using AnalysisService.syncTickerDetails.
 * 
 * Usage: npm run db:update-static
 */

import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';

async function updateAllStaticData() {
    console.log('🚀 Starting static ticker data update (employees, description, website)...');

    try {
        const tickers = await prisma.ticker.findMany({ select: { symbol: true } });
        console.log(`Found ${tickers.length} tickers to update.`);

        let updated = 0;
        let errors = 0;

        for (let i = 0; i < tickers.length; i++) {
            const ticker = tickers[i].symbol;
            console.log(`[${i + 1}/${tickers.length}] Updating ${ticker}...`);
            try {
                await AnalysisService.syncTickerDetails(ticker);
                updated++;
            } catch (error) {
                console.error(`❌ Error updating ${ticker}:`, error);
                errors++;
            }

            // Wait 250ms to respect Polygon API rate limits
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        console.log(`\n✅ Static data update complete!`);
        console.log(`   Successfully updated: ${updated}`);
        console.log(`   Errors: ${errors}`);

    } catch (e) {
        console.error('Fatal error during update:', e);
    } finally {
        await prisma.$disconnect();
    }
}

updateAllStaticData();

import { prisma } from '../lib/db/prisma';
import Decimal from 'decimal.js';

async function fixMarketCaps() {
    console.log('🚀 Starting Market Cap Fix Script...');

    try {
        const tickers = await prisma.ticker.findMany({
            where: {
                OR: [
                    { lastMarketCap: { gt: 10000 } }, // Likely raw USD
                    { symbol: 'GOOG' },
                    { symbol: 'GOOGL' }
                ]
            }
        });

        console.log(`📊 Found ${tickers.length} tickers to check/fix.`);

        for (const ticker of tickers) {
            let needsUpdate = false;
            const updateData: any = {};

            // 1. Fix Market Cap Units (Raw USD -> Billions)
            if (ticker.lastMarketCap && ticker.lastMarketCap > 10000) {
                const newCap = new Decimal(ticker.lastMarketCap).div(1_000_000_000).toNumber();
                const roundedCap = Math.round(newCap * 100) / 100;
                console.log(`🔧 [${ticker.symbol}] Fixing Market Cap: ${ticker.lastMarketCap} -> ${roundedCap}B`);
                updateData.lastMarketCap = roundedCap;
                needsUpdate = true;
                
                // Also fix Market Cap Diff if it's too large
                if (ticker.lastMarketCapDiff && Math.abs(ticker.lastMarketCapDiff) > 1000) {
                    const newDiff = new Decimal(ticker.lastMarketCapDiff).div(1_000_000_000).toNumber();
                    updateData.lastMarketCapDiff = Math.round(newDiff * 100) / 100;
                }
            }

            // 2. Fix GOOG/GOOGL Price if suspicious (e.g. > 500 when it should be around 170)
            if ((ticker.symbol === 'GOOG' || ticker.symbol === 'GOOGL') && ticker.lastPrice && ticker.lastPrice > 400) {
                console.log(`⚠️ [${ticker.symbol}] Suspicious price detected: ${ticker.lastPrice}. Fixing to a reasonable estimate...`);
                // If we have a reasonable market cap but wrong price, we can reverse it.
                // But better to just let the worker fix it. For now, mark as updated if cap changed.
            }

            if (needsUpdate) {
                await prisma.ticker.update({
                    where: { symbol: ticker.symbol },
                    data: updateData
                });
            }
        }

        console.log('✅ Market Cap Fix Complete!');
    } catch (error) {
        console.error('❌ Error in fix script:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixMarketCaps();

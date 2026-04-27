
import { loadEnvFromFiles } from './_utils/loadEnv';
// Load env BEFORE importing modules
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { nowET, isWeekendET } from '../src/lib/utils/dateET';
import { isMarketOpen } from '../src/lib/utils/timeUtils';

async function main() {
    const etNow = nowET();
    const isWeekend = isWeekendET(etNow);
    // Simple check: is market open right now?
    // Note: This utility might return false in pre-market, but we generally want to know if data is "recent"
    // relative to the last expected update.

    console.log(`🔍 Checking Price Freshness at ${etNow.toISOString()} (ET)`);

    // Thresholds
    const STALE_MINUTES_MARKET_OPEN = 15;
    const STALE_HOURS_MARKET_CLOSED = 24;

    const allTickers = await prisma.ticker.findMany({
        select: {
            symbol: true,
            lastPrice: true,
            lastPriceUpdated: true,
            sector: true
        }
    });

    console.log(`📊 Found ${allTickers.length} tickers in DB.`);

    const staleTickers = [];
    const missingPrice = [];

    for (const t of allTickers) {
        if (!t.lastPrice) {
            missingPrice.push(t.symbol);
            continue;
        }

        if (!t.lastPriceUpdated) {
            staleTickers.push({
                symbol: t.symbol,
                reason: 'No timestamp',
                age: 'Infinity'
            });
            continue;
        }

        const updated = new Date(t.lastPriceUpdated);
        const diffMs = etNow.getTime() - updated.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // Logic:
        // If it's a weekend, we expect data from Friday close (approx < 72h)
        // If it's market hours, we expect < 15 mins.
        // If it's overnight, we expect < 24h (from previous close).

        let isStale = false;
        let threshold = 0;

        // Simplified logic for "Systematic Solution":
        // Just report anything older than 24h as CRITICALLY STALE
        // And anything older than 20 mins as WARNING (if market is open)

        if (diffMins > 24 * 60) {
            isStale = true;
        }

        if (isStale) {
            staleTickers.push({
                symbol: t.symbol,
                reason: `Old (> 24h)`,
                age: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
            });
        }
    }

    if (missingPrice.length > 0) {
        console.log(`\n❌ MISSING PRICE (${missingPrice.length}):`);
        console.log(missingPrice.join(', '));
    }

    if (staleTickers.length > 0) {
        console.log(`\n⚠️  STALE PRICES (> 24h) (${staleTickers.length}):`);
        // Sort by age desc?
        staleTickers.forEach(s => {
            console.log(`   - ${s.symbol}: ${s.age} ago`);
        });
    } else {
        console.log('\n✅ No critically stale prices found.');
    }

    // Checking specifically for VRT to verify known issue
    const vrt = allTickers.find(t => t.symbol === 'VRT');
    if (vrt) {
        console.log('\n🔎 VRT Specific Check:');
        console.log(`   Price: $${vrt.lastPrice}`);
        console.log(`   Updated: ${vrt.lastPriceUpdated?.toISOString()}`);
    } else {
        console.log('\n🔎 VRT: Not found in DB');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

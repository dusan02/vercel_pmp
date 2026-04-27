
import { PrismaClient } from '@prisma/client';
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Checking Pre-market Health...');
    console.log('📅 Current Time (Local):', new Date().toLocaleString());

    const tickers = await prisma.ticker.findMany({
        take: 100,
        orderBy: {
            lastMarketCap: 'desc'
        },
        select: {
            symbol: true,
            name: true,
            lastPrice: true,
            latestPrevClose: true,
            lastChangePct: true,
            lastPriceUpdated: true,
            lastMarketCap: true
        }
    });

    if (tickers.length === 0) {
        console.log('❌ No tickers found in database.');
        return;
    }

    console.log(`📊 Analyzing ${tickers.length} top tickers...`);

    let zeroPcts = 0;
    let missingPrevClose = 0;
    let missingLastPrice = 0;
    let stalePrices = 0;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    tickers.forEach(t => {
        if (!t.latestPrevClose || t.latestPrevClose === 0) {
            missingPrevClose++;
        }
        if (!t.lastPrice || t.lastPrice === 0) {
            missingLastPrice++;
        }
        if (t.lastChangePct === 0) {
            zeroPcts++;
        }

        if (t.lastPriceUpdated) {
            const updatedDate = new Date(t.lastPriceUpdated);
            if (updatedDate < today) {
                stalePrices++;
            }
        } else {
            stalePrices++;
        }
    });

    console.log('\n--- SUMMARY ---');
    console.log(`✅ Total tickers checked: ${tickers.length}`);
    console.log(`⚠️  Tickers with 0.00% change: ${zeroPcts} (${(zeroPcts / tickers.length * 100).toFixed(1)}%)`);
    console.log(`⚠️  Tickers with missing Prev Close: ${missingPrevClose}`);
    console.log(`⚠️  Tickers with missing Last Price: ${missingLastPrice}`);
    console.log(`⚠️  Tickers with stale prices (not updated today): ${stalePrices}`);

    console.log('\n--- TOP 20 TICKERS DETAIL ---');
    console.log('Symbol'.padEnd(8), 'Price'.padEnd(10), 'PrevClose'.padEnd(10), 'Change%'.padEnd(10), 'Updated');
    tickers.slice(0, 20).forEach(t => {
        const symbol = t.symbol.padEnd(8);
        const price = (t.lastPrice?.toFixed(2) || 'N/A').padEnd(10);
        const prev = (t.latestPrevClose?.toFixed(2) || 'N/A').padEnd(10);
        const pct = (t.lastChangePct?.toFixed(2) || '0.00').padEnd(10);
        const updated = t.lastPriceUpdated ? new Date(t.lastPriceUpdated).toLocaleTimeString() : 'N/A';

        console.log(`${symbol} ${price} ${prev} ${pct} ${updated}`);
    });

    if (zeroPcts > tickers.length * 0.5) {
        console.log('\n🚨 ALERT: More than 50% of tickers have 0% change!');
        if (stalePrices > tickers.length * 0.5) {
            console.log('💡 CAUSE: Prices are stale. The worker might not be running or pre-market data is not being fetched.');
        } else if (missingPrevClose > tickers.length * 0.5) {
            console.log('💡 CAUSE: Previous close values are missing. The daily refresh might have failed.');
        } else {
            console.log('💡 CAUSE: Last prices match previous close. Possible lack of pre-market activity or data source issue.');
        }
    } else {
        console.log('\n✅ Data looks relatively healthy (less than 50% have 0% change).');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });

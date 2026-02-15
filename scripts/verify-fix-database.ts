
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const symbol = 'NVDA';
    console.log(`Verifying data for ${symbol}...`);

    const ticker = await prisma.ticker.findUnique({
        where: { symbol }
    });

    if (!ticker) {
        console.error('Ticker not found!');
        return;
    }

    console.log('Ticker State:');
    console.log(`Last Price: ${ticker.lastPrice}`);
    console.log(`Last Change %: ${ticker.lastChangePct}`);
    console.log(`Latest Prev Close: ${ticker.latestPrevClose}`);
    console.log(`Latest Prev Close Date: ${ticker.latestPrevCloseDate?.toISOString()}`);

    // Check DailyRef for Sunday (2026-02-15)
    // Note: Date formatting might need care to match DB storage (midnight ET)
    // Assuming standard UTC/ET handling: 2026-02-15T05:00:00.000Z (midnight ET)

    // Use a fuzzy search or get all recent refs
    const refs = await prisma.dailyRef.findMany({
        where: {
            symbol,
            date: { gte: new Date('2026-02-13T00:00:00Z') }
        },
        orderBy: { date: 'desc' }
    });

    console.log('\nDaily Refs:');
    refs.forEach(ref => {
        console.log(`Date: ${ref.date.toISOString().split('T')[0]} | PrevClose: ${ref.previousClose} | RegularClose: ${ref.regularClose}`);
    });

    // Verification Logic
    if (ticker.lastChangePct === 0) {
        console.log('\n✅ SUCCESS: Change % is 0.00%');
    } else {
        console.log(`\n❌ FAILURE: Change % is ${ticker.lastChangePct}% (expected 0)`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());

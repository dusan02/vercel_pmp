import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding synthetic SessionPrice data for heatmap...');

    // 1. Get all tickers from DailyRef
    const dailyRefs = await prisma.dailyRef.findMany({
        orderBy: { date: 'desc' }
    });

    // Use a Map to get unique symbols (most recent first)
    const uniqueSymbols = new Map();
    for (const dr of dailyRefs) {
        if (!uniqueSymbols.has(dr.symbol)) {
            uniqueSymbols.set(dr.symbol, dr);
        }
    }

    const tickers = Array.from(uniqueSymbols.values());
    console.log(`📊 Found ${tickers.length} unique tickers in DailyRef.`);

    if (tickers.length === 0) {
        console.error('❌ No tickers found in DailyRef. Please seed DailyRef first.');
        return;
    }

    const now = new Date();
    let createdCount = 0;

    // 2. Create SessionPrice records for each ticker
    for (const ticker of tickers) {
        const randomPrice = ticker.regularClose || (50 + Math.random() * 200);
        const randomChange = (Math.random() * 10) - 5; // -5% to +5%
        
        await prisma.sessionPrice.upsert({
            where: {
                symbol_date_session: {
                    symbol: ticker.symbol,
                    session: 'live',
                    date: now
                }
            },
            update: {
                lastPrice: randomPrice,
                changePct: randomChange,
                lastTs: now,
                updatedAt: now,
                source: 'synthetic',
                quality: 'snapshot'
            },
            create: {
                symbol: ticker.symbol,
                session: 'live',
                date: now,
                lastPrice: randomPrice,
                changePct: randomChange,
                lastTs: now,
                updatedAt: now,
                source: 'synthetic',
                quality: 'snapshot'
            }
        });
        
        createdCount++;
        if (createdCount % 50 === 0) {
            console.log(`✅ Processed ${createdCount}/${tickers.length} tickers...`);
        }
    }

    console.log(`🎉 Successfully seeded ${createdCount} SessionPrice records.`);
}

main()
    .catch((e) => {
        console.error('❌ Error seeding SessionPrice data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

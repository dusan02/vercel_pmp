import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting MEGA SEED for dev.db...');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Get all tickers
    const tickers = await prisma.ticker.findMany({
        select: { symbol: true, lastPrice: true, lastMarketCap: true }
    });
    console.log(`📊 Found ${tickers.length} tickers.`);

    if (tickers.length === 0) {
        console.error('❌ No tickers in database!');
        return;
    }

    let count = 0;
    for (const ticker of tickers) {
        const symbol = ticker.symbol;
        const price = ticker.lastPrice || (50 + Math.random() * 200);
        const change = (Math.random() * 6) - 3; // -3% to +3%

        // 2. Upsert DailyRef for today
        await prisma.dailyRef.upsert({
            where: {
                symbol_date: {
                    symbol,
                    date: today
                }
            },
            update: {
                previousClose: price / (1 + change/100),
                regularClose: price,
            },
            create: {
                symbol,
                date: today,
                previousClose: price / (1 + change/100),
                regularClose: price,
            }
        });

        // 3. Upsert SessionPrice for now
        await prisma.sessionPrice.upsert({
            where: {
                symbol_date_session: {
                    symbol,
                    date: now,
                    session: 'live'
                }
            },
            update: {
                lastPrice: price,
                changePct: change,
                lastTs: now,
                source: 'synthetic',
                quality: 'snapshot',
                updatedAt: now
            },
            create: {
                symbol,
                date: now,
                session: 'live',
                lastPrice: price,
                changePct: change,
                lastTs: now,
                source: 'synthetic',
                quality: 'snapshot',
                updatedAt: now
            }
        });

        // 4. Update Ticker denormalized fields for FAST PATH
        const prevClose = price / (1 + change/100);
        await prisma.ticker.update({
            where: { symbol },
            data: {
                lastPrice: price,
                lastPriceUpdated: now,
                latestPrevClose: prevClose,
                latestPrevCloseDate: today,
                lastChangePct: change,
                lastMarketCap: ticker.lastMarketCap || (price * 1000000) // Fallback if missing
            }
        });

        count++;
        if (count % 50 === 0) console.log(`✅ Processed ${count}/${tickers.length}...`);
    }

    console.log(`🎉 MEGA SEED complete. ${count} tickers updated.`);
}

main()
    .catch(e => {
        console.error('❌ Mega Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

import { prisma } from '../src/lib/db/prisma';

async function seedMockPrices() {
    console.log('🌱 Seeding mock prices...');

    const tickers = await prisma.ticker.findMany({ take: 5 });

    if (tickers.length === 0) {
        console.log('⚠️ No tickers found in database. Run db:add-sp500 first.');
        return;
    }

    const today = new Date();
    // Use a fixed date string to avoid timezone headaches in the test
    const todayStr = today.toISOString().split('T')[0];
    const todayDate = new Date(todayStr + 'T00:00:00Z');

    for (const ticker of tickers) {
        const symbol = ticker.symbol;

        // Ensure Ticker has essential data for market cap calc
        await prisma.ticker.update({
            where: { symbol },
            data: {
                sharesOutstanding: 1000000000,
                sector: ticker.sector || 'Technology',
                industry: ticker.industry || 'Software'
            }
        });

        // Mock DailyRef - Populate BOTH fields to satisfy the API logic
        await prisma.dailyRef.upsert({
            where: {
                symbol_date: {
                    symbol: symbol,
                    date: todayDate
                }
            },
            update: {
                previousClose: 150,
                regularClose: 155,
                todayOpen: 152
            },
            create: {
                symbol: symbol,
                date: todayDate,
                previousClose: 150,
                regularClose: 155,
                todayOpen: 152
            }
        });

        // Mock SessionPrice
        await prisma.sessionPrice.upsert({
            where: {
                symbol_date_session: {
                    symbol: symbol,
                    date: todayDate,
                    session: 'PRE_MARKET'
                }
            },
            update: {
                lastPrice: 160,
                changePct: 3.2,
                lastTs: new Date()
            },
            create: {
                symbol: symbol,
                date: todayDate,
                session: 'PRE_MARKET',
                lastPrice: 160,
                lastTs: new Date(),
                changePct: 3.2,
                source: 'polygon',
                quality: 'high'
            }
        });
    }

    console.log(`✅ Seeded mock data for ${tickers.length} tickers.`);
}

seedMockPrices().catch(console.error).finally(() => prisma.$disconnect());

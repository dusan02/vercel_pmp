import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';
import { getDateET, nowET } from '../src/lib/utils/dateET';
import { REDIS_KEYS, getCacheKey } from '../src/lib/redis/keys';

async function diagnose() {
    console.log('🔍 ŠTART PODROBNEJ DIAGNOSTIKY...');
    const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOGL'];
    const today = getDateET();
    const now = nowET();

    console.log(`🕒 Aktuálny čas (Server): ${new Date().toISOString()}`);
    console.log(`🕒 Aktuálny čas (ET): ${now.toISOString()}`);
    console.log(`📅 Dnešný trading day: ${today}`);

    // 1. Kontrola Redis
    if (redisClient) {
        if (!redisClient.isOpen) {
            await redisClient.connect().catch(() => { });
        }
        if (redisClient.isOpen) {
            console.log('✅ Redis pripojený.');

            // Individual Stock Cache (used by API)
            for (const t of tickers) {
                const key = getCacheKey('pmp', t, 'stock');
                const data = await redisClient.get(key);
                if (data) {
                    const p = JSON.parse(data);
                    console.log(`📦 Redis Stock Cache [${t}]: Cena=${p.currentPrice}, Prev=${p.closePrice}, %=${p.percentChange}%`);
                } else {
                    console.log(`❌ Redis Stock Cache [${t}] CHÝBA`);
                }
            }
        }
    }

    // 2. Podrobný stav DB
    console.log('\n📊 STAV V DATABÁZE (Ticker table):');
    const dbStocks = await prisma.ticker.findMany({
        where: { symbol: { in: tickers } },
    });

    for (const db of dbStocks) {
        console.log(`[${db.symbol}]: Cena=$${db.lastPrice}, %= ${db.lastChangePct}%, Prev=${db.latestPrevClose}, Updated=${db.lastPriceUpdated?.toISOString()}`);
    }

    console.log('\n📅 STAV V DATABÁZE (DailyRef table):');
    const dailyRefs = await prisma.dailyRef.findMany({
        where: {
            symbol: { in: tickers },
            date: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { date: 'desc' }
    });

    for (const dr of dailyRefs) {
        console.log(`[${dr.symbol}] ${dr.date.toISOString().slice(0, 10)}: Prev=${dr.previousClose}, Regular=${dr.regularClose}`);
    }

    console.log('\n💰 STAV V DATABÁZE (SessionPrice table):');
    const sessionPrices = await prisma.sessionPrice.findMany({
        where: {
            symbol: { in: tickers },
            date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        orderBy: { lastTs: 'desc' }
    });

    for (const sp of sessionPrices) {
        console.log(`[${sp.symbol}] ${sp.session}: Cena=${sp.lastPrice}, %= ${sp.changePct}%, Ts=${sp.lastTs?.toISOString()}`);
    }

    process.exit(0);
}

diagnose().catch(err => {
    console.error('DIAGNOSTIKA ZLYHALA:', err);
    process.exit(1);
});

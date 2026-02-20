import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';
import { getPolygonClient } from '../src/lib/clients/polygonClient';
import { getDateET } from '../src/lib/utils/dateET';

async function diagnose() {
    console.log('🔍 ŠTART DIAGNOSTIKY DÁT...');
    const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT'];
    const today = getDateET();

    // 1. Kontrola Redis
    if (redisClient && redisClient.isOpen) {
        console.log('✅ Redis je pripojený.');
        for (const t of tickers) {
            const pc = await redisClient.get(`prevClose:ondemand:${today}:${t}`);
            console.log(`📡 Redis [${t}] prevClose pro ${today}: ${pc || 'CHÝBA'}`);
        }
    } else {
        console.log('❌ Redis NIE JE pripojený.');
    }

    // 2. Kontrola DB vs Polygon
    const polygon = getPolygonClient();
    const dbStocks = await prisma.ticker.findMany({
        where: { symbol: { in: tickers } },
        select: { symbol: true, lastPrice: true, updatedAt: true, latestPrevClose: true }
    });

    console.log('\n📊 POROVNANIE DB vs POLYGON:');
    for (const db of dbStocks) {
        try {
            const snap = await polygon.fetchBatchSnapshot([db.symbol]);
            const polyPrice = snap[0]?.day?.c || snap[0]?.min?.c || snap[0]?.lastTrade?.p || 0;
            const diff = db.lastPrice && polyPrice ? ((polyPrice - db.lastPrice) / db.lastPrice * 100).toFixed(2) : '0.00';

            console.log(`[${db.symbol}]:`);
            console.log(`   DB Cena: $${db.lastPrice} (Update: ${db.updatedAt.toISOString()})`);
            console.log(`   Polygon: $${polyPrice}`);
            console.log(`   Rozdiel: ${diff}%`);
            console.log(`   DB PrevClose: ${db.latestPrevClose}`);
        } catch (e) {
            console.log(`   [${db.symbol}] Chyba pri sťahovaní z Polygonu`);
        }
    }

    process.exit(0);
}

diagnose();

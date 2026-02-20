import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';
import { getPolygonClient } from '../src/lib/clients/polygonClient';
import { getDateET, nowET } from '../src/lib/utils/dateET';
import { REDIS_KEYS } from '../src/lib/redis/keys';

async function diagnose() {
    console.log('🔍 ŠTART PODROBNEJ DIAGNOSTIKY...');
    const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOG'];
    const today = getDateET();
    const now = nowET();

    console.log(`🕒 Aktuálny čas (Server): ${new Date().toISOString()}`);
    console.log(`🕒 Aktuálny čas (ET): ${now.toISOString()}`);
    console.log(`📅 Dnešný trading day: ${today}`);

    // 1. Kontrola Redis PrevClose
    if (redisClient && redisClient.isOpen) {
        const key = REDIS_KEYS.prevclose(today);
        console.log(`✅ Redis pripojený. Kontrolujem kľúč: ${key}`);
        const values = await redisClient.hmGet(key, tickers);

        tickers.forEach((t, i) => {
            console.log(`📡 Redis [${t}] PrevClose: ${values[i] || '❌ CHÝBA'}`);
        });

        // Kontrola Heatmap
        const heatmapKey = REDIS_KEYS.heatmap('pre');
        const score = await redisClient.zScore(heatmapKey, 'NVDA');
        console.log(`🔥 Heatmap (pre) score pre NVDA: ${score !== null ? (score / 100).toFixed(2) + '%' : '❌ CHÝBA'}`);
    }

    // 2. Podrobný stav DB
    console.log('\n📊 STAV V DATABÁZE:');
    const dbStocks = await prisma.ticker.findMany({
        where: { symbol: { in: tickers } },
    });

    for (const db of dbStocks) {
        console.log(`[${db.symbol}]:`);
        console.log(`   Cena: $${db.lastPrice}`);
        console.log(`   Change %: ${db.lastChangePct}%`);
        console.log(`   Update Čas: ${db.lastPriceUpdated?.toISOString() || 'Mýli sa'}`);
        console.log(`   PrevClose: ${db.latestPrevClose}`);
        console.log(`   PrevClose Date: ${db.latestPrevCloseDate?.toISOString()}`);
    }

    // 3. Polygon Snapshot Porovnanie
    const polygon = getPolygonClient();
    console.log('\n📥 POLYGON SNAPSHOT (LIVE):');
    const snap = await polygon.fetchBatchSnapshot(tickers);

    for (const s of snap) {
        const polyPrice = s.day?.c || s.min?.c || s.lastTrade?.p || 0;
        const polyTs = s.min?.t || s.lastTrade?.t || s.lastQuote?.t || 0;
        const polyTsDate = new Date(polyTs > 1e12 ? polyTs : polyTs / 1e6); // handle ns vs ms

        console.log(`[${s.ticker}]:`);
        console.log(`   Polygon Cena: $${polyPrice}`);
        console.log(`   Polygon Čas: ${polyTsDate.toISOString()}`);
        console.log(`   PrevDay.C: ${s.prevDay?.c}`);
    }

    process.exit(0);
}

diagnose();

import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';
import { getPolygonClient } from '../src/lib/clients/polygonClient';
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
    if (redisClient && redisClient.isOpen) {
        console.log('✅ Redis pripojený.');

        // API Heatmap Cache
        const heatmapData = await redisClient.get('heatmap-data');
        if (heatmapData) {
            console.log(`✅ Cache 'heatmap-data' EXISTUJE (veľkosť: ${heatmapData.length} bajtov)`);
            try {
                const parsed = JSON.parse(heatmapData);
                const nvda = parsed.find((s: any) => s.ticker === 'NVDA');
                if (nvda) {
                    console.log(`🔥 [NVDA] v 'heatmap-data' cache: Cena=${nvda.currentPrice}, %=${nvda.percentChange}%`);
                } else {
                    console.log(`⚠️ [NVDA] NENÁJDENÝ v 'heatmap-data' cache`);
                }
            } catch (e) {
                console.log('❌ Chyba pri parsovaní heatmap-data');
            }
        } else {
            console.log(`❌ Cache 'heatmap-data' CHÝBA`);
        }

        // Individual Stock Cache (used by API)
        for (const t of tickers) {
            const key = getCacheKey('pmp', t, 'stock');
            const data = await redisClient.get(key);
            if (data) {
                const p = JSON.parse(data);
                console.log(`📦 Redis Cache [${t}] (${key}): Cena=${p.currentPrice}, Prev=${p.closePrice}, %=${p.percentChange}%`);
            } else {
                console.log(`❌ Redis Cache [${t}] (${key}) CHÝBA`);
            }
        }

        // Worker Heatmap (ZSET)
        const heatmapKey = REDIS_KEYS.heatmap('pre');
        const score = await redisClient.zScore(heatmapKey, 'NVDA');
        console.log(`🔥 Worker Heatmap (pre) score pre NVDA: ${score !== null ? (score / 100).toFixed(2) + '%' : '❌ CHÝBA'}`);
    }

    // 2. Podrobný stav DB
    console.log('\n📊 STAV V DATABÁZE:');
    const dbStocks = await prisma.ticker.findMany({
        where: { symbol: { in: tickers } },
    });

    for (const db of dbStocks) {
        console.log(`[${db.symbol}]: Cena=$${db.lastPrice}, %= ${db.lastChangePct}%, Prev=${db.latestPrevClose}, Updated=${db.lastPriceUpdated?.toISOString()}`);
    }

    process.exit(0);
}

diagnose();

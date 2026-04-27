import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis/client';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Pomocná funkcia: Zavolá Polygon API a overí, či je ticker aktívny
async function fetchTickerStatus(symbol: string): Promise<{ active: boolean; reason?: string } | null> {
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    // Ak API vráti 404, ticker určite neexistuje / bol zmazaný
    if (res.status === 404) {
      return { active: false, reason: '404 Not Found' };
    }
    
    if (!res.ok) {
      console.warn(`  ⚠️ ${symbol}: HTTP chyba odpovede Polygonu: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    const result = data?.results;
    
    if (!result) return { active: false, reason: 'No results' };
    
    return {
      active: result.active === true,
      reason: result.active === false ? (result.delisted_utc ? `delisted ${result.delisted_utc.slice(0, 10)}` : 'inactive') : undefined
    };
  } catch (err: any) {
    console.warn(`  ⚠️ ${symbol}: Zlyhalo spojenie na Polygon - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n${'='.repeat(65)}`);
  console.log('🧹 ČISTENIE PRODUKCIE: Odstránenie neaktívnych tickerov');
  console.log('='.repeat(65));

  if (!POLYGON_API_KEY) {
    console.error('❌ Chýba POLYGON_API_KEY vo vašom .env súbore, nemôžem pokračovať.');
    process.exit(1);
  }

  // 1. Definovanie hardcodovaných chybných tickerov a načítanie anomálií
  const knownBadSymbols = ['ARNS', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK', 'ANSS'];

  const anomalousTickers = await prisma.ticker.findMany({
    where: {
      OR: [
        { lastChangePct: { gt: 100 } },
        { lastChangePct: { lt: -50 } },
        { symbol: { in: knownBadSymbols } }
      ]
    },
    select: { symbol: true, lastChangePct: true }
  });

  if (anomalousTickers.length === 0) {
    console.log('✅ Neboli nájdené žiadne podozrivé tickery v databáze na odstránenie.');
    process.exit(0);
  }

  console.log(`\n🔍 Našiel som ${anomalousTickers.length} podozrivých tickerov v DB. Začínam overovanie cez Polygon...\n`);

  const delisted: string[] = [];
  const active: string[] = [];

  // OVERENIE Tickerov
  for (const t of anomalousTickers) {
    const status = await fetchTickerStatus(t.symbol);
    
    if (status === null) {
      console.log(`  ❓ ${t.symbol}: Preskakujem, lebo Polygon API neodpovedalo korektne.`);
    } else if (!status.active) {
      console.log(`  ❌ ${t.symbol}: NEAKTÍVNY (${status.reason}) – Zaraďujem na zmazanie.`);
      delisted.push(t.symbol);
    } else {
      console.log(`  ✅ ${t.symbol}: Aktívny na burze.`);
      active.push(t.symbol);
    }
    
    // Zdržanie pre rate-limiting
    await new Promise(r => setTimeout(r, 600)); 
  }

  console.log(`\n${'─'.repeat(65)}`);
  console.log(`🗑️ ZAČÍNAM MAZANIE ${delisted.length} TICKEROV Z DATABÁZY A REDISU...\n`);

  for (const symbol of delisted) {
    // A) REDIS
    try {
      if (redisClient && redisClient.isOpen) {
        await redisClient.sRem('universe:sp500', symbol);
        await redisClient.sRem('universe:pmp', symbol);
        
        const keys = [
          `last:pre:${symbol}`, `last:live:${symbol}`, `last:after:${symbol}`,
          `stock:${symbol}`, `prevclose:*:${symbol}`
        ];
        
        for (const key of keys) {
            await redisClient.del(key);
        }

        for (const session of ['pre', 'live', 'after']) {
          await redisClient.zRem(`heatmap:${session}`, symbol);
          await redisClient.zRem(`rank:chg:${session}`, symbol);
          await redisClient.zRem(`rank:price:${session}`, symbol);
          await redisClient.zRem(`rank:cap:${session}`, symbol);
          await redisClient.zRem(`rank:capdiff:${session}`, symbol);
        }
        console.log(`  ✅ ${symbol}: Úspešne zmazaný z Redis (heatmaps a kľúče).`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ ${symbol}: Zlyhalo mazanie z Redis: ${err.message}`);
    }

    // B) DATABÁZA
    try {
      await prisma.sessionPrice.deleteMany({ where: { symbol } });
      await prisma.dailyRef.deleteMany({ where: { symbol } });
      
      try {
        await prisma.moverEvent.deleteMany({ where: { symbol } });
      } catch (e) {
        // Ignorujeme ak schéma staršia
      }
      
      await prisma.ticker.deleteMany({ where: { symbol } });
      console.log(`  ✅ ${symbol}: Úspešne zmazaný z PostgreSQL DB.`);
    } catch (err: any) {
      console.error(`  ❌ ${symbol}: Chyba pri mazaní z DB: ${err.message}`);
    }
  }

  // C) OPRAVA ANOMÁLII u AKTÍVNYCH Tickerov
  if (active.length > 0) {
    console.log(`\n🔄 Resetujem % Change pre ${active.length} aktívnych tickerov na 0, pre ďalší správny ingest...\n`);
    for (const symbol of active) {
      try {
        await prisma.ticker.update({
          where: { symbol },
          data: { lastChangePct: 0 }
        });
        
        if (redisClient && redisClient.isOpen) {
          for (const session of ['pre', 'live', 'after']) {
            await redisClient.zRem(`heatmap:${session}`, symbol);
          }
        }
        console.log(`  ✅ ${symbol}: % change reštartované.`);
      } catch (err: any) {
        console.error(`  ❌ ${symbol}: Zlyhal reštart anomálie: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Skript úspešne dokončený!`);
}

main().catch(err => {
    console.error('Fatálna chyba:', err);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
    }
    process.exit(0);
});

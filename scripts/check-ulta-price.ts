/**
 * Quick check for ULTA price issue
 * Usage: npx tsx scripts/check-ulta-price.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { resolveEffectivePrice } from '../src/lib/utils/priceResolver';

const ticker = 'ULTA';
const apiKey = process.env.POLYGON_API_KEY;

async function checkULTA() {
  console.log('='.repeat(80));
  console.log(`🔍 KONTROLA CENY PRE ${ticker}`);
  console.log('='.repeat(80));
  console.log('');

  const etNow = nowET();
  const session = detectSession(etNow);

  // 1. Check DB
  console.log('📊 DATABÁZA:');
  const dbTicker = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      lastPrice: true,
      lastPriceUpdated: true,
      latestPrevClose: true,
      lastChangePct: true
    }
  });

  if (dbTicker) {
    console.log(`   Ticker.lastPrice: $${dbTicker.lastPrice || 'N/A'}`);
    console.log(`   Ticker.lastPriceUpdated: ${dbTicker.lastPriceUpdated?.toISOString() || 'N/A'}`);
    if (dbTicker.lastPriceUpdated) {
      const ageMs = etNow.getTime() - dbTicker.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`   Vek: ${ageHours}h ${ageMinutes}m`);
    }
    console.log(`   Ticker.latestPrevClose: $${dbTicker.latestPrevClose || 'N/A'}`);
    console.log(`   Ticker.lastChangePct: ${dbTicker.lastChangePct?.toFixed(2) || 'N/A'}%`);
  }
  console.log('');

  // 2. Check SessionPrice
  console.log('📈 SESSIONPRICE (posledné 3):');
  const sessionPrices = await prisma.sessionPrice.findMany({
    where: { symbol: ticker },
    orderBy: { lastTs: 'desc' },
    take: 3
  });

  if (sessionPrices.length > 0) {
    sessionPrices.forEach((sp, idx) => {
      const ageMs = etNow.getTime() - sp.lastTs.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      console.log(`   ${idx + 1}. $${sp.lastPrice} | ${sp.changePct.toFixed(2)}% | ${sp.session} | ${sp.lastTs.toISOString()} (${ageHours}h ago)`);
    });
  } else {
    console.log('   ⚠️  Žiadne SessionPrice záznamy');
  }
  console.log('');

  // 3. Check Polygon API (live)
  if (apiKey) {
    console.log('🌐 POLYGON API (aktuálna snapshot):');
    try {
      const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
      const response = await fetch(snapshotUrl, { signal: AbortSignal.timeout(10000) });
      
      if (response.ok) {
        const data = await response.json();
        const tickerData = data.ticker || data.tickers?.[0];
        
        if (tickerData) {
          console.log(`   Last Trade: $${tickerData.lastTrade?.p || 'N/A'}`);
          if (tickerData.lastTrade?.t) {
            const tradeTime = new Date(Number(tickerData.lastTrade.t) / 1_000_000);
            console.log(`   Last Trade Time: ${tradeTime.toISOString()}`);
          }
          console.log(`   Min Close: $${tickerData.min?.c || 'N/A'}`);
          console.log(`   Day Close: $${tickerData.day?.c || 'N/A'}`);
          console.log(`   Prev Day Close: $${tickerData.prevDay?.c || 'N/A'}`);
          
          // Try to resolve effective price
          try {
            const effective = resolveEffectivePrice(tickerData, session, etNow);
            if (effective) {
              console.log(`   ✅ Resolved Effective Price: $${effective.price.toFixed(2)}`);
              console.log(`   Source: ${effective.source}`);
              console.log(`   Timestamp: ${effective.timestamp?.toISOString() || 'N/A'}`);
            }
          } catch (err) {
            console.log(`   ⚠️  Could not resolve effective price: ${err}`);
          }
        }
      } else {
        console.log(`   ❌ Polygon API error: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log('');

  // 4. What would /api/stocks return?
  console.log('🔍 ČO BY VRÁTIL /api/stocks:');
  const { getStocksList } = await import('../src/lib/server/stockService');
  const result = await getStocksList({ tickers: [ticker] });
  
  if (result.data.length > 0) {
    const stock = result.data[0]!;
    console.log(`   currentPrice: $${stock.currentPrice?.toFixed(2) || 'N/A'}`);
    console.log(`   closePrice: $${stock.closePrice?.toFixed(2) || 'N/A'}`);
    console.log(`   percentChange: ${stock.percentChange?.toFixed(2) || 'N/A'}%`);
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('📋 SÚHRN');
  console.log('='.repeat(80));
  console.log(`Session: ${session}`);
  console.log(`ET Now: ${etNow.toISOString()}`);
  console.log('');
  
  if (dbTicker?.lastPrice) {
    const dbPrice = dbTicker.lastPrice;
    console.log(`DB cena: $${dbPrice.toFixed(2)}`);
    console.log(`Očakávaná cena: $658.00`);
    const diff = Math.abs(658 - dbPrice);
    console.log(`Rozdiel: $${diff.toFixed(2)} (${((diff / 658) * 100).toFixed(2)}%)`);
    
    if (dbTicker.lastPriceUpdated) {
      const ageMs = etNow.getTime() - dbTicker.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      if (ageHours > 2) {
        console.log(`⚠️  POZOR: Cena je ${ageHours} hodín stará!`);
      }
    }
  }
}

checkULTA()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

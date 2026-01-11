/**
 * Script to check current price for a ticker
 * Shows: DB price, Polygon API price, session, pricing state
 * 
 * Usage: npx tsx scripts/check-current-price.ts [TICKER]
 * Example: npx tsx scripts/check-current-price.ts AAPL
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET, getDateET, createETDate } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';
import { isWeekendET, isMarketHoliday } from '../src/lib/utils/dateET';

const ticker = process.argv[2]?.toUpperCase() || 'AAPL';
const apiKey = process.env.POLYGON_API_KEY;

async function checkCurrentPrice() {
  console.log('='.repeat(80));
  console.log(`🔍 KONTROLA AKTUÁLNEJ CENY PRE ${ticker}`);
  console.log('='.repeat(80));
  console.log('');

  const etNow = nowET();
  const session = detectSession(etNow);
  const pricingState = getPricingState(etNow);
  const isWeekend = isWeekendET(etNow);
  const isHoliday = isMarketHoliday(etNow);

  console.log('📅 Časové informácie:');
  console.log(`   Aktuálny čas (ET): ${etNow.toISOString()}`);
  console.log(`   Session: ${session}`);
  console.log(`   Pricing State: ${pricingState.state}`);
  console.log(`   Can Ingest: ${pricingState.canIngest ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Can Overwrite: ${pricingState.canOverwrite ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Use Frozen Price: ${pricingState.useFrozenPrice ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Is Weekend: ${isWeekend ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Is Holiday: ${isHoliday ? '✅ ÁNO' : '❌ NIE'}`);
  console.log('');

  // Check DB
  console.log('📊 Databáza (Ticker table):');
  const dbTicker = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      symbol: true,
      name: true,
      lastPrice: true,
      lastChangePct: true,
      lastPriceUpdated: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
    }
  });

  if (dbTicker) {
    console.log(`   Symbol: ${dbTicker.symbol}`);
    console.log(`   Name: ${dbTicker.name || 'N/A'}`);
    console.log(`   Last Price: $${dbTicker.lastPrice || 'N/A'}`);
    console.log(`   Last Change %: ${dbTicker.lastChangePct ? dbTicker.lastChangePct.toFixed(2) + '%' : 'N/A'}`);
    console.log(`   Last Price Updated: ${dbTicker.lastPriceUpdated?.toISOString() || 'N/A'}`);
    
    if (dbTicker.lastPriceUpdated) {
      const ageMs = etNow.getTime() - dbTicker.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
      const ageDays = Math.floor(ageHours / 24);
      console.log(`   Vek dát: ${ageDays > 0 ? ageDays + ' dní, ' : ''}${ageHours % 24}h ${ageMinutes}m`);
    }
    
    console.log(`   Latest Prev Close: $${dbTicker.latestPrevClose || 'N/A'}`);
    console.log(`   Latest Prev Close Date: ${dbTicker.latestPrevCloseDate?.toISOString() || 'N/A'}`);
  } else {
    console.log(`   ❌ ${ticker} nie je v databáze!`);
  }
  console.log('');

  // Check Polygon API
  if (apiKey) {
    console.log('🌐 Polygon API (aktuálna snapshot):');
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
          if (tickerData.min?.t) {
            const minTime = new Date(Number(tickerData.min.t) / 1_000_000);
            console.log(`   Min Time: ${minTime.toISOString()}`);
          }
          console.log(`   Day Close: $${tickerData.day?.c || 'N/A'}`);
          console.log(`   Prev Day Close: $${tickerData.prevDay?.c || 'N/A'}`);
        } else {
          console.log(`   ⚠️  Žiadne dáta v snapshot`);
        }
      } else {
        console.log(`   ❌ Polygon API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`   ❌ Chyba pri fetchovaní: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log('   ⚠️  POLYGON_API_KEY nie je nastavený');
  }
  console.log('');

  // Check SessionPrice
  console.log('📈 SessionPrice (posledné záznamy):');
  const sessionPrices = await prisma.sessionPrice.findMany({
    where: { symbol: ticker },
    orderBy: { lastTs: 'desc' },
    take: 5
  });

  if (sessionPrices.length > 0) {
    sessionPrices.forEach((sp, idx) => {
      const ageMs = etNow.getTime() - sp.lastTs.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      console.log(`   ${idx + 1}. ${sp.session} | $${sp.lastPrice} | ${sp.changePct.toFixed(2)}% | ${sp.lastTs.toISOString()} (${ageHours}h ago)`);
      console.log(`      Source: ${sp.source} | Quality: ${sp.quality}`);
    });
  } else {
    console.log('   ⚠️  Žiadne SessionPrice záznamy');
  }
  console.log('');

  // Check DailyRef
  console.log('📅 DailyRef (posledné záznamy):');
  const dailyRefs = await prisma.dailyRef.findMany({
    where: { symbol: ticker },
    orderBy: { date: 'desc' },
    take: 5
  });

  if (dailyRefs.length > 0) {
    dailyRefs.forEach((dr, idx) => {
      console.log(`   ${idx + 1}. ${dr.date.toISOString().split('T')[0]} | PrevClose: $${dr.previousClose} | RegularClose: $${dr.regularClose || 'N/A'}`);
    });
  } else {
    console.log('   ⚠️  Žiadne DailyRef záznamy');
  }
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('📋 SÚHRN');
  console.log('='.repeat(80));
  
  if (isWeekend || isHoliday) {
    console.log('⏸️  VÍKEND/HOLIDAY - Ceny sa NEDOŤAHUJÚ');
    console.log('   Používajú sa frozen prices (posledné dostupné ceny)');
    console.log(`   Can Ingest: ${pricingState.canIngest ? '✅' : '❌'} ${pricingState.canIngest ? 'ÁNO' : 'NIE'}`);
  } else {
    console.log('✅ TRADING DAY - Ceny sa doťahujú');
    console.log(`   Can Ingest: ${pricingState.canIngest ? '✅' : '❌'} ${pricingState.canIngest ? 'ÁNO' : 'NIE'}`);
  }
  
  if (dbTicker?.lastPriceUpdated) {
    const ageMs = etNow.getTime() - dbTicker.lastPriceUpdated.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    
    if (ageDays > 1) {
      console.log(`⚠️  POZOR: Cena je ${ageDays} dní stará!`);
    } else if (ageHours > 24) {
      console.log(`⚠️  POZOR: Cena je ${ageHours} hodín stará!`);
    } else {
      console.log(`✅ Cena je aktuálna (${ageHours}h stará)`);
    }
  }

  console.log('='.repeat(80));
}

checkCurrentPrice()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

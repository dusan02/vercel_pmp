/**
 * Detailed analysis of GOOG price issue
 */

import { prisma } from '../src/lib/db/prisma';
import { getDateET, createETDate, nowET } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';

async function analyzeGOOG() {
  console.log('='.repeat(70));
  console.log('🔍 DÔKLADNÁ ANALÝZA CENY GOOG');
  console.log('='.repeat(70));
  console.log('');

  const etNow = nowET();
  const session = detectSession(etNow);
  const pricingState = getPricingState(etNow);
  const today = getDateET(etNow);
  const todayDate = createETDate(today);

  console.log('📅 Časové informácie:');
  console.log(`   Aktuálny čas (ET): ${etNow.toISOString()}`);
  console.log(`   Session: ${session}`);
  console.log(`   Pricing State: ${pricingState.state}`);
  console.log(`   Can Ingest: ${pricingState.canIngest}`);
  console.log(`   Can Overwrite: ${pricingState.canOverwrite}`);
  console.log(`   Use Frozen Price: ${pricingState.useFrozenPrice}`);
  console.log('');

  // Check Ticker table
  console.log('📊 Ticker Table (GOOG):');
  const ticker = await prisma.ticker.findUnique({
    where: { symbol: 'GOOG' },
    select: {
      symbol: true,
      name: true,
      lastPrice: true,
      lastChangePct: true,
      lastPriceUpdated: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      updatedAt: true
    }
  });

  if (ticker) {
    console.log(`   Symbol: ${ticker.symbol}`);
    console.log(`   Name: ${ticker.name || 'N/A'}`);
    console.log(`   Last Price: $${ticker.lastPrice || 'N/A'}`);
    console.log(`   Last Change %: ${ticker.lastChangePct || 'N/A'}%`);
    console.log(`   Last Price Updated: ${ticker.lastPriceUpdated?.toISOString() || 'N/A'}`);
    
    if (ticker.lastPriceUpdated) {
      const ageMs = etNow.getTime() - ticker.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      console.log(`   Vek dát: ${ageDays} dní, ${ageHours % 24} hodín`);
    }
    
    console.log(`   Latest Prev Close: $${ticker.latestPrevClose || 'N/A'}`);
    console.log(`   Latest Prev Close Date: ${ticker.latestPrevCloseDate?.toISOString() || 'N/A'}`);
    console.log(`   Updated At: ${ticker.updatedAt.toISOString()}`);
  } else {
    console.log('   ❌ GOOG nie je v databáze!');
  }
  console.log('');

  // Check SessionPrice - posledných 7 dní
  console.log('📈 SessionPrice (posledných 7 dní):');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessionPrices = await prisma.sessionPrice.findMany({
    where: {
      symbol: 'GOOG',
      date: { gte: sevenDaysAgo }
    },
    orderBy: { lastTs: 'desc' },
    take: 10
  });

  if (sessionPrices.length > 0) {
    sessionPrices.forEach((sp, idx) => {
      const ageMs = etNow.getTime() - sp.lastTs.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      console.log(`   ${idx + 1}. ${sp.session} | Price: $${sp.lastPrice} | Change: ${sp.changePct.toFixed(2)}% | Time: ${sp.lastTs.toISOString()} (${ageHours}h ago)`);
      console.log(`      Source: ${sp.source} | Quality: ${sp.quality}`);
    });
  } else {
    console.log('   ⚠️  Žiadne SessionPrice záznamy za posledných 24h');
  }
  console.log('');

  // Check DailyRef
  console.log('📅 DailyRef (posledných 7 dní):');
  const dailyRefs = await prisma.dailyRef.findMany({
    where: {
      symbol: 'GOOG',
      date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { date: 'desc' }
  });

  if (dailyRefs.length > 0) {
    dailyRefs.forEach((dr, idx) => {
      console.log(`   ${idx + 1}. Date: ${dr.date.toISOString().split('T')[0]} | PrevClose: $${dr.previousClose} | RegularClose: $${dr.regularClose || 'N/A'}`);
    });
  } else {
    console.log('   ⚠️  Žiadne DailyRef záznamy za posledných 7 dní');
  }
  console.log('');

  // Check GOOGL (Alphabet Class A)
  console.log('📊 Ticker Table (GOOGL - Alphabet Class A):');
  const tickerGOOGL = await prisma.ticker.findUnique({
    where: { symbol: 'GOOGL' },
    select: {
      symbol: true,
      lastPrice: true,
      lastChangePct: true,
      lastPriceUpdated: true,
      latestPrevClose: true
    }
  });

  if (tickerGOOGL) {
    console.log(`   Last Price: $${tickerGOOGL.lastPrice || 'N/A'}`);
    console.log(`   Last Change %: ${tickerGOOGL.lastChangePct || 'N/A'}%`);
    console.log(`   Last Price Updated: ${tickerGOOGL.lastPriceUpdated?.toISOString() || 'N/A'}`);
    if (tickerGOOGL.lastPriceUpdated) {
      const ageMs = etNow.getTime() - tickerGOOGL.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      console.log(`   Vek dát: ${ageDays} dní, ${ageHours % 24} hodín`);
    }
  } else {
    console.log('   GOOGL nie je v databáze');
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📋 SÚHRN PROBLÉMU');
  console.log('='.repeat(70));
  
  if (ticker && ticker.lastPriceUpdated) {
    const ageMs = etNow.getTime() - ticker.lastPriceUpdated.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    
    if (ageDays > 1) {
      console.log(`❌ PROBLÉM: Cena je ${ageDays} dní stará!`);
      console.log(`   Posledná aktualizácia: ${ticker.lastPriceUpdated.toISOString()}`);
      console.log(`   Aktuálna cena v DB: $${ticker.lastPrice}`);
      console.log(`   Očakávaná cena (z Nasdaq): ~$308-309`);
      console.log('');
      console.log('🔍 Možné príčiny:');
      console.log(`   1. Pricing State blokuje ingest: ${!pricingState.canIngest ? 'ÁNO ❌' : 'NIE ✅'}`);
      console.log(`   2. Worker nebeží alebo zlyháva`);
      console.log(`   3. Market je zatvorený a pricing state machine blokuje aktualizácie`);
      console.log(`   4. Polygon API rate limit alebo chyba`);
    } else {
      console.log(`✅ Cena je relatívne aktuálna (${ageHours}h stará)`);
    }
  }

  await prisma.$disconnect();
}

analyzeGOOG().catch(console.error);


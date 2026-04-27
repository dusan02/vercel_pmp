/**
 * Check if Polygon worker is running and updating prices
 * 
 * Usage: npx tsx scripts/check-worker-status.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { nowET } from '../src/lib/utils/dateET';
import { detectSession } from '../src/lib/utils/timeUtils';
import { getPricingState } from '../src/lib/utils/pricingStateMachine';

async function checkWorkerStatus() {
  console.log('='.repeat(80));
  console.log('🔍 KONTROLA POLYGON WORKER STATUS');
  console.log('='.repeat(80));
  console.log('');

  const etNow = nowET();
  const session = detectSession(etNow);
  const pricingState = getPricingState(etNow);

  console.log('📅 Časové informácie:');
  console.log(`   Aktuálny čas (ET): ${etNow.toISOString()}`);
  console.log(`   Session: ${session}`);
  console.log(`   Pricing State: ${pricingState.state}`);
  console.log(`   Can Ingest: ${pricingState.canIngest ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Can Overwrite: ${pricingState.canOverwrite ? '✅ ÁNO' : '❌ NIE'}`);
  console.log(`   Use Frozen Price: ${pricingState.useFrozenPrice ? '✅ ÁNO' : '❌ NIE'}`);
  console.log('');

  // Check PM2 status
  console.log('📊 PM2 Status:');
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync('pm2 list | grep polygon-worker || echo "Not found"');
    console.log(stdout);
  } catch (error) {
    console.log('   ⚠️  Could not check PM2 status');
  }
  console.log('');

  // Check recent price updates
  console.log('📈 Posledné aktualizácie cien (top 10):');
  const recentUpdates = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      lastPriceUpdated: { not: null }
    },
    select: {
      symbol: true,
      lastPrice: true,
      lastPriceUpdated: true
    },
    orderBy: {
      lastPriceUpdated: 'desc'
    },
    take: 10
  });

  recentUpdates.forEach((ticker, idx) => {
    const ageMs = etNow.getTime() - ticker.lastPriceUpdated!.getTime();
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
    console.log(`   ${idx + 1}. ${ticker.symbol}: $${ticker.lastPrice} (${ageHours}h ${ageMinutes}m ago)`);
  });
  console.log('');

  // Check stale prices
  console.log('⚠️  Stale ceny (> 2 hodiny):');
  const twoHoursAgo = new Date(etNow.getTime() - 2 * 60 * 60 * 1000);
  const staleTickers = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      lastPriceUpdated: { lt: twoHoursAgo }
    },
    select: {
      symbol: true,
      lastPrice: true,
      lastPriceUpdated: true
    },
    orderBy: {
      lastPriceUpdated: 'asc'
    },
    take: 20
  });

  if (staleTickers.length > 0) {
    staleTickers.forEach((ticker) => {
      const ageMs = etNow.getTime() - ticker.lastPriceUpdated!.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      console.log(`   - ${ticker.symbol}: $${ticker.lastPrice} (${ageDays > 0 ? ageDays + 'd ' : ''}${ageHours % 24}h old)`);
    });
  } else {
    console.log('   ✅ Žiadne stale ceny');
  }
  console.log('');

  // Check specific problematic tickers
  const problematicTickers = ['ULTA', 'MSFT', 'META', 'AMZN', 'GOOGL'];
  console.log('🔍 Kontrola problémových tickerov:');
  for (const ticker of problematicTickers) {
    const dbTicker = await prisma.ticker.findUnique({
      where: { symbol: ticker },
      select: {
        lastPrice: true,
        lastPriceUpdated: true,
        latestPrevClose: true
      }
    });

    if (dbTicker && dbTicker.lastPriceUpdated) {
      const ageMs = etNow.getTime() - dbTicker.lastPriceUpdated.getTime();
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const isStale = ageHours > 2;
      
      console.log(`   ${ticker}: $${dbTicker.lastPrice} | PrevClose: $${dbTicker.latestPrevClose} | ${isStale ? '⚠️ STALE' : '✅ OK'} (${ageDays > 0 ? ageDays + 'd ' : ''}${ageHours % 24}h)`);
    } else {
      console.log(`   ${ticker}: ❌ Not found in DB`);
    }
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('📋 SÚHRN');
  console.log('='.repeat(80));
  
  if (!pricingState.canIngest) {
    console.log('⚠️  Worker NEMÔŽE ingestovať (frozen state)');
    console.log('   Použite force-update-prices.ts pre vynútenú aktualizáciu');
  } else {
    console.log('✅ Worker MÔŽE ingestovať');
  }

  if (staleTickers.length > 0) {
    console.log(`⚠️  ${staleTickers.length} tickerov má stale ceny (> 2h)`);
    console.log('   Použite force-update-prices.ts pre aktualizáciu');
  }
}

checkWorkerStatus()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

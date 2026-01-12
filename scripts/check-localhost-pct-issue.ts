/**
 * Check why localhost has different percent changes than production
 * Run: npx tsx scripts/check-localhost-pct-issue.ts CSCO
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  console.warn('⚠️ dotenv not found, using existing environment variables');
}

import { PrismaClient } from '@prisma/client';
import { calculatePercentChange } from '../src/lib/utils/priceResolver';
import { detectSession } from '../src/lib/utils/timeUtils';

const prisma = new PrismaClient();

const symbol = process.argv[2] || 'CSCO';

async function checkTicker(symbol: string) {
  console.log(`\n🔍 Checking ${symbol} on localhost...\n`);
  
  const etNow = new Date();
  const session = detectSession(etNow);
  
  // Get ticker data
  const ticker = await prisma.ticker.findUnique({
    where: { symbol },
    select: {
      symbol: true,
      lastPrice: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      lastPriceUpdated: true,
      lastChangePct: true,
    }
  });
  
  if (!ticker) {
    console.error(`❌ Ticker ${symbol} not found in database`);
    return;
  }
  
  // Get SessionPrice
  const sessionPrice = await prisma.sessionPrice.findFirst({
    where: { symbol },
    orderBy: { lastTs: 'desc' },
    select: {
      lastPrice: true,
      lastTs: true,
      changePct: true,
      date: true,
      session: true,
    }
  });
  
  // Get DailyRef for regularClose
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  
  const dailyRef = await prisma.dailyRef.findFirst({
    where: {
      symbol,
      date: {
        gte: today,
        lte: todayEnd,
      },
    },
    select: {
      regularClose: true,
      previousClose: true,
      date: true,
    }
  });
  
  // Determine best price
  let currentPrice = 0;
  let priceSource = 'none';
  
  if (sessionPrice && ticker.lastPriceUpdated) {
    const spTime = sessionPrice.lastTs.getTime();
    const tickerTime = ticker.lastPriceUpdated.getTime();
    if (spTime > tickerTime) {
      currentPrice = sessionPrice.lastPrice;
      priceSource = 'SessionPrice';
    } else {
      currentPrice = ticker.lastPrice || 0;
      priceSource = 'Ticker.lastPrice';
    }
  } else if (sessionPrice) {
    currentPrice = sessionPrice.lastPrice;
    priceSource = 'SessionPrice';
  } else if (ticker.lastPrice) {
    currentPrice = ticker.lastPrice;
    priceSource = 'Ticker.lastPrice';
  }
  
  const previousClose = ticker.latestPrevClose || 0;
  const regularClose = dailyRef?.regularClose || null;
  
  // Calculate percent change
  const pct = calculatePercentChange(
    currentPrice,
    session,
    previousClose > 0 ? previousClose : null,
    regularClose && regularClose > 0 ? regularClose : null
  );
  
  console.log('📊 Current Data:');
  console.log(`   Current Price: $${currentPrice.toFixed(2)} (source: ${priceSource})`);
  console.log(`   Previous Close: $${previousClose.toFixed(2)} (date: ${ticker.latestPrevCloseDate?.toISOString().split('T')[0] || 'N/A'})`);
  console.log(`   Regular Close: ${regularClose ? `$${regularClose.toFixed(2)}` : 'N/A'}`);
  console.log(`   Session: ${session}`);
  console.log(`   Calculated % Change: ${pct.changePct >= 0 ? '+' : ''}${pct.changePct.toFixed(2)}%`);
  console.log(`   Reference Used: ${pct.reference.used || 'none'} ($${pct.reference.price?.toFixed(2) || 'N/A'})`);
  
  console.log('\n📋 Database Values:');
  console.log(`   Ticker.lastPrice: $${ticker.lastPrice?.toFixed(2) || 'N/A'}`);
  console.log(`   Ticker.lastChangePct: ${ticker.lastChangePct !== null ? `${ticker.lastChangePct >= 0 ? '+' : ''}${ticker.lastChangePct.toFixed(2)}%` : 'N/A'}`);
  console.log(`   Ticker.lastPriceUpdated: ${ticker.lastPriceUpdated?.toISOString() || 'N/A'}`);
  
  if (sessionPrice) {
    console.log(`   SessionPrice.lastPrice: $${sessionPrice.lastPrice.toFixed(2)}`);
    console.log(`   SessionPrice.changePct: ${sessionPrice.changePct >= 0 ? '+' : ''}${sessionPrice.changePct.toFixed(2)}%`);
    console.log(`   SessionPrice.lastTs: ${sessionPrice.lastTs.toISOString()}`);
    console.log(`   SessionPrice.session: ${sessionPrice.session}`);
  } else {
    console.log(`   SessionPrice: None found`);
  }
  
  if (dailyRef) {
    console.log(`   DailyRef.regularClose: $${dailyRef.regularClose?.toFixed(2) || 'N/A'}`);
    console.log(`   DailyRef.previousClose: $${dailyRef.previousClose?.toFixed(2) || 'N/A'}`);
    console.log(`   DailyRef.date: ${dailyRef.date.toISOString().split('T')[0]}`);
  } else {
    console.log(`   DailyRef: None found for today`);
  }
  
  // Check if calculation matches stored value
  if (ticker.lastChangePct !== null) {
    const diff = Math.abs(pct.changePct - ticker.lastChangePct);
    if (diff > 0.01) {
      console.log(`\n⚠️  WARNING: Calculated % change (${pct.changePct.toFixed(2)}%) differs from stored value (${ticker.lastChangePct.toFixed(2)}%) by ${diff.toFixed(2)}%`);
    } else {
      console.log(`\n✅ Calculated % change matches stored value`);
    }
  }
  
  // Manual calculation check
  if (pct.reference.price && pct.reference.price > 0) {
    const manualCalc = ((currentPrice / pct.reference.price) - 1) * 100;
    console.log(`\n🧮 Manual Calculation Check:`);
    console.log(`   Formula: (${currentPrice.toFixed(2)} / ${pct.reference.price.toFixed(2)}) - 1) * 100`);
    console.log(`   Result: ${manualCalc >= 0 ? '+' : ''}${manualCalc.toFixed(2)}%`);
    console.log(`   Calculated: ${pct.changePct >= 0 ? '+' : ''}${pct.changePct.toFixed(2)}%`);
    if (Math.abs(manualCalc - pct.changePct) < 0.01) {
      console.log(`   ✅ Match!`);
    } else {
      console.log(`   ⚠️  Mismatch!`);
    }
  }
}

async function main() {
  await checkTicker(symbol);
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

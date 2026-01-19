/**
 * Temporary script to check if prices match for specific tickers
 * Run: npx tsx scripts/check-ticker-prices-temp.ts
 */

// Load environment variables
try {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env.local') });
} catch (e) {
  // dotenv not available, continue without it
}

import { prisma } from '../src/lib/db/prisma';
import { getPrevClose } from '@/lib/redis/operations';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { withRetry } from '@/lib/api/rateLimiter';

// Tickers from the images
const TICKERS_TO_CHECK = [
  // First image
  'SMCI', 'XYL', 'Q', 'TPL', 'UAL', 'TDY', 'PPL', 'SYF', 'VICI', 'VMC', 'SYY', 'UDR',
  // Second image
  'TEAM', 'TRMB', 'WST', 'TTD', 'ZBRA', 'PRU', 'TER', 'STT', 'TAP', 'TTWO', 'TYL', 'RACE', 'TRI'
];

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  return value;
}

interface PriceCheckResult {
  ticker: string;
  dbPrice: number | null;
  dbPreviousClose: number | null;
  dbLatestPrevCloseDate: Date | null;
  redisPreviousClose: number | null;
  polygonCurrentPrice: number | null;
  polygonPreviousClose: number | null;
  polygonTimestamp: number | null;
  polygonTradingDay: string | null;
  calculatedPercentChange: number | null;
  dbPercentChange: number | null;
  match: boolean;
  issues: string[];
}

async function fetchPolygonSnapshot(ticker: string, apiKey: string): Promise<any> {
  try {
    // Use single ticker endpoint (not batch endpoint)
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));
    
    if (!response.ok) {
      console.warn(`⚠️  Polygon snapshot API returned ${response.status} for ${ticker}`);
      return null;
    }
    
    const data = await response.json();
    
    // Debug: log if no ticker data
    if (!data.ticker && !data.tickers) {
      console.warn(`⚠️  No ticker data in Polygon response for ${ticker}:`, JSON.stringify(data).substring(0, 200));
    }
    
    // Single ticker endpoint returns { ticker: {...} }, not { tickers: [...] }
    // But also handle batch format as fallback
    const tickerData = data.ticker || data.tickers?.[0] || null;
    
    // Debug: log if no price data
    if (tickerData && !tickerData.lastTrade?.p && !tickerData.min?.c && !tickerData.day?.c && !tickerData.prevDay?.c) {
      console.warn(`⚠️  No price data in Polygon snapshot for ${ticker} (lastTrade, min, day, prevDay all missing)`);
    }
    
    return tickerData;
  } catch (error) {
    console.error(`❌ Error fetching Polygon snapshot for ${ticker}:`, error);
    return null;
  }
}

async function fetchPolygonPreviousClose(ticker: string, apiKey: string, date: string): Promise<{ close: number | null; timestamp: number | null; tradingDay: string | null }> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));
    
    if (!response.ok) {
      return { close: null, timestamp: null, tradingDay: null };
    }
    
    const data = await response.json();
    const result = data?.results?.[0];
    
    if (result && result.c && result.c > 0) {
      const timestamp = result.t;
      const timestampDate = timestamp ? new Date(timestamp) : null;
      const tradingDay = timestampDate ? getDateET(timestampDate) : null;
      
      return {
        close: result.c,
        timestamp: timestamp || null,
        tradingDay: tradingDay || null
      };
    }
    
    return { close: null, timestamp: null, tradingDay: null };
  } catch (error) {
    console.error(`Error fetching Polygon previous close for ${ticker}:`, error);
    return { close: null, timestamp: null, tradingDay: null };
  }
}

async function checkTicker(ticker: string, apiKey: string, todayTradingDateStr: string): Promise<PriceCheckResult> {
  const issues: string[] = [];
  
  // 1. Get data from DB
  const dbTicker = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      lastPrice: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      lastChangePct: true
    }
  });
  
  const dbPrice = dbTicker?.lastPrice || null;
  const dbPreviousClose = dbTicker?.latestPrevClose || null;
  const dbLatestPrevCloseDate = dbTicker?.latestPrevCloseDate || null;
  const dbPercentChange = dbTicker?.lastChangePct || null;
  
  // 2. Get data from Redis
  const redisPrevCloseMap = await getPrevClose(todayTradingDateStr, [ticker]);
  const redisPreviousClose = redisPrevCloseMap.get(ticker) || null;
  
  // 3. Get data from Polygon API
  const polygonSnapshot = await fetchPolygonSnapshot(ticker, apiKey);
  // Polygon snapshot structure: { lastTrade: { p }, min: { c }, day: { c }, prevDay: { c } }
  // Note: single ticker endpoint returns { ticker: {...} }, but fetchPolygonSnapshot already extracts tickerData
  const polygonCurrentPrice = polygonSnapshot?.lastTrade?.p || 
                               polygonSnapshot?.min?.c || 
                               polygonSnapshot?.day?.c || 
                               polygonSnapshot?.prevDay?.c ||
                               null;
  
  // Debug: log if snapshot exists but no price
  if (polygonSnapshot && !polygonCurrentPrice) {
    console.warn(`⚠️  [${ticker}] Polygon snapshot exists but no price found. Available fields:`, {
      hasLastTrade: !!polygonSnapshot.lastTrade,
      lastTradeP: polygonSnapshot.lastTrade?.p,
      hasMin: !!polygonSnapshot.min,
      minC: polygonSnapshot.min?.c,
      hasDay: !!polygonSnapshot.day,
      dayC: polygonSnapshot.day?.c,
      hasPrevDay: !!polygonSnapshot.prevDay,
      prevDayC: polygonSnapshot.prevDay?.c
    });
  }
  
  // 4. Get previous close from Polygon
  const yesterdayTradingDay = getLastTradingDay(createETDate(todayTradingDateStr));
  const yesterdayDateStr = getDateET(yesterdayTradingDay);
  const polygonPrevCloseData = await fetchPolygonPreviousClose(ticker, apiKey, yesterdayDateStr);
  const polygonPreviousClose = polygonPrevCloseData.close;
  const polygonTimestamp = polygonPrevCloseData.timestamp;
  const polygonTradingDay = polygonPrevCloseData.tradingDay;
  
  // 5. Calculate percent change
  let calculatedPercentChange: number | null = null;
  if (polygonCurrentPrice && polygonPreviousClose && polygonPreviousClose > 0) {
    calculatedPercentChange = ((polygonCurrentPrice / polygonPreviousClose) - 1) * 100;
  }
  
  // 6. Check for issues
  if (!dbPrice || dbPrice <= 0) {
    issues.push('❌ DB price missing or zero');
  }
  
  if (!dbPreviousClose || dbPreviousClose <= 0) {
    issues.push('❌ DB previousClose missing or zero');
  }
  
  if (!redisPreviousClose || redisPreviousClose <= 0) {
    issues.push('⚠️ Redis previousClose missing or zero');
  }
  
  if (!polygonCurrentPrice || polygonCurrentPrice <= 0) {
    issues.push('❌ Polygon current price missing or zero');
  }
  
  if (!polygonPreviousClose || polygonPreviousClose <= 0) {
    issues.push('❌ Polygon previousClose missing or zero');
  }
  
  // Check if prices match (within 0.1% tolerance)
  const priceMatch = dbPrice && polygonCurrentPrice && 
    Math.abs(dbPrice - polygonCurrentPrice) / polygonCurrentPrice < 0.001;
  
  const prevCloseMatch = dbPreviousClose && polygonPreviousClose && 
    Math.abs(dbPreviousClose - polygonPreviousClose) / polygonPreviousClose < 0.001;
  
  if (!priceMatch) {
    issues.push(`⚠️ Price mismatch: DB=${dbPrice}, Polygon=${polygonCurrentPrice}`);
  }
  
  if (!prevCloseMatch) {
    issues.push(`⚠️ PreviousClose mismatch: DB=${dbPreviousClose}, Polygon=${polygonPreviousClose}`);
  }
  
  // Check if percent change matches (within 0.01% tolerance)
  if (calculatedPercentChange !== null && dbPercentChange !== null) {
    const pctDiff = Math.abs(calculatedPercentChange - dbPercentChange);
    if (pctDiff > 0.01) {
      issues.push(`⚠️ % Change mismatch: DB=${dbPercentChange?.toFixed(2)}%, Calculated=${calculatedPercentChange.toFixed(2)}%`);
    }
  }
  
  // Check if trading day matches
  if (dbLatestPrevCloseDate && polygonTradingDay) {
    const dbTradingDayStr = getDateET(dbLatestPrevCloseDate);
    if (dbTradingDayStr !== polygonTradingDay) {
      issues.push(`⚠️ Trading day mismatch: DB=${dbTradingDayStr}, Polygon=${polygonTradingDay}`);
    }
  }
  
  return {
    ticker,
    dbPrice,
    dbPreviousClose,
    dbLatestPrevCloseDate,
    redisPreviousClose,
    polygonCurrentPrice,
    polygonPreviousClose,
    polygonTimestamp,
    polygonTradingDay,
    calculatedPercentChange,
    dbPercentChange,
    match: issues.length === 0,
    issues
  };
}

async function main() {
  console.log('🔍 Checking prices for tickers from images...\n');
  
  const apiKey = requireEnv('POLYGON_API_KEY');
  const today = getDateET();
  const todayTradingDay = getLastTradingDay(createETDate(today));
  const todayTradingDateStr = getDateET(todayTradingDay);
  
  console.log(`📅 Today (ET): ${today}`);
  console.log(`📅 Trading day: ${todayTradingDateStr}\n`);
  
  const results: PriceCheckResult[] = [];
  
  for (let i = 0; i < TICKERS_TO_CHECK.length; i++) {
    const ticker = TICKERS_TO_CHECK[i];
    console.log(`[${i + 1}/${TICKERS_TO_CHECK.length}] Checking ${ticker}...`);
    
    const result = await checkTicker(ticker, apiKey, todayTradingDateStr);
    results.push(result);
    
    // Rate limiting
    if (i < TICKERS_TO_CHECK.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('📊 RESULTS SUMMARY\n');
  
  const withIssues = results.filter(r => r.issues.length > 0);
  const withoutIssues = results.filter(r => r.issues.length === 0);
  
  console.log(`✅ No issues: ${withoutIssues.length}/${results.length}`);
  console.log(`⚠️ With issues: ${withIssues.length}/${results.length}\n`);
  
  if (withIssues.length > 0) {
    console.log('⚠️ TICKERS WITH ISSUES:\n');
    for (const result of withIssues) {
      console.log(`\n${result.ticker}:`);
      console.log(`  DB Price: $${result.dbPrice?.toFixed(2) || 'N/A'}`);
      console.log(`  Polygon Price: $${result.polygonCurrentPrice?.toFixed(2) || 'N/A'}`);
      console.log(`  DB PreviousClose: $${result.dbPreviousClose?.toFixed(2) || 'N/A'}`);
      console.log(`  Polygon PreviousClose: $${result.polygonPreviousClose?.toFixed(2) || 'N/A'}`);
      console.log(`  Redis PreviousClose: $${result.redisPreviousClose?.toFixed(2) || 'N/A'}`);
      console.log(`  DB % Change: ${result.dbPercentChange?.toFixed(2) || 'N/A'}%`);
      console.log(`  Calculated % Change: ${result.calculatedPercentChange?.toFixed(2) || 'N/A'}%`);
      console.log(`  DB Trading Day: ${result.dbLatestPrevCloseDate ? getDateET(result.dbLatestPrevCloseDate) : 'N/A'}`);
      console.log(`  Polygon Trading Day: ${result.polygonTradingDay || 'N/A'}`);
      console.log(`  Issues:`);
      result.issues.forEach(issue => console.log(`    ${issue}`));
    }
  }
  
  if (withoutIssues.length > 0) {
    console.log('\n✅ TICKERS WITHOUT ISSUES:\n');
    for (const result of withoutIssues) {
      console.log(`  ${result.ticker}: Price=$${result.dbPrice?.toFixed(2)}, PrevClose=$${result.dbPreviousClose?.toFixed(2)}, %Change=${result.dbPercentChange?.toFixed(2)}%`);
    }
  }
  
  // Summary table
  console.log('\n' + '='.repeat(100));
  console.log('📋 DETAILED TABLE:\n');
  console.log('Ticker | DB Price | Polygon Price | DB PrevClose | Polygon PrevClose | DB %Change | Calc %Change | Status');
  console.log('-'.repeat(100));
  
  for (const result of results) {
    const status = result.issues.length === 0 ? '✅' : '⚠️';
    const dbPrice = result.dbPrice?.toFixed(2) || 'N/A';
    const polyPrice = result.polygonCurrentPrice?.toFixed(2) || 'N/A';
    const dbPrev = result.dbPreviousClose?.toFixed(2) || 'N/A';
    const polyPrev = result.polygonPreviousClose?.toFixed(2) || 'N/A';
    const dbPct = result.dbPercentChange?.toFixed(2) || 'N/A';
    const calcPct = result.calculatedPercentChange?.toFixed(2) || 'N/A';
    
    console.log(`${result.ticker.padEnd(6)} | ${dbPrice.padStart(9)} | ${polyPrice.padStart(13)} | ${dbPrev.padStart(12)} | ${polyPrev.padStart(17)} | ${dbPct.padStart(9)} | ${calcPct.padStart(11)} | ${status}`);
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

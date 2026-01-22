/**
 * Script to check if we know the new premarket price and if we send it to FE
 * Run: npx tsx scripts/check-price-pipeline.ts [ticker1,ticker2,...]
 * 
 * This script checks:
 * 1. DB - current price stored
 * 2. Redis - cached price
 * 3. Polygon API - latest price available
 * 4. API endpoint (/api/stocks) - what we send to FE
 * 5. Compares all sources to find where the issue is
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
import { getStocksData } from '@/lib/server/stockService';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  return value;
}

interface PricePipelineCheck {
  ticker: string;
  // Source 1: Database
  dbPrice: number | null;
  dbPreviousClose: number | null;
  dbLastUpdate: Date | null;
  dbPercentChange: number | null;
  
  // Source 2: Redis
  redisPrice: number | null;
  redisPreviousClose: number | null;
  
  // Source 3: Polygon API (ground truth)
  polygonCurrentPrice: number | null;
  polygonPreviousClose: number | null;
  polygonTimestamp: number | null;
  
  // Source 4: API Response (what FE receives)
  apiPrice: number | null;
  apiPreviousClose: number | null;
  apiPercentChange: number | null;
  apiMarketCap: number | null;
  
  // Analysis
  hasPriceInDB: boolean;
  hasPriceInRedis: boolean;
  hasPriceInPolygon: boolean;
  hasPriceInAPI: boolean;
  dbMatchesPolygon: boolean;
  apiMatchesPolygon: boolean;
  apiMatchesDB: boolean;
  issues: string[];
  status: 'ok' | 'missing_in_db' | 'missing_in_api' | 'stale' | 'mismatch';
}

async function fetchPolygonSnapshot(ticker: string, apiKey: string): Promise<any> {
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.ticker || data.tickers?.[0] || null;
  } catch (error) {
    return null;
  }
}

async function fetchPolygonPreviousClose(ticker: string, apiKey: string, date: string): Promise<{ close: number | null; timestamp: number | null }> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${apiKey}`;
    const response = await withRetry(async () => fetch(url));
    
    if (!response.ok) {
      return { close: null, timestamp: null };
    }
    
    const data = await response.json();
    const result = data?.results?.[0];
    
    if (result && result.c && result.c > 0) {
      return {
        close: result.c,
        timestamp: result.t || null
      };
    }
    
    return { close: null, timestamp: null };
  } catch (error) {
    return { close: null, timestamp: null };
  }
}

async function getRedisPrice(ticker: string): Promise<number | null> {
  try {
    const { StockDataCache } = await import('@/lib/cache/stockData');
    const stockDataCache = new StockDataCache();
    const cached = await stockDataCache.getStock(ticker);
    return cached?.currentPrice || null;
  } catch (error) {
    return null;
  }
}

async function checkTicker(ticker: string, apiKey: string, todayTradingDateStr: string): Promise<PricePipelineCheck> {
  const issues: string[] = [];
  
  // 1. Get data from DB
  const dbTicker = await prisma.ticker.findUnique({
    where: { symbol: ticker },
    select: {
      lastPrice: true,
      latestPrevClose: true,
      lastUpdate: true,
      lastChangePct: true
    }
  });
  
  const dbPrice = dbTicker?.lastPrice || null;
  const dbPreviousClose = dbTicker?.latestPrevClose || null;
  const dbLastUpdate = dbTicker?.lastUpdate || null;
  const dbPercentChange = dbTicker?.lastChangePct || null;
  
  // 2. Get data from Redis
  const redisPrice = await getRedisPrice(ticker);
  const redisPrevCloseMap = await getPrevClose(todayTradingDateStr, [ticker]);
  const redisPreviousClose = redisPrevCloseMap.get(ticker) || null;
  
  // 3. Get data from Polygon API (ground truth)
  const polygonSnapshot = await fetchPolygonSnapshot(ticker, apiKey);
  const polygonCurrentPrice = polygonSnapshot?.lastTrade?.p || 
                               polygonSnapshot?.min?.c || 
                               polygonSnapshot?.day?.c || 
                               polygonSnapshot?.prevDay?.c ||
                               null;
  
  const yesterdayTradingDay = getLastTradingDay(createETDate(todayTradingDateStr));
  const yesterdayDateStr = getDateET(yesterdayTradingDay);
  const polygonPrevCloseData = await fetchPolygonPreviousClose(ticker, apiKey, yesterdayDateStr);
  const polygonPreviousClose = polygonPrevCloseData.close;
  const polygonTimestamp = polygonPrevCloseData.timestamp;
  
  // 4. Get data from API endpoint (what FE receives)
  let apiPrice: number | null = null;
  let apiPreviousClose: number | null = null;
  let apiPercentChange: number | null = null;
  let apiMarketCap: number | null = null;
  
  try {
    const { data } = await getStocksData([ticker], 'pmp');
    if (data && data.length > 0) {
      const stock = data[0];
      apiPrice = stock.currentPrice || stock.price || null;
      apiPreviousClose = stock.previousClose || stock.prevClose || null;
      apiPercentChange = stock.percentChange || stock.changePct || null;
      apiMarketCap = stock.marketCap || null;
    }
  } catch (error) {
    issues.push(`❌ API endpoint error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
  
  // 5. Analysis
  const hasPriceInDB = dbPrice !== null && dbPrice > 0;
  const hasPriceInRedis = redisPrice !== null && redisPrice > 0;
  const hasPriceInPolygon = polygonCurrentPrice !== null && polygonCurrentPrice > 0;
  const hasPriceInAPI = apiPrice !== null && apiPrice > 0;
  
  // Check if DB matches Polygon (within 0.1% tolerance)
  const dbMatchesPolygon = hasPriceInDB && hasPriceInPolygon && 
    Math.abs(dbPrice! - polygonCurrentPrice!) / polygonCurrentPrice! < 0.001;
  
  // Check if API matches Polygon
  const apiMatchesPolygon = hasPriceInAPI && hasPriceInPolygon && 
    Math.abs(apiPrice! - polygonCurrentPrice!) / polygonCurrentPrice! < 0.001;
  
  // Check if API matches DB
  const apiMatchesDB = hasPriceInAPI && hasPriceInDB && 
    Math.abs(apiPrice! - dbPrice!) / dbPrice! < 0.001;
  
  // Determine status
  let status: PricePipelineCheck['status'] = 'ok';
  
  if (!hasPriceInPolygon) {
    issues.push('❌ Polygon API: No price available (market closed or ticker invalid)');
    status = 'missing_in_db';
  } else if (!hasPriceInDB) {
    issues.push('❌ DB: Price missing - we do NOT know the new price');
    status = 'missing_in_db';
  } else if (!dbMatchesPolygon) {
    issues.push(`⚠️ DB: Price stale - DB=$${dbPrice?.toFixed(2)}, Polygon=$${polygonCurrentPrice?.toFixed(2)}`);
    status = 'stale';
  } else if (!hasPriceInAPI) {
    issues.push('❌ API: Price missing - we know it but do NOT send it to FE');
    status = 'missing_in_api';
  } else if (!apiMatchesPolygon) {
    issues.push(`⚠️ API: Price mismatch - API=$${apiPrice?.toFixed(2)}, Polygon=$${polygonCurrentPrice?.toFixed(2)}`);
    status = 'mismatch';
  } else if (!apiMatchesDB) {
    issues.push(`⚠️ API: Price mismatch with DB - API=$${apiPrice?.toFixed(2)}, DB=$${dbPrice?.toFixed(2)}`);
    status = 'mismatch';
  }
  
  // Additional checks
  if (hasPriceInDB && !hasPriceInRedis) {
    issues.push('⚠️ Redis: Price not cached (not critical)');
  }
  
  if (hasPriceInDB && dbLastUpdate) {
    const ageMinutes = (Date.now() - dbLastUpdate.getTime()) / 1000 / 60;
    if (ageMinutes > 60) {
      issues.push(`⚠️ DB: Price is ${ageMinutes.toFixed(0)} minutes old`);
    }
  }
  
  if (hasPriceInAPI && !apiPreviousClose) {
    issues.push('⚠️ API: PreviousClose missing');
  }
  
  if (hasPriceInAPI && apiPercentChange === null) {
    issues.push('⚠️ API: PercentChange missing');
  }
  
  return {
    ticker,
    dbPrice,
    dbPreviousClose,
    dbLastUpdate,
    dbPercentChange,
    redisPrice,
    redisPreviousClose,
    polygonCurrentPrice,
    polygonPreviousClose,
    polygonTimestamp,
    apiPrice,
    apiPreviousClose,
    apiPercentChange,
    apiMarketCap,
    hasPriceInDB,
    hasPriceInRedis,
    hasPriceInPolygon,
    hasPriceInAPI,
    dbMatchesPolygon,
    apiMatchesPolygon,
    apiMatchesDB,
    issues,
    status
  };
}

async function main() {
  const tickersArg = process.argv[2];
  const tickers = tickersArg 
    ? tickersArg.split(',').map(t => t.trim().toUpperCase())
    : ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA']; // Default tickers
  
  console.log('🔍 Checking price pipeline for tickers...\n');
  console.log(`📋 Tickers to check: ${tickers.join(', ')}\n`);
  
  const apiKey = requireEnv('POLYGON_API_KEY');
  const today = getDateET();
  const todayTradingDay = getLastTradingDay(createETDate(today));
  const todayTradingDateStr = getDateET(todayTradingDay);
  
  console.log(`📅 Today (ET): ${today}`);
  console.log(`📅 Trading day: ${todayTradingDateStr}\n`);
  console.log('='.repeat(120) + '\n');
  
  const results: PricePipelineCheck[] = [];
  
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    console.log(`[${i + 1}/${tickers.length}] Checking ${ticker}...`);
    
    const result = await checkTicker(ticker, apiKey, todayTradingDateStr);
    results.push(result);
    
    // Rate limiting
    if (i < tickers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(120));
  console.log('📊 SUMMARY\n');
  
  const byStatus = {
    ok: results.filter(r => r.status === 'ok'),
    missing_in_db: results.filter(r => r.status === 'missing_in_db'),
    missing_in_api: results.filter(r => r.status === 'missing_in_api'),
    stale: results.filter(r => r.status === 'stale'),
    mismatch: results.filter(r => r.status === 'mismatch')
  };
  
  console.log(`✅ OK: ${byStatus.ok.length}`);
  console.log(`❌ Missing in DB (we don't know the price): ${byStatus.missing_in_db.length}`);
  console.log(`❌ Missing in API (we know it but don't send to FE): ${byStatus.missing_in_api.length}`);
  console.log(`⚠️ Stale (DB price outdated): ${byStatus.stale.length}`);
  console.log(`⚠️ Mismatch (prices don't match): ${byStatus.mismatch.length}\n`);
  
  // Detailed results
  console.log('='.repeat(120));
  console.log('📋 DETAILED RESULTS\n');
  
  for (const result of results) {
    const statusIcon = result.status === 'ok' ? '✅' : 
                      result.status === 'missing_in_db' ? '❌' : 
                      result.status === 'missing_in_api' ? '🔴' : '⚠️';
    
    console.log(`${statusIcon} ${result.ticker}`);
    console.log(`   Polygon (truth): $${result.polygonCurrentPrice?.toFixed(2) || 'N/A'}`);
    console.log(`   DB:              $${result.dbPrice?.toFixed(2) || 'N/A'} ${result.dbMatchesPolygon ? '✅' : '❌'}`);
    console.log(`   API (to FE):     $${result.apiPrice?.toFixed(2) || 'N/A'} ${result.apiMatchesPolygon ? '✅' : '❌'}`);
    console.log(`   Redis:           $${result.redisPrice?.toFixed(2) || 'N/A'}`);
    
    if (result.issues.length > 0) {
      console.log(`   Issues:`);
      result.issues.forEach(issue => console.log(`     ${issue}`));
    }
    console.log('');
  }
  
  // Table format
  console.log('='.repeat(120));
  console.log('📊 COMPARISON TABLE\n');
  console.log('Ticker | Polygon | DB      | API     | Redis   | Status');
  console.log('-'.repeat(80));
  
  for (const result of results) {
    const poly = result.polygonCurrentPrice?.toFixed(2) || 'N/A';
    const db = result.dbPrice?.toFixed(2) || 'N/A';
    const api = result.apiPrice?.toFixed(2) || 'N/A';
    const redis = result.redisPrice?.toFixed(2) || 'N/A';
    const status = result.status === 'ok' ? '✅' : 
                   result.status === 'missing_in_db' ? '❌ DB' : 
                   result.status === 'missing_in_api' ? '❌ API' : 
                   result.status === 'stale' ? '⚠️ Stale' : '⚠️ Mismatch';
    
    console.log(`${result.ticker.padEnd(6)} | ${poly.padStart(7)} | ${db.padStart(7)} | ${api.padStart(7)} | ${redis.padStart(7)} | ${status}`);
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

/**
 * Compare percent change values between production and localhost
 * Run: npx tsx scripts/compare-prod-localhost-pct.ts
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

// Production URL (update if needed)
const PROD_URL = process.env.PROD_URL || 'https://premarketprice.com';

interface StockData {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  regularClose: number | null;
  percentChange: number;
  session: string;
  referenceUsed: string | null;
}

async function fetchFromAPI(url: string, endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${url}${endpoint}`, {
      headers: {
        'User-Agent': 'PMP-Data-Comparison-Script'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Error fetching ${url}${endpoint}:`, error);
    return null;
  }
}

async function getLocalhostData(symbols: string[]): Promise<Map<string, StockData>> {
  console.log(`\n📊 Fetching localhost data for ${symbols.length} symbols...`);
  
  const result = new Map<string, StockData>();
  const etNow = new Date();
  const session = detectSession(etNow);
  
  // Get tickers from DB
  const tickers = await prisma.ticker.findMany({
    where: { symbol: { in: symbols } },
    select: {
      symbol: true,
      lastPrice: true,
      latestPrevClose: true,
      lastPriceUpdated: true,
    }
  });
  
  // Get SessionPrice data
  const sessionPrices = await prisma.sessionPrice.findMany({
    where: { symbol: { in: symbols } },
    select: {
      symbol: true,
      lastPrice: true,
      lastTs: true,
    }
  });
  
  // Get DailyRef for regularClose
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  
  const dailyRefs = await prisma.dailyRef.findMany({
    where: {
      symbol: { in: symbols },
      date: {
        gte: today,
        lte: todayEnd,
      },
    },
    select: {
      symbol: true,
      regularClose: true,
    }
  });
  
  const regularCloseMap = new Map(dailyRefs.map(dr => [dr.symbol, dr.regularClose]));
  
  for (const symbol of symbols) {
    const ticker = tickers.find(t => t.symbol === symbol);
    const sessionPrice = sessionPrices.find(sp => sp.symbol === symbol);
    const regularClose = regularCloseMap.get(symbol) || null;
    
    // Get best price (SessionPrice if newer, else Ticker.lastPrice)
    let currentPrice = 0;
    if (sessionPrice && ticker) {
      const spTime = sessionPrice.lastTs.getTime();
      const tickerTime = (ticker.lastPriceUpdated || new Date()).getTime();
      currentPrice = spTime > tickerTime ? sessionPrice.lastPrice : (ticker.lastPrice || 0);
    } else if (sessionPrice) {
      currentPrice = sessionPrice.lastPrice;
    } else if (ticker) {
      currentPrice = ticker.lastPrice || 0;
    }
    
    const previousClose = ticker?.latestPrevClose || 0;
    
    // Calculate percent change
    const pct = calculatePercentChange(
      currentPrice,
      session,
      previousClose > 0 ? previousClose : null,
      regularClose && regularClose > 0 ? regularClose : null
    );
    
    result.set(symbol, {
      symbol,
      currentPrice,
      previousClose,
      regularClose,
      percentChange: pct.changePct,
      session,
      referenceUsed: pct.reference.used,
    });
  }
  
  return result;
}

async function getProductionData(symbols: string[]): Promise<Map<string, StockData>> {
  console.log(`\n🌐 Fetching production data for ${symbols.length} symbols...`);
  
  const result = new Map<string, StockData>();
  
  // Fetch heatmap data from production (contains all tickers with percentChange)
  const prodData = await fetchFromAPI(PROD_URL, '/api/heatmap');
  
  if (!prodData) {
    console.error('❌ Failed to fetch production data - API returned null');
    return result;
  }
  
  // Check different possible response formats
  const stocks = prodData.stocks || prodData.data || [];
  
  if (stocks.length === 0) {
    console.error(`❌ No stocks found in production response. Response keys: ${Object.keys(prodData).join(', ')}`);
    console.error(`   Sample response: ${JSON.stringify(prodData).substring(0, 200)}...`);
    return result;
  }
  
  console.log(`   Found ${stocks.length} stocks in production response`);
  
  for (const stock of stocks) {
    // Handle both 'symbol' and 'ticker' field names
    const symbol = stock.symbol || stock.ticker;
    if (symbol && symbols.includes(symbol)) {
      result.set(symbol, {
        symbol: symbol,
        currentPrice: stock.currentPrice || stock.price || 0,
        previousClose: stock.previousClose || stock.closePrice || 0,
        regularClose: stock.regularClose || null,
        percentChange: stock.percentChange || stock.changePercent || 0,
        session: prodData.session || 'unknown',
        referenceUsed: null, // Not available from API
      });
    }
  }
  
  return result;
}

async function main() {
  console.log('🔍 Comparing percent changes between production and localhost...\n');
  
  // Get sample of tickers to compare (top 50 by market cap or random)
  const allTickers = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      latestPrevClose: { gt: 0 },
    },
    select: { symbol: true },
    take: 50,
    orderBy: { lastMarketCap: 'desc' }
  });
  
  const symbols = allTickers.map(t => t.symbol);
  console.log(`📋 Comparing ${symbols.length} tickers: ${symbols.slice(0, 10).join(', ')}...`);
  
  const [localhostData, prodData] = await Promise.all([
    getLocalhostData(symbols),
    getProductionData(symbols)
  ]);
  
  console.log(`\n✅ Localhost: ${localhostData.size} tickers`);
  console.log(`✅ Production: ${prodData.size} tickers\n`);
  
  // Compare
  const differences: Array<{
    symbol: string;
    localhost: number;
    production: number;
    diff: number;
    localhostPrice: number;
    prodPrice: number;
    localhostPrevClose: number;
    prodPrevClose: number;
  }> = [];
  
  for (const symbol of symbols) {
    const local = localhostData.get(symbol);
    const prod = prodData.get(symbol);
    
    if (!local || !prod) {
      if (!local) console.log(`⚠️ ${symbol}: Missing in localhost`);
      if (!prod) console.log(`⚠️ ${symbol}: Missing in production`);
      continue;
    }
    
    const diff = Math.abs(local.percentChange - prod.percentChange);
    
    // Report if difference is significant (> 0.01%)
    if (diff > 0.01) {
      differences.push({
        symbol,
        localhost: local.percentChange,
        production: prod.percentChange,
        diff,
        localhostPrice: local.currentPrice,
        prodPrice: prod.currentPrice,
        localhostPrevClose: local.previousClose,
        prodPrevClose: prod.previousClose,
      });
    }
  }
  
  // Report results
  if (differences.length === 0) {
    console.log('✅ No significant differences found!');
  } else {
    console.log(`\n⚠️ Found ${differences.length} tickers with differences > 0.01%:\n`);
    
    // Sort by difference (largest first)
    differences.sort((a, b) => b.diff - a.diff);
    
    console.log('Symbol | Localhost % | Production % | Diff | Local Price | Prod Price | Local PrevClose | Prod PrevClose');
    console.log('------|------------|-------------|------|------------|------------|----------------|---------------');
    
    for (const d of differences.slice(0, 20)) {
      console.log(
        `${d.symbol.padEnd(6)} | ${d.localhost.toFixed(2).padStart(10)}% | ${d.production.toFixed(2).padStart(11)}% | ${d.diff.toFixed(2).padStart(4)}% | ${d.localhostPrice.toFixed(2).padStart(10)} | ${d.prodPrice.toFixed(2).padStart(10)} | ${d.localhostPrevClose.toFixed(2).padStart(14)} | ${d.prodPrevClose.toFixed(2).padStart(13)}`
      );
    }
    
    if (differences.length > 20) {
      console.log(`\n... and ${differences.length - 20} more`);
    }
  }
  
  // Summary statistics
  const allDiffs = differences.map(d => d.diff);
  if (allDiffs.length > 0) {
    const avgDiff = allDiffs.reduce((a, b) => a + b, 0) / allDiffs.length;
    const maxDiff = Math.max(...allDiffs);
    console.log(`\n📊 Statistics:`);
    console.log(`   Average difference: ${avgDiff.toFixed(2)}%`);
    console.log(`   Maximum difference: ${maxDiff.toFixed(2)}%`);
  }
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

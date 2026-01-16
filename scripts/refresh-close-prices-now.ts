/**
 * Script to refresh close prices NOW (without reset)
 * Run: npx tsx scripts/refresh-close-prices-now.ts
 * 
 * This script:
 * 1. Finds tickers missing regularClose or previousClose
 * 2. Fetches missing close prices from Polygon API
 * 3. Updates database (does NOT reset existing values)
 * 
 * Safe to run on production - only fills missing data
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
import { getUniverse } from '@/lib/redis/operations';
import { bootstrapPreviousCloses } from '@/workers/polygonWorker';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { setPrevClose } from '@/lib/redis/operations';
import { withRetry } from '@/lib/api/rateLimiter';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`❌ ${key} not configured`);
    throw new Error(`${key} is required`);
  }
  return value;
}

/**
 * Fetch regular close for a specific date from Polygon API
 */
async function fetchRegularCloseForDate(
  ticker: string,
  date: string, // YYYY-MM-DD
  apiKey: string
): Promise<number | null> {
  try {
    const rangeUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&apiKey=${apiKey}`;
    const response = await withRetry(async () => {
      const res = await fetch(rangeUrl);
      if (!res.ok && res.status === 429) {
        throw new Error(`Rate limited: ${res.status}`);
      }
      return res;
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const close = data?.results?.[0]?.c;
    
    if (typeof close === 'number' && close > 0) {
      return close;
    }
    
    return null;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch regular close for ${ticker} on ${date}:`, error);
    return null;
  }
}

async function main() {
  console.log('🔄 Starting refresh of close prices (fill missing only)...');
  
  const apiKey = requireEnv('POLYGON_API_KEY');
  
  // Get trading days
  const today = getDateET();
  const todayDate = createETDate(today);
  const todayTradingDay = getLastTradingDay(todayDate);
  const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
  
  const yesterdayDateStr = getDateET(yesterdayTradingDay);
  const todayDateStr = getDateET(todayTradingDay);
  
  console.log(`📅 Today trading day: ${todayDateStr}`);
  console.log(`📅 Yesterday trading day: ${yesterdayDateStr}`);
  
  try {
    // Get all tickers
    let tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      console.log('⚠️  Universe is empty, getting tickers from database...');
      const dbTickers = await prisma.ticker.findMany({
        where: { lastPrice: { gt: 0 } },
        select: { symbol: true }
      });
      tickers = dbTickers.map(t => t.symbol);
    }
    
    if (tickers.length === 0) {
      console.error('❌ No tickers found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${tickers.length} tickers to check`);
    
    // Find tickers missing regularClose or previousClose
    const tickersNeedingRefresh: string[] = [];
    let missingRegularClose = 0;
    let missingPreviousClose = 0;
    
    console.log('\n📝 Checking which tickers need refresh...');
    
    for (const ticker of tickers) {
      const yesterdayRef = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol: ticker,
            date: yesterdayTradingDay
          }
        },
        select: { regularClose: true }
      });

      const todayRef = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol: ticker,
            date: todayTradingDay
          }
        },
        select: { previousClose: true }
      });

      const needsRefresh = !yesterdayRef?.regularClose || !todayRef?.previousClose;

      if (needsRefresh) {
        tickersNeedingRefresh.push(ticker);
        if (!yesterdayRef?.regularClose) missingRegularClose++;
        if (!todayRef?.previousClose) missingPreviousClose++;
      }
    }
    
    console.log(`📊 Found ${tickersNeedingRefresh.length} tickers needing refresh:`);
    console.log(`   - ${missingRegularClose} missing regularClose`);
    console.log(`   - ${missingPreviousClose} missing previousClose`);
    
    if (tickersNeedingRefresh.length === 0) {
      console.log('✅ All tickers already have close prices - nothing to do!');
      await prisma.$disconnect();
      process.exit(0);
    }
    
    // Option 1: Use bootstrapPreviousCloses (faster, batch processing)
    console.log('\n📝 Option 1: Using bootstrapPreviousCloses (recommended)...');
    console.log(`🔄 Bootstrapping previous closes for ${tickersNeedingRefresh.length} tickers...`);
    await bootstrapPreviousCloses(tickersNeedingRefresh, apiKey, today);
    console.log('✅ Bootstrap complete');
    
    // Option 2: Manual fetch for any remaining missing (fallback)
    console.log('\n📝 Option 2: Checking for any remaining missing values...');
    let refreshed = 0;
    const MAX_CONCURRENT = 5;
    
    for (let i = 0; i < tickersNeedingRefresh.length; i += MAX_CONCURRENT) {
      const batch = tickersNeedingRefresh.slice(i, i + MAX_CONCURRENT);
      
      await Promise.all(batch.map(async (ticker) => {
        try {
          // Check if still missing
          const yesterdayRef = await prisma.dailyRef.findUnique({
            where: {
              symbol_date: {
                symbol: ticker,
                date: yesterdayTradingDay
              }
            },
            select: { regularClose: true }
          });

          const todayRef = await prisma.dailyRef.findUnique({
            where: {
              symbol_date: {
                symbol: ticker,
                date: todayTradingDay
              }
            },
            select: { previousClose: true }
          });

          let regularClose: number | null = null;
          let previousClose: number | null = null;
          
          // Fetch regularClose if missing
          if (!yesterdayRef?.regularClose) {
            regularClose = await fetchRegularCloseForDate(ticker, yesterdayDateStr, apiKey);
            
            if (regularClose && regularClose > 0) {
              await prisma.dailyRef.upsert({
                where: {
                  symbol_date: {
                    symbol: ticker,
                    date: yesterdayTradingDay
                  }
                },
                update: {
                  regularClose,
                  previousClose: regularClose
                },
                create: {
                  symbol: ticker,
                  date: yesterdayTradingDay,
                  regularClose,
                  previousClose: regularClose
                }
              });
              refreshed++;
            }
          }
          
          // Fetch previousClose if missing
          if (!todayRef?.previousClose) {
            if (regularClose && regularClose > 0) {
              previousClose = regularClose;
            } else {
              previousClose = await fetchRegularCloseForDate(ticker, yesterdayDateStr, apiKey);
            }

            if (previousClose && previousClose > 0) {
              await prisma.dailyRef.upsert({
                where: {
                  symbol_date: {
                    symbol: ticker,
                    date: todayTradingDay
                  }
                },
                update: {
                  previousClose
                },
                create: {
                  symbol: ticker,
                  date: todayTradingDay,
                  previousClose
                }
              });

              // Update Redis cache
              try {
                await setPrevClose(todayDateStr, ticker, previousClose);
              } catch (error) {
                // Non-fatal
              }

              // Update Ticker.latestPrevClose
              await prisma.ticker.update({
                where: { symbol: ticker },
                data: {
                  latestPrevClose: previousClose,
                  latestPrevCloseDate: yesterdayTradingDay,
                  updatedAt: new Date()
                }
              });
              
              if (!regularClose) refreshed++;
            }
          }
        } catch (error) {
          console.error(`❌ Error processing ${ticker}:`, error);
        }
      }));
      
      // Rate limiting
      if (i + MAX_CONCURRENT < tickersNeedingRefresh.length) {
        await new Promise(resolve => setTimeout(resolve, 15000)); // 15s delay
      }
    }
    
    console.log(`\n✅ Refresh complete! Updated ${refreshed} tickers`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

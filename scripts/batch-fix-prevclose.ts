/**
 * Batch fix script to correct previousClose values for all tickers
 * Compares DB values with Polygon API and fixes mismatches
 * 
 * Usage: npx tsx scripts/batch-fix-prevclose.ts [--limit N] [--dry-run]
 */

import { prisma } from '../src/lib/db/prisma';
import { getDateET, createETDate } from '../src/lib/utils/dateET';
import { getLastTradingDay } from '../src/lib/utils/timeUtils';
import { setPrevClose } from '../src/lib/redis/operations';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface PolygonPrevResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: Array<{
    T: string;
    v: number;
    vw: number;
    o: number;
    c: number;
    h: number;
    l: number;
    t: number;
    n: number;
  }>;
  status: string;
  request_id: string;
  count: number;
}

async function fetchPreviousCloseFromPolygon(ticker: string): Promise<number | null> {
  if (!POLYGON_API_KEY) {
    return null;
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return null;
    }

    const data: PolygonPrevResponse = await response.json();
    if (!data?.results?.[0]?.c || data.results[0].c <= 0) {
      return null;
    }

    return data.results[0].c;
  } catch (error) {
    return null;
  }
}

async function fixTicker(ticker: string, dryRun: boolean): Promise<{ fixed: boolean; diff: number; error?: string }> {
  try {
    // Get current DB value
    const tickerRecord = await prisma.ticker.findUnique({
      where: { symbol: ticker },
      select: {
        symbol: true,
        latestPrevClose: true,
        latestPrevCloseDate: true
      }
    });

    if (!tickerRecord || !tickerRecord.latestPrevClose) {
      return { fixed: false, diff: 0, error: 'no_prev_close' };
    }

    const dbPrevClose = tickerRecord.latestPrevClose;

    // Fetch correct value from Polygon
    const correctPrevClose = await fetchPreviousCloseFromPolygon(ticker);
    if (!correctPrevClose) {
      return { fixed: false, diff: 0, error: 'fetch_failed' };
    }

    // Compare
    const diff = Math.abs(dbPrevClose - correctPrevClose);
    if (diff <= 0.01) {
      return { fixed: false, diff };
    }

    // Fix if not dry run
    if (!dryRun) {
      const today = createETDate(getDateET());
      const lastTradingDay = getLastTradingDay(today);

      // Update Ticker table
      await prisma.ticker.update({
        where: { symbol: ticker },
        data: {
          latestPrevClose: correctPrevClose,
          latestPrevCloseDate: lastTradingDay,
          updatedAt: new Date()
        }
      });

      // Update DailyRef table
      await prisma.dailyRef.upsert({
        where: {
          symbol_date: {
            symbol: ticker,
            date: lastTradingDay
          }
        },
        update: {
          previousClose: correctPrevClose,
          updatedAt: new Date()
        },
        create: {
          symbol: ticker,
          date: lastTradingDay,
          previousClose: correctPrevClose
        }
      });

      // Update Redis cache
      try {
        const todayStr = getDateET();
        await setPrevClose(todayStr, ticker, correctPrevClose);
      } catch (error) {
        // Non-fatal
      }
    }

    return { fixed: !dryRun, diff };
  } catch (error) {
    return { fixed: false, diff: 0, error: 'exception' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '0') : undefined;

  console.log('🔍 Batch fixing previousClose values...');
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE: No changes will be made');
  } else {
    console.log('⚠️  FIX MODE: Will update incorrect values');
  }

  // Get all tickers with prices
  const tickers = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      latestPrevClose: { gt: 0 }
    },
    select: {
      symbol: true
    },
    orderBy: {
      symbol: 'asc'
    },
    ...(limit ? { take: limit } : {})
  });

  console.log(`\n📊 Found ${tickers.length} tickers to check`);

  const results = {
    checked: 0,
    needsFix: 0,
    fixed: 0,
    errors: 0,
    issues: [] as Array<{ ticker: string; diff: number; error?: string }>
  };

  // Process in batches with rate limiting
  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchPromises = batch.map(async (t) => {
      const result = await fixTicker(t.symbol, dryRun);
      results.checked++;

      if (result.error) {
        results.errors++;
      } else if (result.diff > 0.01) {
        results.needsFix++;
        results.issues.push({ ticker: t.symbol, diff: result.diff });
        if (result.fixed) {
          results.fixed++;
        }
      }

      return { ticker: t.symbol, ...result };
    });

    const batchResults = await Promise.all(batchPromises);

    // Log progress
    const fixedInBatch = batchResults.filter(r => r.fixed).length;
    const needsFixInBatch = batchResults.filter(r => r.diff > 0.01 && !r.fixed).length;

    if (fixedInBatch > 0 || needsFixInBatch > 0) {
      console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}:`);
      batchResults.forEach(r => {
        if (r.diff > 0.01) {
          if (r.fixed) {
            console.log(`   ✅ Fixed ${r.ticker}: $${r.diff.toFixed(2)} difference`);
          } else {
            console.log(`   ⚠️  ${r.ticker} needs fix: $${r.diff.toFixed(2)} difference`);
          }
        }
      });
    }

    // Rate limiting: 20 requests per minute (Polygon limit)
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between batches
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Checked: ${results.checked}`);
  console.log(`   Needs Fix: ${results.needsFix}`);
  if (!dryRun) {
    console.log(`   Fixed: ${results.fixed}`);
  }
  console.log(`   Errors: ${results.errors}`);

  if (results.issues.length > 0) {
    console.log('\n⚠️  Tickers with issues:');
    results.issues
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 20)
      .forEach(issue => {
        console.log(`   - ${issue.ticker}: $${issue.diff.toFixed(2)} difference`);
      });
    if (results.issues.length > 20) {
      console.log(`   ... and ${results.issues.length - 20} more`);
    }
  }

  if (dryRun && results.needsFix > 0) {
    console.log('\n💡 Run without --dry-run to fix these issues');
  }

  console.log('\n✅ Done!');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

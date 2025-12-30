/**
 * Script to check all tickers in database for incorrect closing prices
 * Compares database values with Polygon API /prev endpoint
 */

import { prisma } from '../src/lib/db/prisma';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const BATCH_SIZE = 10; // Process 10 tickers at a time to avoid rate limits
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches

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

interface CheckResult {
  ticker: string;
  dbValue: number;
  apiValue: number | null;
  difference: number;
  differencePercent: number;
  hasError: boolean;
  error?: string;
}

async function checkTicker(ticker: string, dbValue: number): Promise<CheckResult> {
  const apiValue = await fetchPreviousCloseFromPolygon(ticker);

  if (apiValue === null) {
    return {
      ticker,
      dbValue,
      apiValue: null,
      difference: 0,
      differencePercent: 0,
      hasError: true,
      error: 'Could not fetch from Polygon API'
    };
  }

  const difference = Math.abs(dbValue - apiValue);
  const differencePercent = (difference / apiValue) * 100;

  return {
    ticker,
    dbValue,
    apiValue,
    difference,
    differencePercent,
    hasError: false
  };
}

async function checkAllTickers() {
  console.log('🔍 Loading all tickers from database...');

  // Get all tickers with previous close
  const tickers = await prisma.ticker.findMany({
    where: {
      latestPrevClose: { gt: 0 } // Only check tickers with a previous close
    },
    select: {
      symbol: true,
      latestPrevClose: true
    },
    orderBy: {
      symbol: 'asc'
    }
  });

  console.log(`✅ Found ${tickers.length} tickers to check\n`);

  const results: CheckResult[] = [];
  const problematic: CheckResult[] = [];
  const errors: CheckResult[] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tickers.length / BATCH_SIZE);

    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} tickers)...`);

    const batchPromises = batch.map(ticker =>
      checkTicker(ticker.symbol, ticker.latestPrevClose)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Categorize results
    batchResults.forEach(result => {
      if (result.hasError) {
        errors.push(result);
      } else if (result.difference > 0.01) { // More than 1 cent difference
        problematic.push(result);
      }
    });

    // Show progress
    const processed = Math.min(i + BATCH_SIZE, tickers.length);
    console.log(`   Progress: ${processed}/${tickers.length} (${problematic.length} problematic, ${errors.length} errors)`);

    // Delay between batches (except for the last one)
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total tickers checked: ${results.length}`);
  console.log(`✅ Correct: ${results.length - problematic.length - errors.length}`);
  console.log(`⚠️  Problematic (difference > $0.01): ${problematic.length}`);
  console.log(`❌ Errors (could not fetch from API): ${errors.length}`);

  if (problematic.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('⚠️  PROBLEMATIC TICKERS (difference > $0.01)');
    console.log('='.repeat(80));
    console.log('Ticker | DB Value | API Value | Difference | Difference %');
    console.log('-'.repeat(80));
    
    // Sort by difference percent (largest first)
    problematic.sort((a, b) => b.differencePercent - a.differencePercent);
    
    problematic.forEach(result => {
      console.log(
        `${result.ticker.padEnd(6)} | $${result.dbValue.toFixed(2).padStart(8)} | $${result.apiValue!.toFixed(2).padStart(9)} | $${result.difference.toFixed(2).padStart(10)} | ${result.differencePercent.toFixed(2)}%`
      );
    });

    console.log('\n💡 To fix these tickers, run:');
    const tickerList = problematic.map(r => r.ticker).join(' ');
    console.log(`   npx tsx scripts/fix-closing-price.ts ${tickerList}`);
  }

  if (errors.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ TICKERS WITH ERRORS (could not fetch from API)');
    console.log('='.repeat(80));
    errors.forEach(result => {
      console.log(`   ${result.ticker}: ${result.error}`);
    });
  }

  // Show top 10 largest differences
  if (problematic.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('🔝 TOP 10 LARGEST DIFFERENCES');
    console.log('='.repeat(80));
    problematic
      .sort((a, b) => b.differencePercent - a.differencePercent)
      .slice(0, 10)
      .forEach((result, index) => {
        console.log(
          `${index + 1}. ${result.ticker}: $${result.dbValue.toFixed(2)} → $${result.apiValue!.toFixed(2)} (${result.differencePercent.toFixed(2)}% difference)`
        );
      });
  }

  console.log('\n✅ Done!');
}

async function main() {
  await checkAllTickers();
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


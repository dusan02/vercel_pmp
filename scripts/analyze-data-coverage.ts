/**
 * Script to analyze data coverage statistics for all tickers
 * Shows coverage percentages for price, shares outstanding, market cap, sector, and industry
 */

import { prisma } from '../src/lib/db/prisma';

interface CoverageStats {
  totalTickers: number;
  withPrice: number;
  withSharesOutstanding: number;
  withMarketCap: number;
  withSector: number;
  withIndustry: number;
  withBothSectorIndustry: number;
  withAllData: number;
}

async function analyzeDataCoverage() {
  console.log('📊 Analyzing data coverage statistics...\n');

  // Get all tickers
  const allTickers = await prisma.ticker.findMany({
    select: {
      symbol: true,
      name: true,
      sharesOutstanding: true,
      sector: true,
      industry: true
    },
    orderBy: {
      symbol: 'asc'
    }
  });

  const totalTickers = allTickers.length;
  console.log(`📈 Total tickers in database: ${totalTickers}\n`);

  // Get current date range for price data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get price data from SessionPrice (last 7 days)
  const pricesWithData = await prisma.sessionPrice.findMany({
    where: {
      date: {
        gte: weekAgo,
        lt: tomorrow
      },
      lastPrice: {
        gt: 0
      }
    },
    select: {
      symbol: true,
      lastPrice: true
    },
    distinct: ['symbol']
  });

  const symbolsWithPrice = new Set(pricesWithData.map(p => p.symbol));
  const priceMap = new Map(pricesWithData.map(p => [p.symbol, p.lastPrice]));

  // Calculate statistics
  let withPrice = 0;
  let withSharesOutstanding = 0;
  let withMarketCap = 0;
  let withSector = 0;
  let withIndustry = 0;
  let withBothSectorIndustry = 0;
  let withAllData = 0;

  for (const ticker of allTickers) {
    const hasPrice = symbolsWithPrice.has(ticker.symbol);
    const hasShares = ticker.sharesOutstanding && ticker.sharesOutstanding > 0;
    const hasSector = !!ticker.sector;
    const hasIndustry = !!ticker.industry;
    
    // Market cap can be calculated if we have both price and shares
    const canCalculateMarketCap = hasPrice && hasShares;
    
    if (hasPrice) withPrice++;
    if (hasShares) withSharesOutstanding++;
    if (canCalculateMarketCap) withMarketCap++;
    if (hasSector) withSector++;
    if (hasIndustry) withIndustry++;
    if (hasSector && hasIndustry) withBothSectorIndustry++;
    
    // All data means: price, shares, sector, and industry
    if (hasPrice && hasShares && hasSector && hasIndustry) {
      withAllData++;
    }
  }

  const stats: CoverageStats = {
    totalTickers,
    withPrice,
    withSharesOutstanding,
    withMarketCap,
    withSector,
    withIndustry,
    withBothSectorIndustry,
    withAllData
  };

  // Display results in a table format
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    DATA COVERAGE STATISTICS                    ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║                                                                ║');
  console.log(`║  Total Tickers:                          ${totalTickers.toString().padStart(6)}  ║`);
  console.log('║                                                                ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  Data Field              │  Count      │  Coverage              ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  
  const formatRow = (label: string, count: number, total: number) => {
    const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const countStr = count.toString().padStart(6);
    const pctStr = percentage.padStart(5) + '%';
    const labelStr = label.padEnd(24);
    return `║  ${labelStr} │ ${countStr}     │ ${pctStr.padEnd(20)} ║`;
  };

  console.log(formatRow('Current Price', stats.withPrice, stats.totalTickers));
  console.log(formatRow('Shares Outstanding', stats.withSharesOutstanding, stats.totalTickers));
  console.log(formatRow('Market Cap (calc)', stats.withMarketCap, stats.totalTickers));
  console.log(formatRow('Sector', stats.withSector, stats.totalTickers));
  console.log(formatRow('Industry', stats.withIndustry, stats.totalTickers));
  console.log(formatRow('Sector + Industry', stats.withBothSectorIndustry, stats.totalTickers));
  console.log(formatRow('All Data Complete', stats.withAllData, stats.totalTickers));
  
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Additional breakdown
  console.log('📊 Detailed Breakdown:\n');
  
  const missingPrice = stats.totalTickers - stats.withPrice;
  const missingShares = stats.totalTickers - stats.withSharesOutstanding;
  const missingMarketCap = stats.totalTickers - stats.withMarketCap;
  const missingSector = stats.totalTickers - stats.withSector;
  const missingIndustry = stats.totalTickers - stats.withIndustry;
  const missingAll = stats.totalTickers - stats.withAllData;

  console.log(`✅ Tickers with current price:        ${stats.withPrice} (${((stats.withPrice / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing current price:       ${missingPrice} (${((missingPrice / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with shares outstanding:   ${stats.withSharesOutstanding} (${((stats.withSharesOutstanding / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing shares outstanding: ${missingShares} (${((missingShares / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with market cap (calc):     ${stats.withMarketCap} (${((stats.withMarketCap / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing market cap:         ${missingMarketCap} (${((missingMarketCap / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with sector:               ${stats.withSector} (${((stats.withSector / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing sector:             ${missingSector} (${((missingSector / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with industry:             ${stats.withIndustry} (${((stats.withIndustry / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing industry:           ${missingIndustry} (${((missingIndustry / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with sector + industry:    ${stats.withBothSectorIndustry} (${((stats.withBothSectorIndustry / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  console.log(`✅ Tickers with ALL data complete:    ${stats.withAllData} (${((stats.withAllData / stats.totalTickers) * 100).toFixed(1)}%)`);
  console.log(`❌ Tickers missing some data:          ${missingAll} (${((missingAll / stats.totalTickers) * 100).toFixed(1)}%)\n`);

  // Show sample tickers missing data
  const tickersMissingPrice = allTickers.filter(t => !symbolsWithPrice.has(t.symbol)).slice(0, 10);
  const tickersMissingShares = allTickers.filter(t => !t.sharesOutstanding || t.sharesOutstanding <= 0).slice(0, 10);
  const tickersMissingSector = allTickers.filter(t => !t.sector).slice(0, 10);
  const tickersMissingIndustry = allTickers.filter(t => !t.industry).slice(0, 10);

  if (tickersMissingPrice.length > 0) {
    console.log('📋 Sample tickers missing current price:');
    tickersMissingPrice.forEach(t => {
      console.log(`   - ${t.symbol} (${t.name || 'N/A'})`);
    });
    if (missingPrice > 10) {
      console.log(`   ... and ${missingPrice - 10} more\n`);
    } else {
      console.log('');
    }
  }

  if (tickersMissingShares.length > 0) {
    console.log('📋 Sample tickers missing shares outstanding:');
    tickersMissingShares.forEach(t => {
      console.log(`   - ${t.symbol} (${t.name || 'N/A'})`);
    });
    if (missingShares > 10) {
      console.log(`   ... and ${missingShares - 10} more\n`);
    } else {
      console.log('');
    }
  }

  if (tickersMissingSector.length > 0) {
    console.log('📋 Sample tickers missing sector:');
    tickersMissingSector.forEach(t => {
      console.log(`   - ${t.symbol} (${t.name || 'N/A'})`);
    });
    if (missingSector > 10) {
      console.log(`   ... and ${missingSector - 10} more\n`);
    } else {
      console.log('');
    }
  }

  if (tickersMissingIndustry.length > 0) {
    console.log('📋 Sample tickers missing industry:');
    tickersMissingIndustry.forEach(t => {
      console.log(`   - ${t.symbol} (${t.name || 'N/A'})`);
    });
    if (missingIndustry > 10) {
      console.log(`   ... and ${missingIndustry - 10} more\n`);
    } else {
      console.log('');
    }
  }

  return stats;
}

// Main execution
async function main() {
  try {
    await analyzeDataCoverage();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


/**
 * Check Data Completeness in Database
 * 
 * Verifies if database contains complete data:
 * - Prices
 * - Market cap (calculated)
 * - Market cap diff (calculated)
 * - Change percentage
 * - Company names, sectors, industries
 * 
 * Usage: tsx scripts/check-data-completeness.ts
 */

import { prisma } from '../src/lib/prisma';
import { getAllTrackedTickers } from '../src/lib/universeHelpers';
import { detectSession, nowET } from '../src/lib/timeUtils';
import { getSharesOutstanding } from '../src/lib/dbHelpers';

async function checkDataCompleteness() {
  console.log('\n📊 Data Completeness Check\n');
  console.log('='.repeat(60));
  
  try {
    const session = detectSession(nowET());
    const dbSession = session === 'live' ? 'regular' : session;
    const allTickers = await getAllTrackedTickers();
    
    // Get session prices with all fields
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: { in: allTickers },
        session: dbSession
      },
      select: {
        symbol: true,
        lastPrice: true,
        changePct: true,
        lastTs: true,
        source: true,
        quality: true
      },
      orderBy: { lastTs: 'desc' },
      distinct: ['symbol']
    });
    
    console.log(`\nSession: ${dbSession}`);
    console.log(`Total tickers with session prices: ${sessionPrices.length}`);
    
    // Check data completeness
    let hasPrice = 0;
    let hasChangePct = 0;
    let hasTimestamp = 0;
    let hasSource = 0;
    let hasQuality = 0;
    
    sessionPrices.forEach(sp => {
      if (sp.lastPrice && sp.lastPrice > 0) hasPrice++;
      if (sp.changePct !== null && sp.changePct !== undefined) hasChangePct++;
      if (sp.lastTs) hasTimestamp++;
      if (sp.source) hasSource++;
      if (sp.quality) hasQuality++;
    });
    
    console.log(`\n📊 Data Fields Completeness:`);
    console.log(`  - Price: ${hasPrice}/${sessionPrices.length} (${Math.round(hasPrice/sessionPrices.length*100)}%)`);
    console.log(`  - Change %: ${hasChangePct}/${sessionPrices.length} (${Math.round(hasChangePct/sessionPrices.length*100)}%)`);
    console.log(`  - Timestamp: ${hasTimestamp}/${sessionPrices.length} (${Math.round(hasTimestamp/sessionPrices.length*100)}%)`);
    console.log(`  - Source: ${hasSource}/${sessionPrices.length} (${Math.round(hasSource/sessionPrices.length*100)}%)`);
    console.log(`  - Quality: ${hasQuality}/${sessionPrices.length} (${Math.round(hasQuality/sessionPrices.length*100)}%)`);
    
    // Check ticker metadata
    const tickersWithMetadata = await prisma.ticker.findMany({
      where: {
        symbol: { in: sessionPrices.slice(0, 100).map(sp => sp.symbol) }
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        sharesOutstanding: true
      }
    });
    
    let hasName = 0;
    let hasSector = 0;
    let hasIndustry = 0;
    let hasShares = 0;
    
    tickersWithMetadata.forEach(t => {
      if (t.name && t.name !== t.symbol) hasName++;
      if (t.sector) hasSector++;
      if (t.industry) hasIndustry++;
      if (t.sharesOutstanding && t.sharesOutstanding > 0) hasShares++;
    });
    
    console.log(`\n📊 Ticker Metadata (sample of 100):`);
    console.log(`  - Company Name: ${hasName}/100 (${hasName}%)`);
    console.log(`  - Sector: ${hasSector}/100 (${hasSector}%)`);
    console.log(`  - Industry: ${hasIndustry}/100 (${hasIndustry}%)`);
    console.log(`  - Shares Outstanding: ${hasShares}/100 (${hasShares}%)`);
    
    // Calculate market cap for sample
    console.log(`\n📊 Market Cap Calculation (sample of 10):`);
    const sample = sessionPrices.slice(0, 10);
    for (const sp of sample) {
      try {
        const shares = await getSharesOutstanding(sp.symbol);
        const marketCap = sp.lastPrice && shares ? sp.lastPrice * shares : null;
        const marketCapFormatted = marketCap ? `$${(marketCap / 1e9).toFixed(2)}B` : 'N/A';
        
        console.log(`  - ${sp.symbol}:`);
        console.log(`      Price: $${sp.lastPrice?.toFixed(2) || 'N/A'}`);
        console.log(`      Shares: ${shares ? (shares / 1e6).toFixed(2) + 'M' : 'N/A'}`);
        console.log(`      Market Cap: ${marketCapFormatted}`);
        console.log(`      Change %: ${sp.changePct?.toFixed(2) || 'N/A'}%`);
      } catch (error) {
        console.log(`  - ${sp.symbol}: Error calculating market cap`);
      }
    }
    
    // Summary
    console.log(`\n✅ Summary:`);
    if (hasPrice === sessionPrices.length && hasChangePct === sessionPrices.length) {
      console.log(`  ✅ All tickers have price and change % data`);
    } else {
      console.log(`  ⚠️  Some tickers missing price or change % data`);
    }
    
    if (hasShares > 80) {
      console.log(`  ✅ Most tickers have shares outstanding (can calculate market cap)`);
    } else {
      console.log(`  ⚠️  Many tickers missing shares outstanding`);
    }
    
  } catch (error) {
    console.error('❌ Error checking data completeness:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('='.repeat(60));
}

checkDataCompleteness().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


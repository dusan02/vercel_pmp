/**
 * Check percent change status on production
 * Run: npx tsx scripts/check-prod-pct-status.ts
 */

// Production URL
const PROD_URL = process.env.PROD_URL || 'https://premarketprice.com';

interface StockData {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  percentChange: number;
  marketCap: number;
}

async function fetchFromAPI(url: string, endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${url}${endpoint}`, {
      headers: {
        'User-Agent': 'PMP-Status-Check-Script'
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

async function checkProductionStatus() {
  console.log('🔍 Checking production percent change status...\n');
  
  // Fetch heatmap data from production
  const prodData = await fetchFromAPI(PROD_URL, '/api/heatmap');
  
  if (!prodData || !prodData.data) {
    console.error('❌ Failed to fetch production data');
    return;
  }
  
  const stocks: StockData[] = prodData.data.map((stock: any) => ({
    symbol: stock.symbol || stock.ticker,
    currentPrice: stock.currentPrice || stock.price || 0,
    previousClose: stock.previousClose || stock.closePrice || 0,
    percentChange: stock.percentChange || stock.changePercent || 0,
    marketCap: stock.marketCap || 0,
  })).filter((s: StockData) => s.symbol && s.currentPrice > 0);
  
  console.log(`✅ Loaded ${stocks.length} stocks from production\n`);
  
  // Statistics
  const withPrevClose = stocks.filter(s => s.previousClose > 0);
  const withoutPrevClose = stocks.filter(s => s.previousClose === 0);
  
  console.log('📊 Previous Close Status:');
  console.log(`   ✅ With previousClose: ${withPrevClose.length} (${((withPrevClose.length / stocks.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Without previousClose: ${withoutPrevClose.length} (${((withoutPrevClose.length / stocks.length) * 100).toFixed(1)}%)`);
  
  // Percent change statistics
  const validChanges = stocks.filter(s => s.previousClose > 0 && Math.abs(s.percentChange) < 100);
  const sortedByChange = [...validChanges].sort((a, b) => b.percentChange - a.percentChange);
  
  console.log(`\n📈 Percent Change Statistics (${validChanges.length} stocks with valid data):`);
  
  if (sortedByChange.length > 0) {
    const maxGain = sortedByChange[0]!;
    const maxLoss = sortedByChange[sortedByChange.length - 1]!;
    const avgChange = sortedByChange.reduce((sum, s) => sum + s.percentChange, 0) / sortedByChange.length;
    
    console.log(`   🟢 Max Gain: ${maxGain.symbol} +${maxGain.percentChange.toFixed(2)}% ($${maxGain.currentPrice.toFixed(2)})`);
    console.log(`   🔴 Max Loss: ${maxLoss.symbol} ${maxLoss.percentChange.toFixed(2)}% ($${maxLoss.currentPrice.toFixed(2)})`);
    console.log(`   📊 Average: ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`);
    
    // Top 10 gainers
    console.log(`\n🟢 Top 10 Gainers:`);
    sortedByChange.slice(0, 10).forEach((s, i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${s.symbol.padEnd(6)} +${s.percentChange.toFixed(2).padStart(6)}%  $${s.currentPrice.toFixed(2).padStart(8)}  (prev: $${s.previousClose.toFixed(2)})`);
    });
    
    // Top 10 losers
    console.log(`\n🔴 Top 10 Losers:`);
    sortedByChange.slice(-10).reverse().forEach((s, i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${s.symbol.padEnd(6)} ${s.percentChange.toFixed(2).padStart(6)}%  $${s.currentPrice.toFixed(2).padStart(8)}  (prev: $${s.previousClose.toFixed(2)})`);
    });
  }
  
  // Check for issues
  console.log(`\n🔍 Data Quality Checks:`);
  
  const zeroPercent = stocks.filter(s => s.percentChange === 0 && s.previousClose > 0);
  const extremeChanges = stocks.filter(s => Math.abs(s.percentChange) > 50);
  const missingPrices = stocks.filter(s => s.currentPrice === 0);
  
  if (zeroPercent.length > 0) {
    console.log(`   ⚠️  ${zeroPercent.length} stocks with 0% change (but have previousClose)`);
    if (zeroPercent.length <= 10) {
      zeroPercent.forEach(s => console.log(`      - ${s.symbol}`));
    }
  }
  
  if (extremeChanges.length > 0) {
    console.log(`   ⚠️  ${extremeChanges.length} stocks with extreme changes (>50%):`);
    extremeChanges.slice(0, 10).forEach(s => {
      console.log(`      - ${s.symbol}: ${s.percentChange >= 0 ? '+' : ''}${s.percentChange.toFixed(2)}% ($${s.currentPrice} vs $${s.previousClose})`);
    });
  }
  
  if (missingPrices.length > 0) {
    console.log(`   ⚠️  ${missingPrices.length} stocks with missing current price`);
  }
  
  if (zeroPercent.length === 0 && extremeChanges.length === 0 && missingPrices.length === 0) {
    console.log(`   ✅ All checks passed!`);
  }
  
  // Sample of stocks without previousClose
  if (withoutPrevClose.length > 0) {
    console.log(`\n⚠️  Sample stocks without previousClose (first 20):`);
    withoutPrevClose.slice(0, 20).forEach(s => {
      console.log(`   - ${s.symbol}: $${s.currentPrice.toFixed(2)}, change: ${s.percentChange >= 0 ? '+' : ''}${s.percentChange.toFixed(2)}%`);
    });
    if (withoutPrevClose.length > 20) {
      console.log(`   ... and ${withoutPrevClose.length - 20} more`);
    }
  }
  
  // Session info
  if (prodData.session) {
    console.log(`\n📅 Session: ${prodData.session}`);
  }
  
  if (prodData.lastUpdatedAt) {
    console.log(`🕐 Last Updated: ${new Date(prodData.lastUpdatedAt).toLocaleString()}`);
  }
  
  console.log(`\n✅ Status check complete!`);
}

checkProductionStatus().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

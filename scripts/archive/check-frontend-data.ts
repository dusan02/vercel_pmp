/**
 * Check Frontend Data Loading
 * 
 * Verifies if frontend is loading all data correctly:
 * - Bulk API call
 * - Data count
 * - Sample data
 * 
 * Usage: tsx scripts/check-frontend-data.ts
 */

async function checkFrontendData() {
  console.log('\n🔍 Frontend Data Loading Check\n');
  console.log('='.repeat(60));
  
  try {
    // Check bulk API (what frontend calls)
    const session = 'after'; // Current session
    const url = `http://localhost:3000/api/stocks/bulk?session=${session}&sort=marketCapDiff&order=desc&limit=600`;
    
    console.log(`\n📊 Testing Bulk API (Frontend Call):`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (response.status === 200 && result.success) {
      const dataCount = result.data?.length || 0;
      
      console.log(`\n✅ Bulk API Response:`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Data Count: ${dataCount} stocks`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Cached: ${result.cached}`);
      
      if (dataCount > 0) {
        console.log(`\n📊 Sample Data (first 5):`);
        result.data.slice(0, 5).forEach((stock: any, index: number) => {
          console.log(`\n   ${index + 1}. ${stock.ticker}:`);
          console.log(`      Price: $${stock.currentPrice?.toFixed(2) || 'N/A'}`);
          console.log(`      Market Cap: $${stock.marketCap?.toFixed(2) || 'N/A'}B`);
          console.log(`      Market Cap Diff: $${stock.marketCapDiff?.toFixed(2) || 'N/A'}B`);
          console.log(`      Change %: ${stock.percentChange?.toFixed(2) || 'N/A'}%`);
          console.log(`      Company: ${stock.companyName || stock.ticker}`);
        });
        
        // Check data completeness
        const withPrice = result.data.filter((s: any) => s.currentPrice && s.currentPrice > 0).length;
        const withMarketCap = result.data.filter((s: any) => s.marketCap && s.marketCap > 0).length;
        const withMarketCapDiff = result.data.filter((s: any) => s.marketCapDiff !== undefined && s.marketCapDiff !== null).length;
        const withChangePct = result.data.filter((s: any) => s.percentChange !== undefined && s.percentChange !== null).length;
        
        console.log(`\n📊 Data Completeness:`);
        console.log(`   With Price: ${withPrice}/${dataCount} (${Math.round(withPrice/dataCount*100)}%)`);
        console.log(`   With Market Cap: ${withMarketCap}/${dataCount} (${Math.round(withMarketCap/dataCount*100)}%)`);
        console.log(`   With Market Cap Diff: ${withMarketCapDiff}/${dataCount} (${Math.round(withMarketCapDiff/dataCount*100)}%)`);
        console.log(`   With Change %: ${withChangePct}/${dataCount} (${Math.round(withChangePct/dataCount*100)}%)`);
        
        // Check expected count
        const expectedCount = 600;
        const percentage = Math.round((dataCount / expectedCount) * 100);
        
        console.log(`\n📊 Data Count:`);
        console.log(`   Available: ${dataCount} stocks`);
        console.log(`   Expected: ${expectedCount} stocks`);
        console.log(`   Coverage: ${percentage}%`);
        
        if (percentage >= 95) {
          console.log(`\n✅ Excellent! Almost all data is available (${percentage}%)`);
        } else if (percentage >= 80) {
          console.log(`\n⚠️  Good coverage (${percentage}%), but some data may be missing`);
        } else {
          console.log(`\n⚠️  Low coverage (${percentage}%), worker may still be loading`);
        }
        
      } else {
        console.log(`\n⚠️  Bulk API returned empty data`);
        console.log(`   This means frontend will show empty or default tickers`);
      }
      
    } else {
      console.log(`\n❌ Bulk API failed:`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, result);
    }
    
    // Check frontend page
    console.log(`\n📊 Frontend Page Check:`);
    try {
      const pageResponse = await fetch('http://localhost:3000/');
      if (pageResponse.ok) {
        console.log(`   ✅ Frontend page is accessible`);
        console.log(`   💡 Open http://localhost:3000 in browser to see data`);
      } else {
        console.log(`   ❌ Frontend page returned status ${pageResponse.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Frontend page not accessible: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking frontend data:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 To check frontend:');
  console.log('   1. Open http://localhost:3000 in browser');
  console.log('   2. Open DevTools (F12) → Console tab');
  console.log('   3. Look for: "✅ Bulk stocks data loaded: X stocks"');
  console.log('   4. Check Network tab → Look for /api/stocks/bulk request');
  console.log('   5. Verify data count in "All Stocks" section');
}

checkFrontendData().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


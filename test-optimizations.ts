/**
 * Test optimizations - verify that /api/stocks uses DB instead of Polygon API
 */

async function testOptimizations() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Optimizations\n');
  console.log('='.repeat(60));
  
  // Test 1: Check that /api/stocks loads static data from DB
  console.log('\n1. Testing /api/stocks - static data from DB...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/stocks?tickers=AAPL,MSFT,GOOGL&project=pmp`, {
      signal: AbortSignal.timeout(30000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Response: ${response.status} (${duration}ms)`);
      console.log(`   Count: ${data.data?.length || 0} stocks`);
      
      if (data.data && data.data.length > 0) {
        const sample = data.data[0];
        console.log(`   Sample data (${sample.ticker}):`);
        console.log(`     Company Name: ${sample.companyName || 'N/A'}`);
        console.log(`     Sector: ${sample.sector || 'N/A'}`);
        console.log(`     Industry: ${sample.industry || 'N/A'}`);
        console.log(`     Price: $${sample.currentPrice}`);
        console.log(`     Change: ${sample.percentChange}%`);
        console.log(`     MarketCap: $${(sample.marketCap / 1_000_000_000).toFixed(2)}B`);
        
        // Check if static data is present (should be from DB)
        if (sample.companyName || sample.sector || sample.industry) {
          console.log(`   ✅ Static data present (likely from DB)`);
        } else {
          console.log(`   ⚠️ Static data missing (may need DB bootstrap)`);
        }
      }
    } else {
      console.log(`   ❌ Status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 2: Performance test - should be faster now
  console.log('\n2. Testing performance (10 tickers)...');
  try {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ'];
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/stocks?tickers=${tickers.join(',')}&project=pmp`, {
      signal: AbortSignal.timeout(60000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      const avgTimePerTicker = duration / tickers.length;
      console.log(`   ✅ Performance: ${tickers.length} tickers in ${duration}ms`);
      console.log(`   Average: ${avgTimePerTicker.toFixed(0)}ms per ticker`);
      console.log(`   Count: ${data.data?.length || 0} results`);
      
      if (avgTimePerTicker < 100) {
        console.log(`   ✅ Excellent performance (< 100ms per ticker)`);
      } else if (avgTimePerTicker < 200) {
        console.log(`   ✅ Good performance (< 200ms per ticker)`);
      } else {
        console.log(`   ⚠️ Performance could be better (> 200ms per ticker)`);
      }
    } else {
      console.log(`   ❌ Performance test failed: Status ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Performance test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: Check /api/heatmap (should already use DB)
  console.log('\n3. Testing /api/heatmap (should use DB)...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/heatmap?force=false`, {
      signal: AbortSignal.timeout(60000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Response: ${response.status} (${duration}ms)`);
      console.log(`   Count: ${data.count || 0} companies`);
      console.log(`   Cached: ${data.cached || false}`);
      
      if (data.data && data.data.length > 0) {
        const sample = data.data[0];
        console.log(`   Sample data (${sample.ticker}):`);
        console.log(`     Sector: ${sample.sector || 'N/A'}`);
        console.log(`     Industry: ${sample.industry || 'N/A'}`);
        console.log(`     MarketCap: $${(sample.marketCap / 1_000_000_000).toFixed(2)}B`);
        console.log(`     Change: ${sample.percentChange}%`);
      }
    } else {
      console.log(`   ❌ Status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Tests completed');
  console.log('\n💡 Summary:');
  console.log('   - /api/stocks should now load static data from DB');
  console.log('   - Polygon API should only be called for price (snapshot)');
  console.log('   - Performance should be improved');
}

testOptimizations().catch(console.error);


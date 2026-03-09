/**
 * Full application test - tables and heatmap
 */

async function testApplication() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Full Application Test\n');
  console.log('='.repeat(60));
  
  // Test 1: Main page
  console.log('\n1. Testing main page (tables)...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}`, {
      signal: AbortSignal.timeout(10000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      console.log(`   ✅ Main page: ${response.status} ${response.statusText} (${duration}ms)`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    } else {
      console.log(`   ❌ Main page: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Main page failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 2: Heatmap page
  console.log('\n2. Testing heatmap page...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/heatmap`, {
      signal: AbortSignal.timeout(10000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      console.log(`   ✅ Heatmap page: ${response.status} ${response.statusText} (${duration}ms)`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    } else {
      console.log(`   ❌ Heatmap page: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Heatmap page failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: /api/stocks endpoint (small sample)
  console.log('\n3. Testing /api/stocks endpoint (sample: AAPL, MSFT, GOOGL)...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/stocks?tickers=AAPL,MSFT,GOOGL&project=pmp`, {
      signal: AbortSignal.timeout(30000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ /api/stocks: Success=${data.success}, Count=${data.data?.length || 0} (${duration}ms)`);
      
      if (data.data && data.data.length > 0) {
        const sample = data.data[0];
        console.log(`   Sample data:`);
        console.log(`     Ticker: ${sample.ticker}`);
        console.log(`     Price: $${sample.currentPrice}`);
        console.log(`     Change: ${sample.percentChange}%`);
        console.log(`     MarketCap: $${(sample.marketCap / 1_000_000_000).toFixed(2)}B`);
        console.log(`     MarketCapDiff: $${(sample.marketCapDiff / 1_000_000_000).toFixed(2)}B`);
      }
    } else {
      console.log(`   ❌ /api/stocks: Status ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ /api/stocks failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 4: /api/heatmap endpoint
  console.log('\n4. Testing /api/heatmap endpoint...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/heatmap?force=true`, {
      signal: AbortSignal.timeout(60000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ /api/heatmap: Success=${data.success}, Count=${data.count || 0} (${duration}ms)`);
      console.log(`   Cached: ${data.cached || false}`);
      console.log(`   LastUpdated: ${data.lastUpdatedAt || 'N/A'}`);
      
      if (data.data && data.data.length > 0) {
        const sample = data.data[0];
        console.log(`   Sample data:`);
        console.log(`     Ticker: ${sample.ticker}`);
        console.log(`     MarketCap: $${(sample.marketCap / 1_000_000_000).toFixed(2)}B`);
        console.log(`     Change: ${sample.percentChange}%`);
        console.log(`     MarketCapDiff: $${(sample.marketCapDiff / 1_000_000_000).toFixed(2)}B`);
        console.log(`     Sector: ${sample.sector || 'N/A'}`);
        console.log(`     Industry: ${sample.industry || 'N/A'}`);
        
        // Check if metric switching data is available
        const hasMarketCapDiff = data.data.some((d: any) => d.marketCapDiff !== undefined && d.marketCapDiff !== null);
        console.log(`   ✅ MarketCapDiff available: ${hasMarketCapDiff} (for metric switching)`);
      }
    } else {
      console.log(`   ❌ /api/heatmap: Status ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ /api/heatmap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 5: Performance test - batch processing
  console.log('\n5. Testing batch processing performance...');
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
      console.log(`   ✅ Batch processing: ${tickers.length} tickers in ${duration}ms`);
      console.log(`   Average: ${avgTimePerTicker.toFixed(0)}ms per ticker`);
      console.log(`   Count: ${data.data?.length || 0} results`);
      
      if (avgTimePerTicker < 200) {
        console.log(`   ✅ Performance: Excellent (< 200ms per ticker)`);
      } else if (avgTimePerTicker < 500) {
        console.log(`   ⚠️ Performance: Good (< 500ms per ticker)`);
      } else {
        console.log(`   ⚠️ Performance: Needs optimization (> 500ms per ticker)`);
      }
    } else {
      console.log(`   ❌ Batch test failed: Status ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Batch test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Tests completed');
  console.log('\n💡 Open in browser:');
  console.log(`   Main page: ${baseUrl}`);
  console.log(`   Heatmap: ${baseUrl}/heatmap`);
}

testApplication().catch(console.error);


/**
 * Test heatmap page functionality
 */

async function testHeatmapPage() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Heatmap Page\n');
  
  // Test 1: Page exists
  console.log('1. Testing /heatmap page...');
  try {
    const response = await fetch(`${baseUrl}/heatmap`, {
      signal: AbortSignal.timeout(10000)
    });
    console.log(`   ✅ Page: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
  } catch (error) {
    console.log(`   ❌ Page failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }
  
  // Test 2: API endpoint
  console.log('\n2. Testing /api/heatmap endpoint...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/heatmap?force=true`, {
      signal: AbortSignal.timeout(30000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ API: Success=${data.success}, Count=${data.count}, Duration=${duration}ms`);
      
      if (data.data && data.data.length > 0) {
        const sample = data.data[0];
        console.log(`   Sample data:`);
        console.log(`     Ticker: ${sample.ticker}`);
        console.log(`     MarketCap: ${sample.marketCap}`);
        console.log(`     MarketCapDiff: ${sample.marketCapDiff}`);
        console.log(`     PercentChange: ${sample.percentChange}`);
        console.log(`     Sector: ${sample.sector}`);
        console.log(`     Industry: ${sample.industry}`);
        
        // Check if marketCapDiffAbs would be calculated correctly
        const marketCapDiffAbs = Math.abs(sample.marketCapDiff || 0);
        console.log(`     MarketCapDiffAbs (calculated): ${marketCapDiffAbs}`);
      }
    } else {
      console.log(`   ❌ API: Status ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: Check if metric switcher would work
  console.log('\n3. Testing metric data availability...');
  try {
    const response = await fetch(`${baseUrl}/api/heatmap?force=true`, {
      signal: AbortSignal.timeout(30000)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        const withMarketCapDiff = data.data.filter((d: any) => d.marketCapDiff !== undefined && d.marketCapDiff !== null);
        const withMarketCap = data.data.filter((d: any) => d.marketCap > 0);
        
        console.log(`   ✅ Total companies: ${data.data.length}`);
        console.log(`   ✅ With marketCap: ${withMarketCap.length}`);
        console.log(`   ✅ With marketCapDiff: ${withMarketCapDiff.length}`);
        
        if (withMarketCapDiff.length > 0) {
          const maxDiff = Math.max(...withMarketCapDiff.map((d: any) => Math.abs(d.marketCapDiff || 0)));
          console.log(`   ✅ Max |marketCapDiff|: $${(maxDiff / 1_000_000_000).toFixed(2)}B`);
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️ Could not check metric data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  console.log('\n✅ Tests completed');
}

testHeatmapPage().catch(console.error);


/**
 * Test script pre kontrolu funkčnosti stránky
 * Spustite: node scripts/test-page.js
 */

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    console.log(`   URL: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const duration = Date.now() - startTime;
    
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    const status = response.status;
    const statusText = response.statusText;
    
    if (status >= 200 && status < 300) {
      console.log(`   ✅ PASS (${status}) - ${duration}ms`);
      if (options.verbose && data) {
        console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 200));
      }
      return { success: true, status, duration, data };
    } else {
      console.log(`   ❌ FAIL (${status} ${statusText}) - ${duration}ms`);
      if (data) {
        console.log(`   Error:`, typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data, null, 2).substring(0, 200));
      }
      return { success: false, status, duration, data };
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting page tests...');
  console.log(`📍 Base URL: ${BASE_URL}\n`);
  
  const results = [];
  
  // Test 1: Health check
  results.push(await testEndpoint(
    'Health Check',
    `${BASE_URL}/api/health`
  ));
  
  // Test 2: Stocks API - single ticker
  results.push(await testEndpoint(
    'Stocks API - Single Ticker',
    `${BASE_URL}/api/stocks?tickers=AAPL`
  ));
  
  // Test 3: Stocks API - multiple tickers
  results.push(await testEndpoint(
    'Stocks API - Multiple Tickers',
    `${BASE_URL}/api/stocks?tickers=AAPL,MSFT,GOOGL`
  ));
  
  // Test 4: Tickers API
  results.push(await testEndpoint(
    'Tickers API',
    `${BASE_URL}/api/tickers/default?project=pmp&limit=10`
  ));
  
  // Test 5: Main page
  results.push(await testEndpoint(
    'Main Page',
    `${BASE_URL}/`,
    { method: 'GET' }
  ));
  
  // Test 6: Stocks API - empty tickers (should return empty array)
  results.push(await testEndpoint(
    'Stocks API - Empty Tickers',
    `${BASE_URL}/api/stocks?tickers=`
  ));
  
  // Test 7: Stocks API - invalid ticker format
  results.push(await testEndpoint(
    'Stocks API - Invalid Format',
    `${BASE_URL}/api/stocks?tickers=INVALID!!!TICKER`
  ));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;
  
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.forEach((result, index) => {
      if (!result.success) {
        const testNames = [
          'Health Check',
          'Stocks API - Single Ticker',
          'Stocks API - Multiple Tickers',
          'Tickers API',
          'Main Page',
          'Stocks API - Empty Tickers',
          'Stocks API - Invalid Format'
        ];
        console.log(`   - ${testNames[index]}: ${result.error || `Status ${result.status}`}`);
      }
    });
  }
  
  const avgDuration = results
    .filter(r => r.duration)
    .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration).length;
  
  console.log(`\n⏱️  Average response time: ${Math.round(avgDuration)}ms`);
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});


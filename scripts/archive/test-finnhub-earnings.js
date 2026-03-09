// Test Finnhub Earnings API
const https = require('https');

// Váš Finnhub API kľúč
const API_KEY = 'd28f1dhr01qjsuf342ogd28f1dhr01qjsuf342p0';

// Test funkcia
async function testFinnhubEarnings() {
  console.log('🔍 Testing Finnhub Earnings API...');
  
  const today = new Date().toISOString().split('T')[0];
  console.log('📅 Date:', today);
  
  // Test 1: Earnings Calendar pre dnešný deň
  const earningsUrl = `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${today}&token=${API_KEY}`;
  
  console.log('🔗 Earnings URL:', earningsUrl);
  
  return new Promise((resolve, reject) => {
    https.get(earningsUrl, (res) => {
      console.log('📊 Status:', res.statusCode);
      console.log('📊 Headers:', res.headers);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log('✅ Response received:');
          console.log('   Earnings count:', jsonData.earningsCalendar?.length || 0);
          
          if (jsonData.earningsCalendar && jsonData.earningsCalendar.length > 0) {
            console.log('\n📊 Sample earnings data:');
            jsonData.earningsCalendar.slice(0, 3).forEach((earning, index) => {
              console.log(`   ${index + 1}. ${earning.symbol}:`);
              console.log(`      Date: ${earning.date}`);
              console.log(`      Time: ${earning.time}`);
              console.log(`      EPS Estimate: ${earning.epsEstimate}`);
              console.log(`      EPS Actual: ${earning.epsActual}`);
              console.log(`      Revenue Estimate: ${earning.revenueEstimate}`);
              console.log(`      Revenue Actual: ${earning.revenueActual}`);
              console.log(`      Surprise: ${earning.surprise}`);
              console.log(`      Surprise Percent: ${earning.surprisePercent}%`);
            });
          }
          
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          console.error('❌ JSON parse error:', error);
          console.log('Raw response:', data);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });
  });
}

// Test 2: Company Profile pre vaše tickery
async function testCompanyProfiles() {
  console.log('\n🔍 Testing Company Profiles...');
  
  const tickers = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META'];
  
  for (const ticker of tickers) {
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${API_KEY}`;
    
    console.log(`🔗 Testing ${ticker}:`, profileUrl);
    
    try {
      const result = await makeRequest(profileUrl);
      if (result.success) {
        console.log(`✅ ${ticker}: ${result.data.name} (Market Cap: $${result.data.marketCapitalization}B)`);
      } else {
        console.log(`❌ ${ticker}: Failed (${result.status})`);
      }
    } catch (error) {
      console.log(`❌ ${ticker}: Error - ${error.message}`);
    }
  }
}

// Pomocná funkcia pre HTTP request
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });
  });
}

// Spusti testy
async function runTests() {
  try {
    console.log('🚀 Starting Finnhub API tests...\n');
    
    // Test 1: Earnings Calendar
    const earningsResult = await testFinnhubEarnings();
    console.log('\n📊 Earnings test result:', earningsResult.success ? '✅ PASSED' : '❌ FAILED');
    
    // Test 2: Company Profiles
    await testCompanyProfiles();
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  }
}

runTests(); 
// Test základných Polygon API endpointov
const https = require('https');

// API kľúč
const API_KEY = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

// Test funkcia pre základné endpointy
async function testPolygonAPI() {
  console.log('🔍 Testing Polygon.io Basic API endpoints...');
  
  const tests = [
    {
      name: 'Ticker Details (AAPL)',
      url: `https://api.polygon.io/v3/reference/tickers/AAPL?apiKey=${API_KEY}`
    },
    {
      name: 'Previous Close (AAPL)',
      url: `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${API_KEY}`
    },
    {
      name: 'Market Status',
      url: `https://api.polygon.io/v1/marketstatus/now?apiKey=${API_KEY}`
    }
  ];
  
  for (const test of tests) {
    console.log(`\n📊 Testing: ${test.name}`);
    console.log('🔗 URL:', test.url);
    
    try {
      const result = await makeRequest(test.url);
      console.log('✅ Status:', result.status);
      console.log('✅ Success:', result.success);
      
      if (result.success && result.data) {
        console.log('✅ Data received');
        if (test.name.includes('Ticker')) {
          console.log('   Ticker:', result.data.results?.ticker);
          console.log('   Name:', result.data.results?.name);
        } else if (test.name.includes('Previous')) {
          console.log('   Results count:', result.data.results?.length || 0);
        } else if (test.name.includes('Market')) {
          console.log('   Market:', result.data.market);
          console.log('   Server Time:', result.data.serverTime);
        }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
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
testPolygonAPI()
  .then(() => {
    console.log('\n🎉 All tests completed!');
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
  }); 
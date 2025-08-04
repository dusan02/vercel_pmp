// Jednoduchý test Benzinga Earnings API
const https = require('https');

// API kľúč z dokumentácie
const API_KEY = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';

// Test funkcia
async function testBenzingaAPI() {
  console.log('🔍 Testing Polygon Benzinga Earnings API...');
  console.log('📅 Date:', new Date().toISOString().split('T')[0]);
  
  const today = new Date().toISOString().split('T')[0];
  
  // Test URL
  const url = `https://api.polygon.io/benzinga/v1/earnings?date=${today}&limit=5&apiKey=${API_KEY}`;
  
  console.log('🔗 URL:', url);
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
          console.log('   Status:', jsonData.status);
          console.log('   Request ID:', jsonData.request_id);
          console.log('   Results count:', jsonData.results?.length || 0);
          
          if (jsonData.results && jsonData.results.length > 0) {
            console.log('   Sample result:');
            console.log('     Ticker:', jsonData.results[0].ticker);
            console.log('     Company:', jsonData.results[0].company_name);
            console.log('     Date:', jsonData.results[0].date);
            console.log('     Time:', jsonData.results[0].time);
            console.log('     Estimated EPS:', jsonData.results[0].estimated_eps);
            console.log('     Importance:', jsonData.results[0].importance);
          }
          
          resolve({
            success: true,
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

// Spusti test
testBenzingaAPI()
  .then((result) => {
    console.log('\n🎉 Test completed successfully!');
    console.log('API is working:', result.success);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
  }); 
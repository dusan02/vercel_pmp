/**
 * Test API endpoints directly
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
}

async function testEndpoints() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing API Endpoints\n');
  
  // Test 1: Basic server
  console.log('1. Testing server...');
  try {
    const response = await fetch(baseUrl, { 
      signal: AbortSignal.timeout(5000) 
    });
    console.log(`   ✅ Server: ${response.status}`);
  } catch (error) {
    console.log(`   ❌ Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }
  
  // Test 2: Heatmap API
  console.log('\n2. Testing /api/heatmap...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/heatmap`, {
      signal: AbortSignal.timeout(20000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Heatmap: Success=${data.success}, Count=${data.count}, Duration=${duration}ms`);
    } else {
      console.log(`   ❌ Heatmap: Status ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Heatmap: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Test 3: Stocks Optimized API
  console.log('\n3. Testing /api/stocks/optimized...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/stocks/optimized?limit=5`, {
      signal: AbortSignal.timeout(15000)
    });
    const duration = Date.now() - startTime;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Stocks: Rows=${data.rows?.length || 0}, Duration=${duration}ms`);
    } else {
      console.log(`   ❌ Stocks: Status ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Stocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  console.log('\n✅ Tests completed');
}

testEndpoints().catch(console.error);


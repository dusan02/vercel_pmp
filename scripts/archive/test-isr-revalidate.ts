/**
 * Test script for ISR revalidate behavior
 * Run: tsx scripts/test-isr-revalidate.ts
 */

const PAGE_URL = process.env.TEST_URL || 'http://localhost:3000/stocks';

async function testISRRevalidate() {
  console.log('=== Testing ISR Revalidate (60s window) ===\n');

  try {
    // First hit (builds ISR)
    console.log('1. First hit (building ISR)...');
    const response1 = await fetch(PAGE_URL);
    const timestamp1 = new Date().toISOString();
    console.log(`   Status: ${response1.status}`);
    console.log(`   Time: ${timestamp1}`);
    console.log('');

    // Wait 40 seconds (within 60s window - should use cached)
    console.log('2. Waiting 40s (within 60s window)...');
    await new Promise(resolve => setTimeout(resolve, 40000));
    
    const response2 = await fetch(PAGE_URL);
    const timestamp2 = new Date().toISOString();
    console.log(`   Status: ${response2.status}`);
    console.log(`   Time: ${timestamp2}`);
    console.log('   Expected: Same snapshot (cached)');
    console.log('');

    // Wait 25 more seconds (total 65s - should rebuild)
    console.log('3. Waiting 25s more (total 65s - should rebuild)...');
    await new Promise(resolve => setTimeout(resolve, 25000));
    
    const response3 = await fetch(PAGE_URL);
    const timestamp3 = new Date().toISOString();
    console.log(`   Status: ${response3.status}`);
    console.log(`   Time: ${timestamp3}`);
    console.log('   Expected: New snapshot (revalidated)');
    console.log('');

    console.log('=== Test Complete ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testISRRevalidate();


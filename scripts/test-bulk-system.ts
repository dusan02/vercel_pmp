/**
 * Test script for bulk data system
 * 
 * Tests:
 * 1. Bulk API endpoint
 * 2. Rank indexes
 * 3. Universe helpers
 * 
 * Usage: tsx scripts/test-bulk-system.ts
 */

import { getAllTrackedTickers, getUniverseCount, UNIVERSE_TYPES } from '../src/lib/utils/universeHelpers';
// @ts-ignore - module may not exist
import { getRankCount, getDateET } from '../src/lib/rankIndexes';
import { detectSession, nowET } from '../src/lib/utils/timeUtils';
// @ts-ignore - module may not exist
import { logger } from '../src/lib/logger';

async function testBulkSystem() {
  console.log('🧪 Testing Bulk Data System...\n');

  // Test 1: Universe helpers
  console.log('📊 Test 1: Universe Helpers');
  try {
    const allTickers = await getAllTrackedTickers();
    console.log(`✅ getAllTrackedTickers(): ${allTickers.length} tickers`);
    
    const sp500Count = await getUniverseCount(UNIVERSE_TYPES.SP500);
    console.log(`✅ SP500 universe count: ${sp500Count}`);
    
    if (allTickers.length > 0) {
      console.log(`   Sample tickers: ${allTickers.slice(0, 10).join(', ')}...`);
    }
  } catch (error) {
    console.error('❌ Universe helpers test failed:', error);
  }

  console.log('');

  // Test 2: Rank indexes
  console.log('📊 Test 2: Rank Indexes');
  try {
    const date = getDateET();
    const session = detectSession(nowET());
    
    console.log(`   Date: ${date}, Session: ${session}`);
    
    const capdiffCount = await getRankCount(date, session, 'capdiff');
    const priceCount = await getRankCount(date, session, 'price');
    const chgCount = await getRankCount(date, session, 'chg');
    
    console.log(`✅ Rank index counts:`);
    console.log(`   - capdiff: ${capdiffCount}`);
    console.log(`   - price: ${priceCount}`);
    console.log(`   - chg: ${chgCount}`);
    
    if (capdiffCount === 0) {
      console.log('⚠️  Rank indexes are empty - worker needs to run');
    } else {
      console.log('✅ Rank indexes have data');
    }
  } catch (error) {
    console.error('❌ Rank indexes test failed:', error);
  }

  console.log('');

  // Test 3: Bulk API (via HTTP)
  console.log('📊 Test 3: Bulk API Endpoint');
  try {
    const response = await fetch('http://localhost:3000/api/stocks/bulk?session=pre&sort=marketCapDiff&order=desc&limit=10');
    const result = await response.json();
    
    console.log(`✅ Bulk API Status: ${response.status}`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Data count: ${result.data?.length || 0}`);
    console.log(`   Cached: ${result.cached}`);
    console.log(`   Duration: ${result.duration}ms`);
    
    if (result.data && result.data.length > 0) {
      console.log(`   Sample tickers: ${result.data.slice(0, 5).map((s: any) => s.ticker).join(', ')}`);
    } else {
      console.log('⚠️  No data returned - rank indexes may be empty');
    }
  } catch (error) {
    console.error('❌ Bulk API test failed:', error);
    console.log('⚠️  Make sure the server is running on port 3000');
  }

  console.log('\n✅ Testing completed!');
}

testBulkSystem()
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });


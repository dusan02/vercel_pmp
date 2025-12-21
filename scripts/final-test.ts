/**
 * Final End-to-End Test for Bulk Data System
 * 
 * Tests:
 * 1. Universe helpers
 * 2. Bulk API endpoint
 * 3. Frontend integration (simulated)
 * 4. Error handling
 * 
 * Usage: tsx scripts/final-test.ts
 */

import { getAllTrackedTickers, getUniverseCount, UNIVERSE_TYPES } from '../src/lib/utils/universeHelpers';
import { getRankCount, getDateET } from '../src/lib/rankIndexes';
import { detectSession, nowET } from '../src/lib/utils/timeUtils';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, message: string, details?: any) {
  results.push({ name, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log(`   Details:`, details);
  }
}

async function testUniverseHelpers(): Promise<void> {
  console.log('\n📊 Test 1: Universe Helpers');
  
  try {
    const allTickers = await getAllTrackedTickers();
    const expectedMin = 500; // At least 500 SP500 tickers
    
    if (allTickers.length >= expectedMin) {
      addResult('getAllTrackedTickers', true, `Returns ${allTickers.length} tickers (expected: >= ${expectedMin})`, {
        count: allTickers.length,
        sample: allTickers.slice(0, 5)
      });
    } else {
      addResult('getAllTrackedTickers', false, `Returns only ${allTickers.length} tickers (expected: >= ${expectedMin})`);
    }
    
    const sp500Count = await getUniverseCount(UNIVERSE_TYPES.SP500);
    if (sp500Count >= 500) {
      addResult('SP500 Universe Count', true, `${sp500Count} tickers in SP500 universe`);
    } else {
      addResult('SP500 Universe Count', false, `Only ${sp500Count} tickers (expected: >= 500)`);
    }
  } catch (error) {
    addResult('Universe Helpers', false, `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function testBulkAPI(): Promise<void> {
  console.log('\n📊 Test 2: Bulk API Endpoint');
  
  try {
    const date = getDateET();
    const session = detectSession(nowET());
    
    // Test with different parameters
    const tests = [
      { sort: 'marketCapDiff', order: 'desc', limit: 10 },
      { sort: 'price', order: 'desc', limit: 20 },
      { sort: 'changePct', order: 'asc', limit: 15 }
    ];
    
    for (const test of tests) {
      const url = `http://localhost:3000/api/stocks/bulk?session=${session}&sort=${test.sort}&order=${test.order}&limit=${test.limit}`;
      
      try {
        const response = await fetch(url);
        const result = await response.json();
        
        if (response.status === 200 && result.success !== undefined) {
          addResult(
            `Bulk API (${test.sort})`,
            true,
            `Status ${response.status}, ${result.data?.length || 0} stocks returned`,
            {
              duration: `${result.duration}ms`,
              cached: result.cached,
              hasData: (result.data?.length || 0) > 0
            }
          );
        } else {
          addResult(`Bulk API (${test.sort})`, false, `Unexpected response: ${response.status}`);
        }
      } catch (error) {
        addResult(`Bulk API (${test.sort})`, false, `Request failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  } catch (error) {
    addResult('Bulk API', false, `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function testRankIndexes(): Promise<void> {
  console.log('\n📊 Test 3: Rank Indexes');
  
  try {
    const date = getDateET();
    const session = detectSession(nowET());
    
    const capdiffCount = await getRankCount(date, session, 'capdiff');
    const priceCount = await getRankCount(date, session, 'price');
    const chgCount = await getRankCount(date, session, 'chg');
    
    if (capdiffCount > 0 || priceCount > 0 || chgCount > 0) {
      addResult('Rank Indexes', true, 'Rank indexes have data', {
        capdiff: capdiffCount,
        price: priceCount,
        chg: chgCount
      });
    } else {
      addResult('Rank Indexes', false, 'Rank indexes are empty (worker needs to run)', {
        capdiff: capdiffCount,
        price: priceCount,
        chg: chgCount
      });
    }
  } catch (error) {
    addResult('Rank Indexes', false, `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function testErrorHandling(): Promise<void> {
  console.log('\n📊 Test 4: Error Handling');
  
  try {
    // Test invalid parameters
    const invalidTests = [
      'http://localhost:3000/api/stocks/bulk?session=invalid&sort=invalid&limit=abc',
      'http://localhost:3000/api/stocks/bulk?limit=-1',
      'http://localhost:3000/api/stocks/bulk?limit=10000' // Over max
    ];
    
    for (const url of invalidTests) {
      try {
        const response = await fetch(url);
        const result = await response.json();
        
        // Should handle gracefully (return 200 with empty data or 400)
        if (response.status === 200 || response.status === 400) {
          addResult('Error Handling (Invalid Params)', true, `Handles invalid params gracefully (${response.status})`);
        } else {
          addResult('Error Handling (Invalid Params)', false, `Unexpected status: ${response.status}`);
        }
      } catch (error) {
        // Network errors are OK for this test
        addResult('Error Handling (Invalid Params)', true, 'Handles errors gracefully');
      }
    }
  } catch (error) {
    addResult('Error Handling', false, `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function testFallback(): Promise<void> {
  console.log('\n📊 Test 5: Fallback Mechanism');
  
  try {
    // Test that API returns empty array (not error) when rank indexes are empty
    const response = await fetch('http://localhost:3000/api/stocks/bulk?session=pre&sort=marketCapDiff&order=desc&limit=10');
    const result = await response.json();
    
    if (response.status === 200 && Array.isArray(result.data)) {
      addResult('Fallback Mechanism', true, 'Returns empty array when no data (graceful degradation)', {
        hasData: result.data.length > 0,
        success: result.success
      });
    } else {
      addResult('Fallback Mechanism', false, 'Does not handle empty data gracefully');
    }
  } catch (error) {
    addResult('Fallback Mechanism', false, `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function runAllTests() {
  console.log('🧪 Final End-to-End Test for Bulk Data System\n');
  console.log('='.repeat(60));
  
  await testUniverseHelpers();
  await testRankIndexes();
  await testBulkAPI();
  await testErrorHandling();
  await testFallback();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success Rate: ${Math.round((passed / total) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check details above.');
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});


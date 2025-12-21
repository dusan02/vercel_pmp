/**
 * Verify Data Availability Script
 * 
 * Checks if all data is available in the application:
 * 1. Server is running
 * 2. Bulk API returns data
 * 3. Rank indexes have data
 * 4. Frontend can access data
 * 
 * Usage: tsx scripts/verify-data-availability.ts
 */

import { getAllTrackedTickers } from '../src/lib/utils/universeHelpers';
import { getRankCount, getDateET } from '../src/lib/rankIndexes';
import { detectSession, nowET } from '../src/lib/utils/timeUtils';

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

const results: VerificationResult[] = [];

function addResult(name: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any) {
  results.push({ name, status, message, details });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log(`   Details:`, details);
  }
}

async function verifyServer(): Promise<void> {
  console.log('\n📊 Verification 1: Server Status');
  
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      addResult('Server Running', 'pass', 'Server is running on port 3000');
    } else {
      addResult('Server Running', 'fail', `Server returned status ${response.status}`);
    }
  } catch (error) {
    addResult('Server Running', 'fail', 'Server is not running', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function verifyUniverse(): Promise<void> {
  console.log('\n📊 Verification 2: Universe (Tickers)');
  
  try {
    const allTickers = await getAllTrackedTickers();
    const expectedMin = 500;
    
    if (allTickers.length >= expectedMin) {
      addResult('Universe Tickers', 'pass', `${allTickers.length} tickers available (expected: >= ${expectedMin})`, {
        count: allTickers.length,
        sample: allTickers.slice(0, 10)
      });
    } else {
      addResult('Universe Tickers', 'warning', `Only ${allTickers.length} tickers (expected: >= ${expectedMin})`);
    }
  } catch (error) {
    addResult('Universe Tickers', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function verifyRankIndexes(): Promise<void> {
  console.log('\n📊 Verification 3: Rank Indexes');
  
  try {
    const date = getDateET();
    const session = detectSession(nowET());
    
    const capdiffCount = await getRankCount(date, session, 'capdiff');
    const priceCount = await getRankCount(date, session, 'price');
    const chgCount = await getRankCount(date, session, 'chg');
    
    const totalCount = capdiffCount + priceCount + chgCount;
    
    if (totalCount > 0) {
      addResult('Rank Indexes', 'pass', 'Rank indexes have data', {
        capdiff: capdiffCount,
        price: priceCount,
        chg: chgCount,
        total: totalCount
      });
    } else {
      addResult('Rank Indexes', 'warning', 'Rank indexes are empty - worker may still be running', {
        capdiff: capdiffCount,
        price: priceCount,
        chg: chgCount,
        note: 'This is normal if worker just started. Wait 10-15 minutes.'
      });
    }
  } catch (error) {
    addResult('Rank Indexes', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function verifyBulkAPI(): Promise<void> {
  console.log('\n📊 Verification 4: Bulk API Endpoint');
  
  try {
    const session = detectSession(nowET());
    const url = `http://localhost:3000/api/stocks/bulk?session=${session}&sort=marketCapDiff&order=desc&limit=100`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (response.status === 200 && result.success) {
      const dataCount = result.data?.length || 0;
      
      if (dataCount > 0) {
        addResult('Bulk API', 'pass', `Returns ${dataCount} stocks`, {
          duration: `${result.duration}ms`,
          cached: result.cached,
          hasStats: !!result.stats
        });
      } else {
        addResult('Bulk API', 'warning', 'Returns empty data - rank indexes may be empty', {
          duration: `${result.duration}ms`,
          cached: result.cached,
          note: 'Worker may still be loading data. Wait 10-15 minutes.'
        });
      }
    } else {
      addResult('Bulk API', 'fail', `Unexpected response: ${response.status}`, result);
    }
  } catch (error) {
    addResult('Bulk API', 'fail', `Request failed: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function verifyFrontendAccess(): Promise<void> {
  console.log('\n📊 Verification 5: Frontend Access');
  
  try {
    // Test if frontend page is accessible
    const response = await fetch('http://localhost:3000/');
    
    if (response.ok) {
      addResult('Frontend Page', 'pass', 'Frontend page is accessible');
    } else {
      addResult('Frontend Page', 'fail', `Frontend returned status ${response.status}`);
    }
  } catch (error) {
    addResult('Frontend Page', 'fail', `Frontend not accessible: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function verifyDataCompleteness(): Promise<void> {
  console.log('\n📊 Verification 6: Data Completeness');
  
  try {
    const session = detectSession(nowET());
    const allTickers = await getAllTrackedTickers();
    
    // Test bulk API with full limit
    const response = await fetch(
      `http://localhost:3000/api/stocks/bulk?session=${session}&sort=marketCapDiff&order=desc&limit=600`
    );
    const result = await response.json();
    
    if (result.success && result.data) {
      const dataCount = result.data.length;
      const expectedCount = Math.min(600, allTickers.length);
      const percentage = Math.round((dataCount / expectedCount) * 100);
      
      if (dataCount >= expectedCount * 0.8) { // At least 80% of expected
        addResult('Data Completeness', 'pass', `${dataCount}/${expectedCount} stocks (${percentage}%)`, {
          dataCount,
          expectedCount,
          percentage
        });
      } else if (dataCount > 0) {
        addResult('Data Completeness', 'warning', `Only ${dataCount}/${expectedCount} stocks (${percentage}%)`, {
          dataCount,
          expectedCount,
          percentage,
          note: 'Worker may still be loading. Wait for completion.'
        });
      } else {
        addResult('Data Completeness', 'warning', 'No data available yet', {
          note: 'Worker may still be loading. Wait 10-15 minutes.'
        });
      }
    } else {
      addResult('Data Completeness', 'fail', 'Bulk API did not return data');
    }
  } catch (error) {
    addResult('Data Completeness', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

async function runVerification() {
  console.log('🔍 Verifying Data Availability in Application\n');
  console.log('='.repeat(60));
  
  await verifyServer();
  await verifyUniverse();
  await verifyRankIndexes();
  await verifyBulkAPI();
  await verifyFrontendAccess();
  await verifyDataCompleteness();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Verification Summary\n');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;
  
  console.log(`Total Checks: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}`);
  
  const successRate = Math.round((passed / total) * 100);
  console.log(`📊 Success Rate: ${successRate}%`);
  
  if (failed === 0 && warnings === 0) {
    console.log('\n🎉 All checks passed! Data is fully available.');
    process.exit(0);
  } else if (failed === 0) {
    console.log('\n⚠️  Some warnings - data may still be loading.');
    console.log('   If worker just started, wait 10-15 minutes and run again.');
    process.exit(0);
  } else {
    console.log('\n❌ Some checks failed. Please review the errors above.');
    process.exit(1);
  }
}

runVerification().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});


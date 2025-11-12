/**
 * Comprehensive System Status Check
 * 
 * Checks all components of the bulk data system
 * 
 * Usage: tsx scripts/check-status.ts
 */

import { prisma } from '../src/lib/prisma';
import { getAllTrackedTickers } from '../src/lib/universeHelpers';
import { detectSession, nowET } from '../src/lib/timeUtils';

interface StatusCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: any;
}

const checks: StatusCheck[] = [];

function addCheck(name: string, status: 'ok' | 'warning' | 'error', message: string, details?: any) {
  checks.push({ name, status, message, details });
  const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (details) {
    console.log(`   ${JSON.stringify(details, null, 2).split('\n').join('\n   ')}`);
  }
}

async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    if (response.ok) {
      addCheck('Server', 'ok', 'Server is running on port 3000');
    } else {
      addCheck('Server', 'error', `Server returned status ${response.status}`);
    }
  } catch (error) {
    addCheck('Server', 'error', 'Server is not running', {
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
}

async function checkDatabase() {
  try {
    const allTickers = await getAllTrackedTickers();
    const session = detectSession(nowET());
    const dbSession = session === 'live' ? 'regular' : session;
    
    const sessionPrices = await prisma.sessionPrice.findMany({
      where: {
        symbol: { in: allTickers },
        session: dbSession
      },
      select: { symbol: true },
      distinct: ['symbol']
    });
    
    const count = sessionPrices.length;
    const percentage = Math.round((count / allTickers.length) * 100);
    
    if (percentage >= 95) {
      addCheck('Database', 'ok', `${count}/${allTickers.length} tickers (${percentage}%)`, {
        session: dbSession,
        progress: percentage
      });
    } else if (percentage > 0) {
      addCheck('Database', 'warning', `${count}/${allTickers.length} tickers (${percentage}%)`, {
        session: dbSession,
        progress: percentage,
        note: 'Worker may still be loading'
      });
    } else {
      addCheck('Database', 'error', 'No data in database', {
        session: dbSession
      });
    }
  } catch (error) {
    addCheck('Database', 'error', 'Database check failed', {
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
}

async function checkBulkAPI() {
  try {
    const session = detectSession(nowET());
    const response = await fetch(
      `http://localhost:3000/api/stocks/bulk?session=${session}&sort=marketCapDiff&order=desc&limit=50`
    );
    const result = await response.json();
    
    if (response.status === 200 && result.success) {
      const dataCount = result.data?.length || 0;
      if (dataCount > 0) {
        addCheck('Bulk API', 'ok', `Returns ${dataCount} stocks`, {
          duration: `${result.duration}ms`,
          cached: result.cached
        });
      } else {
        addCheck('Bulk API', 'warning', 'Returns empty data', {
          duration: `${result.duration}ms`,
          note: 'Rank indexes may be empty, using DB fallback'
        });
      }
    } else {
      addCheck('Bulk API', 'error', `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    addCheck('Bulk API', 'error', 'Bulk API check failed', {
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
}

async function checkFrontend() {
  try {
    const response = await fetch('http://localhost:3000/');
    if (response.ok) {
      addCheck('Frontend', 'ok', 'Frontend is accessible');
    } else {
      addCheck('Frontend', 'error', `Frontend returned status ${response.status}`);
    }
  } catch (error) {
    addCheck('Frontend', 'error', 'Frontend is not accessible', {
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
}

async function runStatusCheck() {
  console.log('🔍 System Status Check\n');
  console.log('='.repeat(60));
  
  await checkServer();
  await checkDatabase();
  await checkBulkAPI();
  await checkFrontend();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');
  
  const ok = checks.filter(c => c.status === 'ok').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  const errors = checks.filter(c => c.status === 'error').length;
  const total = checks.length;
  
  console.log(`Total Checks: ${total}`);
  console.log(`✅ OK: ${ok}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Errors: ${errors}`);
  
  const successRate = Math.round((ok / total) * 100);
  console.log(`📊 Success Rate: ${successRate}%`);
  
  if (errors === 0 && warnings === 0) {
    console.log('\n🎉 All systems operational!');
  } else if (errors === 0) {
    console.log('\n⚠️  Some warnings, but system is functional');
  } else {
    console.log('\n❌ Some errors detected. Please review above.');
  }
}

runStatusCheck()
  .catch((error) => {
    console.error('❌ Status check failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


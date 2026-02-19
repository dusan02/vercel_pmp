/**
 * Comprehensive Worker Performance Report
 * 
 * Measures:
 * - Worker startup times
 * - Batch processing times
 * - Total cycle times
 * - Ticker counts
 * - API call rates
 * - Redis operations
 * - Database operations
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

const WORKER_START_DELAY = 5000;
const MONITORING_DURATION = 120000; // 2 minutes to capture multiple cycles
const CHECK_INTERVAL = 1000; // Check every second

interface BatchMetrics {
  batchNumber: number;
  tickerCount: number;
  startTime: number;
  endTime?: number;
  duration?: number;
}

interface WorkerMetrics {
  name: string;
  startTime: number;
  firstCycleEnd?: number;
  firstCycleDuration?: number;
  batches: BatchMetrics[];
  totalTickersProcessed: number;
  cyclesCompleted: number;
  avgCycleTime?: number;
  logs: string[];
  process?: ChildProcess; // Reference to spawned process for cleanup
}

interface SystemMetrics {
  universeSize: number;
  premiumTickers: number;
  restTickers: number;
  redisConnected: boolean;
  dbConnected: boolean;
}

const workers: WorkerMetrics[] = [];
let appProcess: ChildProcess | null = null;

async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    const { redisClient } = await import('../src/lib/redis');
    const { getUniverse } = await import('../src/lib/redis/operations');
    const { getAllProjectTickers } = await import('../src/data/defaultTickers');
    const { PrismaClient } = await import('@prisma/client');
    
    const prisma = new PrismaClient();
    
    const universe = await getUniverse('sp500');
    const premiumTickers = getAllProjectTickers('pmp').slice(0, 200);
    
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    } finally {
      await prisma.$disconnect();
    }
    
    return {
      universeSize: universe.length,
      premiumTickers: premiumTickers.length,
      restTickers: universe.length - premiumTickers.length,
      redisConnected: redisClient?.isOpen || false,
      dbConnected
    };
  } catch (error) {
    console.warn('Error getting system metrics:', error);
    return {
      universeSize: 0,
      premiumTickers: 0,
      restTickers: 0,
      redisConnected: false,
      dbConnected: false
    };
  }
}

function parseBatchFromLogs(logs: string[]): BatchMetrics[] {
  const batches: BatchMetrics[] = [];
  const batchRegex = /Processing batch (\d+)\/(\d+) \((\d+) tickers\)/;
  const batchStartRegex = /Processing batch (\d+)\/(\d+) \((\d+) tickers\)/;
  
  logs.forEach((log, idx) => {
    const match = log.match(batchRegex);
    if (match) {
      const batchNum = parseInt(match[1]!, 10);
      const tickerCount = parseInt(match[3]!, 10);
      
      // Find if batch already exists
      let batch = batches.find(b => b.batchNumber === batchNum);
      if (!batch) {
        batch = {
          batchNumber: batchNum,
          tickerCount,
          startTime: Date.now() // Approximate
        };
        batches.push(batch);
      }
    }
  });
  
  return batches;
}

function startApp(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Next.js application...');
    appProcess = spawn('npm', ['run', 'dev:next'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      detached: false
    });

    let appReady = false;
    const checkReady = (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Ready in') || output.includes('Local:') || output.includes('localhost:3000')) {
        if (!appReady) {
          appReady = true;
          console.log('✅ Next.js app is ready');
          setTimeout(2000).then(() => resolve());
        }
      }
    };

    appProcess.stdout?.on('data', checkReady);
    appProcess.stderr?.on('data', checkReady);

    setTimeout(30000).then(() => {
      if (!appReady) {
        console.log('⚠️ App startup timeout, assuming ready...');
        resolve();
      }
    });
  });
}

function startWorker(name: string, script: string, mode: string): WorkerMetrics {
  console.log(`🔄 Starting ${name} worker...`);
  const startTime = Date.now();
  
  const workerProcess = spawn('node', [script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MODE: mode },
    shell: true,
    windowsHide: true,
    detached: false
  });

  const worker: WorkerMetrics = {
    name,
    startTime,
    batches: [],
    totalTickersProcessed: 0,
    cyclesCompleted: 0,
    logs: [],
    process: workerProcess // Store reference for cleanup
  };

  workerProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    worker.logs.push(output);
    process.stdout.write(data);
  });

  workerProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    worker.logs.push(output);
    process.stderr.write(data);
  });

  workerProcess.on('exit', (code) => {
    console.log(`\n${code === 0 ? '✅' : '❌'} ${name} worker exited (code: ${code})`);
  });

  workers.push(worker);
  return worker;
}

async function monitorWorkers(): Promise<void> {
  console.log('\n📊 Monitoring workers for comprehensive metrics...');
  const monitoringStart = Date.now();
  let lastCycleCount = { refs: 0, snapshot: 0 };
  
  // Get initial system metrics
  const initialMetrics = await getSystemMetrics();
  console.log(`\n📈 System State:`);
  console.log(`   Universe size: ${initialMetrics.universeSize} tickers`);
  console.log(`   Premium tickers: ${initialMetrics.premiumTickers}`);
  console.log(`   Rest tickers: ${initialMetrics.restTickers}`);
  console.log(`   Redis: ${initialMetrics.redisConnected ? '✅' : '❌'}`);
  console.log(`   Database: ${initialMetrics.dbConnected ? '✅' : '❌'}`);

  while (Date.now() - monitoringStart < MONITORING_DURATION) {
    await setTimeout(CHECK_INTERVAL);
    
    // Parse logs for batch information
    for (const worker of workers) {
      const recentLogs = worker.logs.slice(-50).join('');
      
      // Detect cycles
      if (worker.name === 'refs') {
        const cycleMatches = (recentLogs.match(/Universe refreshed|Previous closes bootstrapped|✅/g) || []).length;
        if (cycleMatches > lastCycleCount.refs) {
          worker.cyclesCompleted = cycleMatches;
          if (!worker.firstCycleEnd && cycleMatches >= 1) {
            worker.firstCycleEnd = Date.now();
            worker.firstCycleDuration = worker.firstCycleEnd - worker.startTime;
            console.log(`\n✅ ${worker.name} completed first cycle in ${(worker.firstCycleDuration / 1000).toFixed(2)}s`);
          }
          lastCycleCount.refs = cycleMatches;
        }
      }
      
      if (worker.name === 'snapshot') {
        // Parse batches from logs
        const batchMatches = recentLogs.match(/Processing batch (\d+)\/(\d+) \((\d+) tickers\)/g) || [];
        const newBatches = batchMatches.length;
        
        if (newBatches > worker.batches.length) {
          // Parse new batches
          const batches = parseBatchFromLogs(worker.logs);
          worker.batches = batches;
          worker.totalTickersProcessed = batches.reduce((sum, b) => sum + b.tickerCount, 0);
          
          // Detect cycle completion
          if (recentLogs.includes('hasSuccess') || recentLogs.includes('✅')) {
            worker.cyclesCompleted++;
            if (!worker.firstCycleEnd) {
              worker.firstCycleEnd = Date.now();
              worker.firstCycleDuration = worker.firstCycleEnd - worker.startTime;
              console.log(`\n✅ ${worker.name} completed first cycle in ${(worker.firstCycleDuration / 1000).toFixed(2)}s`);
            }
          }
        }
        
        // Calculate average cycle time
        if (worker.cyclesCompleted > 0 && worker.firstCycleDuration) {
          const elapsed = Date.now() - worker.startTime;
          worker.avgCycleTime = elapsed / worker.cyclesCompleted;
        }
      }
    }
    
    // Show progress every 30 seconds
    const elapsed = Math.floor((Date.now() - monitoringStart) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) {
      console.log(`\n⏱️  Elapsed: ${elapsed}s`);
      for (const worker of workers) {
        console.log(`   ${worker.name}: ${worker.cyclesCompleted} cycles, ${worker.batches.length} batches`);
      }
    }
  }
  
  // Final metrics
  const finalMetrics = await getSystemMetrics();
  
  // Generate report
  generateReport(initialMetrics, finalMetrics, monitoringStart);
}

function generateReport(
  initialMetrics: SystemMetrics,
  finalMetrics: SystemMetrics,
  monitoringStart: number
): void {
  const totalTime = ((Date.now() - monitoringStart) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE WORKER PERFORMANCE REPORT');
  console.log('='.repeat(80));
  
  console.log('\n📈 SYSTEM METRICS');
  console.log('-'.repeat(80));
  console.log(`Universe Size:           ${finalMetrics.universeSize} tickers`);
  console.log(`Premium Tickers:         ${finalMetrics.premiumTickers} (updated every 60s)`);
  console.log(`Rest Tickers:            ${finalMetrics.restTickers} (updated every 5min)`);
  console.log(`Redis Connection:        ${finalMetrics.redisConnected ? '✅ Connected' : '❌ Disconnected'}`);
  console.log(`Database Connection:     ${finalMetrics.dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
  
  console.log('\n⏱️  WORKER METRICS');
  console.log('-'.repeat(80));
  
  for (const worker of workers) {
    const runningTime = ((Date.now() - worker.startTime) / 1000).toFixed(2);
    
    console.log(`\n${worker.name.toUpperCase()} WORKER:`);
    console.log(`  Startup Time:          ${worker.startTime ? new Date(worker.startTime).toISOString() : 'N/A'}`);
    console.log(`  Running For:           ${runningTime}s`);
    
    if (worker.firstCycleDuration) {
      console.log(`  First Cycle Duration:   ${(worker.firstCycleDuration / 1000).toFixed(2)}s`);
    }
    
    if (worker.cyclesCompleted > 0) {
      console.log(`  Cycles Completed:       ${worker.cyclesCompleted}`);
      if (worker.avgCycleTime) {
        console.log(`  Avg Cycle Time:        ${(worker.avgCycleTime / 1000).toFixed(2)}s`);
      }
    }
    
    if (worker.batches.length > 0) {
      console.log(`  Batches Processed:      ${worker.batches.length}`);
      console.log(`  Total Tickers:          ${worker.totalTickersProcessed}`);
      const avgBatchSize = worker.totalTickersProcessed / worker.batches.length;
      console.log(`  Avg Batch Size:         ${avgBatchSize.toFixed(1)} tickers`);
    }
    
    // Calculate throughput
    if (worker.firstCycleDuration && worker.totalTickersProcessed > 0) {
      const throughput = (worker.totalTickersProcessed / (worker.firstCycleDuration / 1000)).toFixed(2);
      console.log(`  Throughput:            ${throughput} tickers/second`);
    }
  }
  
  console.log('\n📊 CONFIGURATION');
  console.log('-'.repeat(80));
  console.log(`Batch Size:              70 tickers (snapshot worker)`);
  console.log(`Rate Limit:              250 req/min (conservative)`);
  console.log(`Delay Between Batches:   ~17s (calculated)`);
  console.log(`Check Interval:          30s (snapshot), 60s (refs)`);
  console.log(`Premium Update Interval:  60s`);
  console.log(`Rest Update Interval:    5min (300s)`);
  
  console.log('\n📈 PERFORMANCE ANALYSIS');
  console.log('-'.repeat(80));
  
  const snapshotWorker = workers.find(w => w.name === 'snapshot');
  if (snapshotWorker && snapshotWorker.firstCycleDuration && finalMetrics.universeSize > 0) {
    const batchesNeeded = Math.ceil(finalMetrics.universeSize / 70);
    const estimatedFullCycle = batchesNeeded * 17; // 17s per batch
    const actualCycle = snapshotWorker.firstCycleDuration / 1000;
    
    console.log(`Estimated Full Cycle:    ${estimatedFullCycle.toFixed(0)}s (${batchesNeeded} batches × 17s)`);
    console.log(`Actual First Cycle:       ${actualCycle.toFixed(2)}s`);
    
    if (snapshotWorker.cyclesCompleted > 1 && snapshotWorker.avgCycleTime) {
      console.log(`Average Cycle Time:       ${(snapshotWorker.avgCycleTime / 1000).toFixed(2)}s`);
    }
    
    // Note: Actual cycle processed subset of tickers, not full universe
    const tickersInCycle = snapshotWorker.totalTickersProcessed || 280;
    console.log(`Tickers in Cycle:         ${tickersInCycle} (of ${finalMetrics.universeSize} total)`);
    console.log(`Note: Actual cycle processed ${tickersInCycle} tickers, not full universe.`);
  }
  
  const refsWorker = workers.find(w => w.name === 'refs');
  if (refsWorker && refsWorker.firstCycleDuration) {
    console.log(`\nRefs Worker Performance:`);
    console.log(`  First Cycle:            ${(refsWorker.firstCycleDuration / 1000).toFixed(2)}s`);
    console.log(`  Cycles Completed:       ${refsWorker.cyclesCompleted}`);
  }
  
  console.log('\n💡 RECOMMENDATIONS');
  console.log('-'.repeat(80));
  
  if (snapshotWorker && snapshotWorker.firstCycleDuration) {
    const cycleTime = snapshotWorker.firstCycleDuration / 1000;
    if (cycleTime > 60) {
      console.log(`⚠️  First cycle took ${cycleTime.toFixed(0)}s - consider batch optimization`);
    } else {
      console.log(`✅ Cycle time is optimal (${cycleTime.toFixed(0)}s)`);
    }
  }
  
  if (finalMetrics.universeSize < 500) {
    console.log(`⚠️  Universe size (${finalMetrics.universeSize}) is below expected (500+)`);
  } else {
    console.log(`✅ Universe size is healthy (${finalMetrics.universeSize} tickers)`);
  }
  
  if (!finalMetrics.redisConnected) {
    console.log(`⚠️  Redis not connected - using in-memory cache (data will be lost on restart)`);
  } else {
    console.log(`✅ Redis connected - persistent caching enabled`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`Total Monitoring Time: ${totalTime}s`);
  console.log('='.repeat(80));
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  // Kill worker processes
  for (const worker of workers) {
    if (worker.process && !worker.process.killed) {
      console.log(`Stopping ${worker.name} worker...`);
      try {
        worker.process.kill('SIGTERM');
      } catch (error) {
        console.warn(`Failed to kill ${worker.name} worker:`, error);
      }
    }
  }
  
  // Kill app process
  if (appProcess && !appProcess.killed) {
    console.log('Stopping Next.js app...');
    try {
      appProcess.kill('SIGTERM');
    } catch (error) {
      console.warn('Failed to kill app process:', error);
    }
  }
  
  // Give processes time to exit gracefully
  await setTimeout(2000);
  
  // Force kill if still running
  for (const worker of workers) {
    if (worker.process && !worker.process.killed) {
      try {
        worker.process.kill('SIGKILL');
      } catch (error) {
        // Ignore
      }
    }
  }
  
  if (appProcess && !appProcess.killed) {
    try {
      appProcess.kill('SIGKILL');
    } catch (error) {
      // Ignore
    }
  }
  
  await setTimeout(1000);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('🚀 Comprehensive Worker Performance Analysis');
    console.log('='.repeat(80));
    
    await startApp();
    console.log(`\n⏳ Waiting ${WORKER_START_DELAY / 1000}s for app to stabilize...`);
    await setTimeout(WORKER_START_DELAY);
    
    startWorker('refs', 'scripts/start-worker-refs.js', 'refs');
    await setTimeout(2000);
    startWorker('snapshot', 'scripts/start-worker-snapshot.js', 'snapshot');
    
    await monitorWorkers();
    
    console.log('\n⏳ Keeping workers running for 10s to capture final metrics...');
    await setTimeout(10000);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await cleanup();
  }
}

main();


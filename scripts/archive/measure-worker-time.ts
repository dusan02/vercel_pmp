/**
 * Script to measure worker execution time
 * - Starts Next.js app
 * - Starts workers (refs + snapshot)
 * - Measures time until first successful data ingestion cycle
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

const WORKER_START_DELAY = 5000; // 5s delay after app start
const MAX_WAIT_TIME = 300000; // 5 minutes max wait
const CHECK_INTERVAL = 2000; // Check every 2 seconds

interface WorkerProcess {
  name: string;
  process: ChildProcess;
  startTime: number;
  endTime?: number;
  logs: string[];
}

const workers: WorkerProcess[] = [];
let appProcess: ChildProcess | null = null;

async function checkRedisForCompletion(): Promise<{ refsDone: boolean; snapshotDone: boolean }> {
  try {
    const { redisClient } = await import('../src/lib/redis');
    if (!redisClient || !redisClient.isOpen) {
      return { refsDone: false, snapshotDone: false };
    }

    // Check for worker status indicators
    const lastSuccess = await redisClient.get('worker:last_success_ts');
    const hasUniverse = await redisClient.exists('universe:sp500');
    
    // Check if we have recent data
    const hasRecentData = lastSuccess && (Date.now() - parseInt(lastSuccess, 10)) < 120000; // 2 minutes
    
    return {
      refsDone: hasUniverse > 0,
      snapshotDone: hasRecentData || false
    };
  } catch (error) {
    console.warn('Error checking Redis:', error);
    return { refsDone: false, snapshotDone: false };
  }
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
          setTimeout(2000).then(() => resolve()); // Give it 2s to fully initialize
        }
      }
    };

    appProcess.stdout?.on('data', checkReady);
    appProcess.stderr?.on('data', checkReady);

    // Timeout after 30 seconds
    setTimeout(30000).then(() => {
      if (!appReady) {
        console.log('⚠️ App startup timeout, assuming ready...');
        resolve();
      }
    });
  });
}

function startWorker(name: string, script: string, mode: string): WorkerProcess {
  console.log(`🔄 Starting ${name} worker...`);
  const startTime = Date.now();
  
  const workerProcess = spawn('node', [script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MODE: mode },
    shell: true,
    windowsHide: true,
    detached: false
  });

  const worker: WorkerProcess = {
    name,
    process: workerProcess,
    startTime,
    logs: []
  };

  workerProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    worker.logs.push(output);
    process.stdout.write(data); // Also show in console
  });

  workerProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    worker.logs.push(output);
    process.stderr.write(data);
  });

  workerProcess.on('exit', (code) => {
    worker.endTime = Date.now();
    const duration = ((worker.endTime - worker.startTime) / 1000).toFixed(2);
    console.log(`\n${code === 0 ? '✅' : '❌'} ${name} worker exited (code: ${code}) after ${duration}s`);
  });

  workers.push(worker);
  return worker;
}

async function monitorWorkers(): Promise<void> {
  console.log('\n📊 Monitoring workers...');
  const monitoringStart = Date.now();
  let lastStatus = { refsDone: false, snapshotDone: false };
  let cyclesChecked = 0;

  while (Date.now() - monitoringStart < MAX_WAIT_TIME) {
    await setTimeout(CHECK_INTERVAL);
    cyclesChecked++;

    // Check Redis for completion indicators
    const status = await checkRedisForCompletion();
    
    // Check worker logs for completion indicators
    for (const worker of workers) {
      const recentLogs = worker.logs.slice(-10).join('');
      
      if (worker.name === 'refs' && !lastStatus.refsDone) {
        if (recentLogs.includes('Universe refreshed') || 
            recentLogs.includes('Previous closes bootstrapped') ||
            recentLogs.includes('✅')) {
          lastStatus.refsDone = true;
          worker.endTime = Date.now();
          const duration = ((worker.endTime - worker.startTime) / 1000).toFixed(2);
          console.log(`\n✅ Refs worker completed first cycle in ${duration}s`);
        }
      }
      
      if (worker.name === 'snapshot' && !lastStatus.snapshotDone) {
        if (recentLogs.includes('Processing batch') && 
            recentLogs.includes('✅') ||
            recentLogs.includes('hasSuccess = true') ||
            status.snapshotDone) {
          lastStatus.snapshotDone = true;
          worker.endTime = Date.now();
          const duration = ((worker.endTime - worker.startTime) / 1000).toFixed(2);
          console.log(`\n✅ Snapshot worker completed first cycle in ${duration}s`);
        }
      }
    }

    // Update status from Redis
    if (status.refsDone && !lastStatus.refsDone) {
      lastStatus.refsDone = true;
      const refsWorker = workers.find(w => w.name === 'refs');
      if (refsWorker && !refsWorker.endTime) {
        refsWorker.endTime = Date.now();
        const duration = ((refsWorker.endTime - refsWorker.startTime) / 1000).toFixed(2);
        console.log(`\n✅ Refs worker completed (detected via Redis) in ${duration}s`);
      }
    }

    if (status.snapshotDone && !lastStatus.snapshotDone) {
      lastStatus.snapshotDone = true;
      const snapshotWorker = workers.find(w => w.name === 'snapshot');
      if (snapshotWorker && !snapshotWorker.endTime) {
        snapshotWorker.endTime = Date.now();
        const duration = ((snapshotWorker.endTime - snapshotWorker.startTime) / 1000).toFixed(2);
        console.log(`\n✅ Snapshot worker completed first cycle (detected via Redis) in ${duration}s`);
      }
    }

    // Show progress every 30 seconds
    if (cyclesChecked % 15 === 0) {
      const elapsed = ((Date.now() - monitoringStart) / 1000).toFixed(0);
      console.log(`\n⏱️  Elapsed: ${elapsed}s | Refs: ${lastStatus.refsDone ? '✅' : '⏳'} | Snapshot: ${lastStatus.snapshotDone ? '✅' : '⏳'}`);
    }

    // Both done?
    if (lastStatus.refsDone && lastStatus.snapshotDone) {
      console.log('\n🎉 Both workers completed their first cycles!');
      break;
    }
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL REPORT');
  console.log('='.repeat(60));
  
  const totalTime = ((Date.now() - monitoringStart) / 1000).toFixed(2);
  console.log(`\nTotal monitoring time: ${totalTime}s`);
  
  for (const worker of workers) {
    if (worker.endTime) {
      const duration = ((worker.endTime - worker.startTime) / 1000).toFixed(2);
      console.log(`\n${worker.name} worker:`);
      console.log(`  ⏱️  Duration: ${duration}s`);
      console.log(`  ✅ Status: Completed`);
    } else {
      const duration = ((Date.now() - worker.startTime) / 1000).toFixed(2);
      console.log(`\n${worker.name} worker:`);
      console.log(`  ⏱️  Running for: ${duration}s`);
      console.log(`  ⏳ Status: Still running (may be continuous)`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  for (const worker of workers) {
    if (worker.process && !worker.process.killed) {
      console.log(`Stopping ${worker.name} worker...`);
      worker.process.kill();
    }
  }
  
  if (appProcess && !appProcess.killed) {
    console.log('Stopping Next.js app...');
    appProcess.kill();
  }
  
  // Give processes time to exit
  await setTimeout(2000);
  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('🚀 Starting Application & Workers Performance Test');
    console.log('='.repeat(60));
    
    // Step 1: Start app
    await startApp();
    
    // Step 2: Wait a bit for app to stabilize
    console.log(`\n⏳ Waiting ${WORKER_START_DELAY / 1000}s for app to stabilize...`);
    await setTimeout(WORKER_START_DELAY);
    
    // Step 3: Start workers
    const refsWorker = startWorker('refs', 'scripts/start-worker-refs.js', 'refs');
    await setTimeout(2000); // Small delay between workers
    const snapshotWorker = startWorker('snapshot', 'scripts/start-worker-snapshot.js', 'snapshot');
    
    // Step 4: Monitor and measure
    await monitorWorkers();
    
    // Step 5: Keep running for a bit to see ongoing activity
    console.log('\n⏳ Keeping workers running for 30s to observe ongoing activity...');
    await setTimeout(30000);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await cleanup();
  }
}

main();


/**
 * Script to restart application, start workers, and measure execution time
 * - Stops all running processes
 * - Starts Next.js app on localhost:3000
 * - Starts workers (refs + snapshot)
 * - Measures time until first successful data ingestion cycle
 * - Generates comprehensive report
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { setTimeout } from 'timers/promises';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

const WORKER_START_DELAY = 10000; // 10s delay after app start
const MAX_WAIT_TIME = 600000; // 10 minutes max wait
const CHECK_INTERVAL = 3000; // Check every 3 seconds
const OBSERVE_TIME = 60000; // Observe for 60s after completion

interface WorkerProcess {
  name: string;
  process: ChildProcess;
  startTime: number;
  endTime?: number;
  logs: string[];
  firstCycleTime?: number;
}

interface AppMetrics {
  startTime: number;
  readyTime?: number;
  readyDuration?: number;
}

const workers: WorkerProcess[] = [];
let appProcess: ChildProcess | null = null;
const appMetrics: AppMetrics = { startTime: Date.now() };

// Kill processes on Windows
async function killProcessesOnPort(port: number): Promise<void> {
  try {
    console.log(`🔍 Checking for processes on port ${port}...`);
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.split('\n').filter(line => line.trim());
    
    const pids = new Set<string>();
    for (const line of lines) {
      const match = line.match(/\s+(\d+)$/);
      if (match) {
        pids.add(match[1]);
      }
    }
    
    for (const pid of pids) {
      try {
        console.log(`🛑 Killing process ${pid}...`);
        await execAsync(`taskkill /F /PID ${pid}`);
        await setTimeout(500);
      } catch (error) {
        // Process might already be dead
      }
    }
  } catch (error) {
    // No processes found or error - that's okay
    console.log(`✅ No processes found on port ${port}`);
  }
}

async function checkRedisForCompletion(): Promise<{ refsDone: boolean; snapshotDone: boolean; snapshotProgress?: number }> {
  try {
    const { redisClient } = await import('../src/lib/redis');
    if (!redisClient || !redisClient.isOpen) {
      return { refsDone: false, snapshotDone: false };
    }

    // Check for worker status indicators
    const lastSuccess = await redisClient.get('worker:last_success_ts');
    const hasUniverse = await redisClient.exists('universe:sp500');
    
    // Check snapshot progress
    const snapshotProgress = await redisClient.get('worker:snapshot:progress');
    const progress = snapshotProgress ? parseInt(snapshotProgress, 10) : 0;
    
    // Check if we have recent data (within 2 minutes)
    const hasRecentData = lastSuccess && (Date.now() - parseInt(lastSuccess, 10)) < 120000;
    
    return {
      refsDone: hasUniverse > 0,
      snapshotDone: hasRecentData || false,
      snapshotProgress: progress
    };
  } catch (error) {
    console.warn('⚠️ Error checking Redis:', error);
    return { refsDone: false, snapshotDone: false };
  }
}

function startApp(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Next.js application on localhost:3000...');
    appMetrics.startTime = Date.now();
    
    appProcess = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      detached: false,
      cwd: process.cwd()
    });

    let appReady = false;
    const checkReady = (data: Buffer) => {
      const output = data.toString();
      if ((output.includes('Ready in') || output.includes('Local:') || 
           output.includes('localhost:3000') || output.includes('started server')) && !appReady) {
        appReady = true;
        appMetrics.readyTime = Date.now();
        appMetrics.readyDuration = ((appMetrics.readyTime - appMetrics.startTime) / 1000);
        console.log(`✅ Next.js app is ready (${appMetrics.readyDuration?.toFixed(2)}s)`);
        setTimeout(3000).then(() => resolve()); // Give it 3s to fully initialize
      }
    };

    appProcess.stdout?.on('data', checkReady);
    appProcess.stderr?.on('data', checkReady);

    // Timeout after 60 seconds
    setTimeout(60000).then(() => {
      if (!appReady) {
        console.log('⚠️ App startup timeout, assuming ready...');
        appMetrics.readyTime = Date.now();
        appMetrics.readyDuration = ((appMetrics.readyTime - appMetrics.startTime) / 1000);
        resolve();
      }
    });

    appProcess.on('error', (error) => {
      console.error('❌ Error starting app:', error);
      reject(error);
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
    detached: false,
    cwd: process.cwd()
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
    process.stdout.write(`[${name}] ${output}`);
  });

  workerProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    worker.logs.push(output);
    process.stderr.write(`[${name}] ${output}`);
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
  let lastStatus = { refsDone: false, snapshotDone: false, snapshotProgress: 0 };
  let cyclesChecked = 0;
  let lastProgress = 0;

  while (Date.now() - monitoringStart < MAX_WAIT_TIME) {
    await setTimeout(CHECK_INTERVAL);
    cyclesChecked++;

    // Check Redis for completion indicators
    const status = await checkRedisForCompletion();
    
    // Check worker logs for completion indicators
    for (const worker of workers) {
      const recentLogs = worker.logs.slice(-20).join('');
      
      if (worker.name === 'refs' && !lastStatus.refsDone) {
        if (recentLogs.includes('Universe refreshed') || 
            recentLogs.includes('Previous closes bootstrapped') ||
            recentLogs.includes('✅ Refs worker') ||
            status.refsDone) {
          lastStatus.refsDone = true;
          worker.firstCycleTime = Date.now();
          if (!worker.endTime) {
            worker.endTime = Date.now();
          }
          const duration = ((worker.firstCycleTime - worker.startTime) / 1000).toFixed(2);
          console.log(`\n✅ Refs worker completed first cycle in ${duration}s`);
        }
      }
      
      if (worker.name === 'snapshot' && !lastStatus.snapshotDone) {
        // Check for completion patterns
        const hasCompletion = recentLogs.includes('✅ Snapshot worker') ||
                              recentLogs.includes('hasSuccess = true') ||
                              recentLogs.includes('Processing complete') ||
                              status.snapshotDone;
        
        if (hasCompletion) {
          lastStatus.snapshotDone = true;
          worker.firstCycleTime = Date.now();
          if (!worker.endTime) {
            worker.endTime = Date.now();
          }
          const duration = ((worker.firstCycleTime - worker.startTime) / 1000).toFixed(2);
          console.log(`\n✅ Snapshot worker completed first cycle in ${duration}s`);
        }
      }
    }

    // Update status from Redis
    if (status.refsDone && !lastStatus.refsDone) {
      lastStatus.refsDone = true;
      const refsWorker = workers.find(w => w.name === 'refs');
      if (refsWorker && !refsWorker.firstCycleTime) {
        refsWorker.firstCycleTime = Date.now();
        const duration = ((refsWorker.firstCycleTime - refsWorker.startTime) / 1000).toFixed(2);
        console.log(`\n✅ Refs worker completed (detected via Redis) in ${duration}s`);
      }
    }

    if (status.snapshotDone && !lastStatus.snapshotDone) {
      lastStatus.snapshotDone = true;
      const snapshotWorker = workers.find(w => w.name === 'snapshot');
      if (snapshotWorker && !snapshotWorker.firstCycleTime) {
        snapshotWorker.firstCycleTime = Date.now();
        const duration = ((snapshotWorker.firstCycleTime - snapshotWorker.startTime) / 1000).toFixed(2);
        console.log(`\n✅ Snapshot worker completed first cycle (detected via Redis) in ${duration}s`);
      }
    }

    // Show progress
    if (status.snapshotProgress && status.snapshotProgress !== lastProgress) {
      lastProgress = status.snapshotProgress;
      console.log(`📈 Snapshot progress: ${status.snapshotProgress}%`);
    }

    // Show status every 30 seconds
    if (cyclesChecked % 10 === 0) {
      const elapsed = ((Date.now() - monitoringStart) / 1000).toFixed(0);
      console.log(`\n⏱️  Elapsed: ${elapsed}s | Refs: ${lastStatus.refsDone ? '✅' : '⏳'} | Snapshot: ${lastStatus.snapshotDone ? '✅' : '⏳'} (${lastProgress}%)`);
    }

    // Both done?
    if (lastStatus.refsDone && lastStatus.snapshotDone) {
      console.log('\n🎉 Both workers completed their first cycles!');
      break;
    }
  }

  return { monitoringStart, lastStatus };
}

function generateReport(monitoringStart: number, lastStatus: any): string {
  const reportTime = new Date().toISOString();
  const totalTime = ((Date.now() - monitoringStart) / 1000).toFixed(2);
  
  let report = '\n' + '='.repeat(80);
  report += '\n📊 APPLICATION RESTART & PERFORMANCE REPORT';
  report += '\n' + '='.repeat(80);
  report += `\n\nGenerated: ${reportTime}`;
  report += '\n\n' + '-'.repeat(80);
  report += '\n🚀 APPLICATION STARTUP';
  report += '\n' + '-'.repeat(80);
  report += `\n⏱️  App startup time: ${appMetrics.readyDuration?.toFixed(2) || 'N/A'}s`;
  report += `\n📅 Start time: ${new Date(appMetrics.startTime).toLocaleString()}`;
  report += `\n✅ Ready time: ${appMetrics.readyTime ? new Date(appMetrics.readyTime).toLocaleString() : 'N/A'}`;
  report += `\n🌐 URL: http://localhost:3000`;
  
  report += '\n\n' + '-'.repeat(80);
  report += '\n⚙️  WORKERS PERFORMANCE';
  report += '\n' + '-'.repeat(80);
  
  for (const worker of workers) {
    report += `\n\n${worker.name.toUpperCase()} Worker:`;
    if (worker.firstCycleTime) {
      const duration = ((worker.firstCycleTime - worker.startTime) / 1000).toFixed(2);
      report += `\n  ⏱️  First cycle time: ${duration}s`;
      report += `\n  📅 Started: ${new Date(worker.startTime).toLocaleString()}`;
      report += `\n  ✅ Completed: ${new Date(worker.firstCycleTime).toLocaleString()}`;
      report += `\n  ✅ Status: Completed`;
    } else {
      const duration = ((Date.now() - worker.startTime) / 1000).toFixed(2);
      report += `\n  ⏱️  Running for: ${duration}s`;
      report += `\n  📅 Started: ${new Date(worker.startTime).toLocaleString()}`;
      report += `\n  ⏳ Status: Still running (may be continuous)`;
    }
  }
  
  report += '\n\n' + '-'.repeat(80);
  report += '\n📈 SUMMARY';
  report += '\n' + '-'.repeat(80);
  report += `\n⏱️  Total monitoring time: ${totalTime}s`;
  report += `\n✅ Refs worker: ${lastStatus.refsDone ? 'Completed' : 'Running'}`;
  report += `\n✅ Snapshot worker: ${lastStatus.snapshotDone ? 'Completed' : 'Running'}`;
  
  const allCompleted = lastStatus.refsDone && lastStatus.snapshotDone;
  if (allCompleted) {
    const refsTime = workers.find(w => w.name === 'refs')?.firstCycleTime 
      ? ((workers.find(w => w.name === 'refs')!.firstCycleTime! - workers.find(w => w.name === 'refs')!.startTime) / 1000).toFixed(2)
      : 'N/A';
    const snapshotTime = workers.find(w => w.name === 'snapshot')?.firstCycleTime
      ? ((workers.find(w => w.name === 'snapshot')!.firstCycleTime! - workers.find(w => w.name === 'snapshot')!.startTime) / 1000).toFixed(2)
      : 'N/A';
    
    report += `\n\n🎉 All workers completed successfully!`;
    report += `\n📊 Refs cycle: ${refsTime}s`;
    report += `\n📊 Snapshot cycle: ${snapshotTime}s`;
  }
  
  report += '\n\n' + '='.repeat(80);
  report += '\n';
  
  return report;
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  
  for (const worker of workers) {
    if (worker.process && !worker.process.killed) {
      console.log(`Stopping ${worker.name} worker...`);
      try {
        worker.process.kill('SIGTERM');
        await setTimeout(2000);
        if (!worker.process.killed) {
          worker.process.kill('SIGKILL');
        }
      } catch (error) {
        console.warn(`Warning: Could not stop ${worker.name} worker:`, error);
      }
    }
  }
  
  if (appProcess && !appProcess.killed) {
    console.log('Stopping Next.js app...');
    try {
      appProcess.kill('SIGTERM');
      await setTimeout(2000);
      if (!appProcess.killed) {
        appProcess.kill('SIGKILL');
      }
    } catch (error) {
      console.warn('Warning: Could not stop app:', error);
    }
  }
  
  // Give processes time to exit
  await setTimeout(2000);
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('🚀 APPLICATION RESTART & PERFORMANCE MEASUREMENT');
    console.log('='.repeat(80));
    
    // Step 1: Kill existing processes
    console.log('\n🛑 Step 1: Stopping existing processes...');
    await killProcessesOnPort(3000);
    await setTimeout(2000);
    
    // Step 2: Start app
    console.log('\n🚀 Step 2: Starting Next.js application...');
    await startApp();
    
    // Step 3: Wait for app to stabilize
    console.log(`\n⏳ Step 3: Waiting ${WORKER_START_DELAY / 1000}s for app to stabilize...`);
    await setTimeout(WORKER_START_DELAY);
    
    // Step 4: Start workers
    console.log('\n⚙️  Step 4: Starting workers...');
    const refsWorker = startWorker('refs', 'scripts/start-worker-refs.js', 'refs');
    await setTimeout(3000); // Small delay between workers
    const snapshotWorker = startWorker('snapshot', 'scripts/start-worker-snapshot.js', 'snapshot');
    
    // Step 5: Monitor and measure
    console.log('\n📊 Step 5: Monitoring workers...');
    const { monitoringStart, lastStatus } = await monitorWorkers();
    
    // Step 6: Keep running to observe ongoing activity
    console.log(`\n⏳ Step 6: Observing workers for ${OBSERVE_TIME / 1000}s...`);
    await setTimeout(OBSERVE_TIME);
    
    // Step 7: Generate and display report
    console.log('\n📝 Step 7: Generating report...');
    const report = generateReport(monitoringStart, lastStatus);
    console.log(report);
    
    // Save report to file
    const reportPath = path.join(process.cwd(), 'RESTART_REPORT.md');
    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`\n💾 Report saved to: ${reportPath}`);
    
    console.log('\n✅ Measurement complete! Application and workers are still running.');
    console.log('💡 Press Ctrl+C to stop all processes.');
    
    // Keep running until user stops
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Error:', error);
    await cleanup();
    process.exit(1);
  }
}

main();


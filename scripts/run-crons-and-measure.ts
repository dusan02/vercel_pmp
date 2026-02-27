/**
 * Script to run all cron jobs and measure their execution time
 * 
 * Usage: tsx scripts/run-crons-and-measure.ts
 */

import { performance } from 'perf_hooks';

interface CronResult {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST';
  success: boolean;
  duration: number;
  durationFormatted: string;
  statusCode?: number;
  error?: string;
  response?: any;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET_KEY = process.env.CRON_SECRET_KEY || '';

const CRON_JOBS = [
  {
    name: 'Daily Integrity Check',
    endpoint: '/api/cron/daily-integrity',
    method: 'GET' as const, // Use GET for manual testing
    requiresAuth: false
  },
  {
    name: 'Verify Sector/Industry',
    endpoint: '/api/cron/verify-sector-industry',
    method: 'GET' as const, // Use GET for manual testing (no auth required)
    requiresAuth: false
  },
  {
    name: 'Update Static Data',
    endpoint: '/api/cron/update-static-data',
    method: 'GET' as const, // Use GET for testing (limited to 10 tickers)
    requiresAuth: false
  },
  {
    name: 'Earnings Calendar',
    endpoint: '/api/cron/earnings-calendar',
    method: 'GET' as const, // Use GET for manual testing
    requiresAuth: false
  },
  {
    name: 'Blog Scheduler',
    endpoint: '/api/cron/blog',
    method: 'GET' as const,
    requiresAuth: false
  },
  {
    name: 'Movers Impact Tracker',
    endpoint: '/api/cron/mover-impact',
    method: 'GET' as const,
    requiresAuth: false
  }
];

/**
 * Run a single cron job and measure execution time
 */
async function runCronJob(
  name: string,
  endpoint: string,
  method: 'GET' | 'POST',
  requiresAuth: boolean
): Promise<CronResult> {
  const startTime = performance.now();
  const url = `${BASE_URL}${endpoint}`;

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth && CRON_SECRET_KEY) {
      headers['Authorization'] = `Bearer ${CRON_SECRET_KEY}`;
    }

    console.log(`\n🚀 Starting: ${name}`);
    console.log(`   URL: ${url}`);
    console.log(`   Method: ${method}`);

    const response = await fetch(url, {
      method,
      headers,
    });

    const endTime = performance.now();
    const duration = endTime - startTime;
    const durationFormatted = formatDuration(duration);

    let responseData: any = null;
    try {
      responseData = await response.json();
    } catch (e) {
      // Response might not be JSON
      responseData = { text: await response.text() };
    }

    const success = response.ok;

    if (success) {
      console.log(`   ✅ Success (${durationFormatted})`);
      if (responseData.message) {
        console.log(`   Message: ${responseData.message}`);
      }
    } else {
      console.log(`   ❌ Failed (${durationFormatted})`);
      console.log(`   Status: ${response.status}`);
      if (responseData.error) {
        console.log(`   Error: ${responseData.error}`);
      }
    }

    return {
      name,
      endpoint,
      method,
      success,
      duration,
      durationFormatted,
      statusCode: response.status,
      error: success ? undefined : (responseData.error || 'Unknown error'),
      response: responseData,
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    const durationFormatted = formatDuration(duration);

    console.log(`   ❌ Error (${durationFormatted})`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);

    return {
      name,
      endpoint,
      method,
      success: false,
      duration,
      durationFormatted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Main function to run all cron jobs
 */
async function main() {
  console.log('='.repeat(70));
  console.log('📊 CRON JOBS PERFORMANCE MEASUREMENT');
  console.log('='.repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  const results: CronResult[] = [];
  const totalStartTime = performance.now();

  // Run all cron jobs sequentially
  for (const job of CRON_JOBS) {
    const result = await runCronJob(
      job.name,
      job.endpoint,
      job.method,
      job.requiresAuth
    );
    results.push(result);

    // Small delay between jobs to avoid overwhelming the server
    if (job !== CRON_JOBS[CRON_JOBS.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalEndTime = performance.now();
  const totalDuration = totalEndTime - totalStartTime;

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nTotal Jobs: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`\nTotal Duration: ${formatDuration(totalDuration)}`);

  console.log('\n' + '-'.repeat(70));
  console.log('Individual Results:');
  console.log('-'.repeat(70));

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(
      `\n${index + 1}. ${status} ${result.name}`
    );
    console.log(`   Endpoint: ${result.endpoint}`);
    console.log(`   Duration: ${result.durationFormatted}`);
    if (result.statusCode) {
      console.log(`   Status: ${result.statusCode}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.response && result.response.summary) {
      console.log(`   Summary:`, JSON.stringify(result.response.summary, null, 2));
    }
  });

  // Calculate statistics
  const durations = results.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  console.log('\n' + '-'.repeat(70));
  console.log('Performance Statistics:');
  console.log('-'.repeat(70));
  console.log(`Average Duration: ${formatDuration(avgDuration)}`);
  console.log(`Min Duration: ${formatDuration(minDuration)}`);
  console.log(`Max Duration: ${formatDuration(maxDuration)}`);

  // Save results to file
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalDuration: formatDuration(totalDuration),
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
    },
    statistics: {
      average: formatDuration(avgDuration),
      min: formatDuration(minDuration),
      max: formatDuration(maxDuration),
    },
    results: results.map(r => ({
      name: r.name,
      endpoint: r.endpoint,
      success: r.success,
      duration: r.durationFormatted,
      statusCode: r.statusCode,
      error: r.error,
    })),
  };

  const fs = await import('fs');
  const path = await import('path');
  const reportPath = path.join(process.cwd(), 'cron-performance-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ Measurement complete!');
  console.log('='.repeat(70));

  // Exit with error code if any job failed
  process.exit(failed.length > 0 ? 1 : 0);
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});


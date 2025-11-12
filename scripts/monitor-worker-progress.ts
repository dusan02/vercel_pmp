/**
 * Monitor Worker Progress
 * 
 * Monitors the background preloader worker progress by checking:
 * - Rank indexes count
 * - Bulk API data availability
 * - Data completeness
 * 
 * Usage: tsx scripts/monitor-worker-progress.ts
 */

import { getRankCount, getDateET } from '../src/lib/rankIndexes';
import { detectSession, nowET } from '../src/lib/timeUtils';
import { getAllTrackedTickers } from '../src/lib/universeHelpers';

async function checkProgress() {
  const date = getDateET();
  const session = detectSession(nowET());
  
  // Check rank indexes
  const capdiffCount = await getRankCount(date, session, 'capdiff');
  const priceCount = await getRankCount(date, session, 'price');
  const chgCount = await getRankCount(date, session, 'chg');
  
  // Check bulk API
  const allTickers = await getAllTrackedTickers();
  const response = await fetch(
    `http://localhost:3000/api/stocks/bulk?session=${session}&sort=marketCapDiff&order=desc&limit=600`
  );
  const result = await response.json();
  const dataCount = result.data?.length || 0;
  
  // Calculate progress
  const expectedCount = Math.min(600, allTickers.length);
  const progress = Math.round((dataCount / expectedCount) * 100);
  
  console.log('\n📊 Worker Progress\n');
  console.log('='.repeat(60));
  console.log(`Rank Indexes:`);
  console.log(`  - Market Cap Diff: ${capdiffCount}`);
  console.log(`  - Price: ${priceCount}`);
  console.log(`  - Change %: ${chgCount}`);
  console.log(`\nBulk API Data:`);
  console.log(`  - Available: ${dataCount} stocks`);
  console.log(`  - Expected: ${expectedCount} stocks`);
  console.log(`  - Progress: ${progress}%`);
  console.log(`  - Duration: ${result.duration}ms`);
  console.log(`  - Cached: ${result.cached}`);
  
  if (progress >= 80) {
    console.log(`\n✅ Worker is almost complete! (${progress}%)`);
  } else if (progress > 0) {
    console.log(`\n⏳ Worker is loading... (${progress}%)`);
  } else {
    console.log(`\n⏳ Worker just started, waiting for data...`);
  }
  
  console.log('='.repeat(60));
}

async function monitor() {
  console.log('🔍 Monitoring Worker Progress...\n');
  console.log('Press Ctrl+C to stop\n');
  
  // Check immediately
  await checkProgress();
  
  // Then check every 30 seconds
  const interval = setInterval(async () => {
    await checkProgress();
  }, 30000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n👋 Monitoring stopped');
    clearInterval(interval);
    process.exit(0);
  });
}

monitor().catch((error) => {
  console.error('❌ Monitoring error:', error);
  process.exit(1);
});


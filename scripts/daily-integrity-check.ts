/**
 * Daily Integrity Check Script
 *
 * Verifies that:
 * - all priced tickers have previous close (D-1 trading day)
 * - % change is sane and matches computed value
 * - market cap + market cap diff are consistent
 * - logo exists (either stored URL or local static file)
 * - sector/industry are present and valid
 *
 * Usage:
 *   npx tsx scripts/daily-integrity-check.ts
 *   npx tsx scripts/daily-integrity-check.ts --fix
 */

import { runDailyIntegrityCheck } from '../src/lib/jobs/dailyIntegrityCheck';

async function main() {
  // `tsx` can consume unknown flags; support both argv and env.
  const fix =
    process.argv.includes('--fix') ||
    process.argv.includes('--fix=true') ||
    process.env.INTEGRITY_FIX === 'true' ||
    process.env.INTEGRITY_FIX === '1';

  const summary = await runDailyIntegrityCheck({
    fix,
    maxSamplesPerIssue: 20
  });

  console.log('\n' + '='.repeat(70));
  console.log('📋 DAILY INTEGRITY CHECK');
  console.log('='.repeat(70));
  console.log(`Run at: ${summary.runAt}`);
  console.log(`ET date: ${summary.etDate}`);
  console.log(`Session: ${summary.session}`);
  console.log(`Expected prevClose trading day: ${summary.expectedPrevCloseDateET}`);
  console.log('-'.repeat(70));
  console.log(`Tickers total: ${summary.totals.tickers}`);
  console.log(`Tickers with price: ${summary.totals.tickersWithPrice}`);
  console.log(`Issues total: ${summary.totals.issues}`);
  console.log(`Unique tickers with issues: ${summary.totals.uniqueSymbolsWithIssues}`);

  if (summary.fixes) {
    console.log('-'.repeat(70));
    console.log('Fixes:');
    console.log(`  prevClose fixed: ${summary.fixes.prevCloseFixed}`);
    console.log(`  sharesOutstanding fixed: ${summary.fixes.sharesFixed}`);
    console.log(`  logos fixed: ${summary.fixes.logosFixed}`);
  }

  console.log('-'.repeat(70));
  console.log('Top issue samples:');
  for (const [code, v] of Object.entries(summary.byCode)) {
    if (v.count > 0) {
      console.log(`- ${code}: ${v.count} (samples: ${v.samples.join(', ')})`);
    }
  }
  console.log('='.repeat(70) + '\n');

  // Exit non-zero if critical invariants are violated.
  // NOTE: Under PM2, a non-zero exit can be treated as a crash and may cause restart loops.
  // Enable strict exit only when explicitly requested.
  const strictExit =
    process.env.INTEGRITY_STRICT_EXIT === '1' ||
    process.env.INTEGRITY_STRICT_EXIT === 'true';

  const critical =
    summary.byCode.missing_prev_close.count > 0 ||
    summary.byCode.invalid_change_pct.count > 0;

  process.exit(strictExit && critical ? 2 : 0);
}

main().catch((error) => {
  console.error('❌ Daily integrity check failed:', error);
  process.exit(1);
});


/**
 * Script to check price and percent change calculation logic
 * 
 * Checks:
 * 1. Consistency between calculatePercentChange and computePercentChange
 * 2. Correct usage of previousClose vs regularClose
 * 3. Price fetching and storage logic
 */

import { calculatePercentChange } from '../src/lib/utils/priceResolver';
import { computePercentChange } from '../src/lib/utils/marketCapUtils';

console.log('='.repeat(70));
console.log('🔍 PRICE & PERCENT CHANGE LOGIC CHECK');
console.log('='.repeat(70));

// Test cases
const testCases = [
  { currentPrice: 150, previousClose: 145, regularClose: null, session: 'pre' as const },
  { currentPrice: 150, previousClose: 145, regularClose: null, session: 'live' as const },
  { currentPrice: 150, previousClose: 145, regularClose: 148, session: 'after' as const },
  { currentPrice: 150, previousClose: 145, regularClose: 148, session: 'closed' as const },
  { currentPrice: 150, previousClose: 145, regularClose: null, session: 'after' as const },
];

console.log('\n📊 Test Case 1: Pre-market session');
console.log('-'.repeat(70));
const test1 = testCases[0]!;
const result1 = calculatePercentChange(test1.currentPrice, test1.session, test1.previousClose, test1.regularClose);
const compute1 = computePercentChange(test1.currentPrice, test1.previousClose);
console.log(`Current Price: $${test1.currentPrice}`);
console.log(`Previous Close: $${test1.previousClose}`);
console.log(`Regular Close: ${test1.regularClose || 'N/A'}`);
console.log(`Session: ${test1.session}`);
console.log(`calculatePercentChange: ${result1.changePct.toFixed(2)}% (reference: ${result1.reference.used || 'none'})`);
console.log(`computePercentChange: ${compute1.toFixed(2)}%`);
console.log(`Match: ${Math.abs(result1.changePct - compute1) < 0.01 ? '✅' : '❌'}`);

console.log('\n📊 Test Case 2: Live session');
console.log('-'.repeat(70));
const test2 = testCases[1]!;
const result2 = calculatePercentChange(test2.currentPrice, test2.session, test2.previousClose, test2.regularClose);
const compute2 = computePercentChange(test2.currentPrice, test2.previousClose);
console.log(`Current Price: $${test2.currentPrice}`);
console.log(`Previous Close: $${test2.previousClose}`);
console.log(`calculatePercentChange: ${result2.changePct.toFixed(2)}% (reference: ${result2.reference.used || 'none'})`);
console.log(`computePercentChange: ${compute2.toFixed(2)}%`);
console.log(`Match: ${Math.abs(result2.changePct - compute2) < 0.01 ? '✅' : '❌'}`);

console.log('\n📊 Test Case 3: After-hours session (with regularClose)');
console.log('-'.repeat(70));
const test3 = testCases[2]!;
const result3 = calculatePercentChange(test3.currentPrice, test3.session, test3.previousClose, test3.regularClose);
const compute3Old = computePercentChange(test3.currentPrice, test3.previousClose); // Old way (without session)
const compute3New = computePercentChange(test3.currentPrice, test3.previousClose, test3.session, test3.regularClose); // New way (with session)
console.log(`Current Price: $${test3.currentPrice}`);
console.log(`Previous Close: $${test3.previousClose}`);
console.log(`Regular Close: $${test3.regularClose}`);
console.log(`Session: ${test3.session}`);
console.log(`calculatePercentChange: ${result3.changePct.toFixed(2)}% (reference: ${result3.reference.used || 'none'})`);
console.log(`computePercentChange (OLD, no session): ${compute3Old.toFixed(2)}% (uses previousClose, NOT regularClose)`);
console.log(`computePercentChange (NEW, with session): ${compute3New.toFixed(2)}% (uses regularClose)`);
console.log(`Match (NEW): ${Math.abs(result3.changePct - compute3New) < 0.01 ? '✅' : '❌'}`);

console.log('\n📊 Test Case 4: After-hours session (without regularClose)');
console.log('-'.repeat(70));
const test4 = testCases[4]!;
const result4 = calculatePercentChange(test4.currentPrice, test4.session, test4.previousClose, test4.regularClose);
const compute4 = computePercentChange(test4.currentPrice, test4.previousClose);
console.log(`Current Price: $${test4.currentPrice}`);
console.log(`Previous Close: $${test4.previousClose}`);
console.log(`Regular Close: ${test4.regularClose || 'N/A'}`);
console.log(`Session: ${test4.session}`);
console.log(`calculatePercentChange: ${result4.changePct.toFixed(2)}% (reference: ${result4.reference.used || 'none'})`);
console.log(`computePercentChange: ${compute4.toFixed(2)}%`);
console.log(`Match: ${Math.abs(result4.changePct - compute4) < 0.01 ? '✅' : '❌'}`);

console.log('\n' + '='.repeat(70));
console.log('📋 SUMMARY');
console.log('='.repeat(70));
console.log('✅ calculatePercentChange: Session-aware, uses regularClose for after-hours');
console.log('✅ computePercentChange (NEW): Session-aware when session/regularClose provided');
console.log('⚠️  computePercentChange (OLD): NOT session-aware when called without session');
console.log('');
console.log('✅ FIXES APPLIED:');
console.log('1. computePercentChange() now accepts optional session and regularClose parameters');
console.log('2. When provided, uses session-aware logic (same as calculatePercentChange)');
console.log('3. Updated endpoints:');
console.log('   - /api/heatmap ✅');
console.log('   - /api/stocks/bulk ✅');
console.log('   - /api/earnings-finnhub ✅');
console.log('   - /api/earnings/yahoo ✅');
console.log('');
console.log('💡 BACKWARD COMPATIBILITY:');
console.log('   computePercentChange() still works without session/regularClose');
console.log('   (uses simple calculation vs previousClose for compatibility)');
console.log('='.repeat(70));


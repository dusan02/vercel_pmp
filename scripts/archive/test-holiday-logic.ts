
import {
    isMarketHoliday,
    detectSession,
    getLastTradingDay,
    isMarketOpen
} from '../src/lib/utils/timeUtils';
import { nowET, getDateET, toET } from '../src/lib/utils/dateET';

console.log('Testing Holiday Logic for today (Feb 16, 2026)');

const now = new Date(); // Current system time (should be Feb 16)
const et = toET(now);
console.log('Current Time (Local):', now.toString());
console.log('Current Time (ET):', et);

const isHoliday = isMarketHoliday(now);
console.log('isMarketHoliday:', isHoliday);

const session = detectSession(now);
console.log('Session:', session);

const isOpen = isMarketOpen(now);
console.log('isMarketOpen:', isOpen);

console.log('Testing getLastTradingDay (potential loop check)...');
const start = Date.now();
const lastTradingDay = getLastTradingDay(now);
const end = Date.now();
console.log('getLastTradingDay:', getDateET(lastTradingDay));
console.log('Computation time:', end - start, 'ms');

if ((end - start) > 1000) {
    console.error('⚠️  getLastTradingDay took too long! Potential loop.');
} else {
    console.log('✅ Loop check passed.');
}

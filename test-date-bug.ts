import { getDateET, createETDate, toET } from './src/lib/utils/dateET.ts';
import { getTradingDay, getNextMarketOpen } from './src/lib/utils/timeUtils.ts';
import { getNextTradingDay } from './src/lib/utils/pricingStateMachine.ts';

function test() {
  const now = new Date('2026-07-29T16:30:00.000Z'); // simulated now during post-market
  console.log("Current time (simulated post-market):", now.toISOString());
  
  const calendarDateETStr = getDateET(now);
  const calendarDateET = createETDate(calendarDateETStr);
  const todayTradingDay = getTradingDay(calendarDateET);
  
  console.log("todayTradingDay:", todayTradingDay.toISOString());
  
  const nextTradingDay = getNextTradingDay(todayTradingDay);
  const nextTradingDateStr = getDateET(nextTradingDay);
  
  console.log("nextTradingDay calculated:", nextTradingDay.toISOString());
  console.log("nextTradingDateStr:", nextTradingDateStr);
  
  // What it should be if we passed now instead of todayTradingDay
  const nextTradingDayFromNow = getNextTradingDay(now);
  console.log("nextTradingDay calculated from now:", nextTradingDayFromNow.toISOString());
  console.log("nextTradingDateStr from now:", getDateET(nextTradingDayFromNow));
}

test();

/**
 * Closing Prices Management Utilities
 * Shared functions for resetting and refreshing closing prices
 */

import { prisma } from '@/lib/db/prisma';
import { getDateET, createETDate } from './dateET';
import { getLastTradingDay } from './timeUtils';

export interface RefreshClosingPricesResult {
  updatedCount: number;
  deletedToday: number;
  deletedLastTradingDay: number;
}

/**
 * Refresh closing prices in database
 * @param hardReset If true, also resets Ticker.latestPrevClose to null (use with caution)
 */
export async function refreshClosingPricesInDB(
  hardReset: boolean = false
): Promise<RefreshClosingPricesResult> {
  if (hardReset) {
    console.log('🔄 Hard reset: Resetting closing prices in database...');
  } else {
    console.log('🔄 Refreshing closing prices in database (refresh in place)...');
  }
  
  // Get today's trading day (ET) and yesterday's trading day
  const today = getDateET();
  const todayDate = createETDate(today);
  const todayTradingDay = getLastTradingDay(todayDate);
  const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
  
  // Delete DailyRef entries for todayTradingDay and yesterdayTradingDay (will be repopulated by bootstrap)
  // This is safe because we'll immediately repopulate them
  const deletedToday = await prisma.dailyRef.deleteMany({
    where: {
      date: todayTradingDay
    }
  });
  
  const deletedLastTradingDay = await prisma.dailyRef.deleteMany({
    where: {
      date: yesterdayTradingDay
    }
  });
  
  console.log(`✅ Deleted ${deletedToday.count} DailyRef entries for today`);
  console.log(`✅ Deleted ${deletedLastTradingDay.count} DailyRef entries for yesterday trading day`);
  
  let updatedCount = 0;
  
  // Hard reset: Reset Ticker.latestPrevClose to null (only if hardReset=true)
  if (hardReset) {
    const resetTickerResult = await prisma.ticker.updateMany({
      data: {
        latestPrevClose: null,
        latestPrevCloseDate: null,
        updatedAt: new Date()
      }
    });
    updatedCount = resetTickerResult.count;
    console.log(`✅ Hard reset: Reset latestPrevClose for ${updatedCount} tickers`);
  } else {
    // NOTE: We do NOT reset Ticker.latestPrevClose to null anymore
    // Bootstrap will update it with correct values, preserving existing correct values
    // This prevents "window of chaos" where worker calculates percentages with null references
  }
  
  return {
    updatedCount,
    deletedToday: deletedToday.count,
    deletedLastTradingDay: deletedLastTradingDay.count
  };
}

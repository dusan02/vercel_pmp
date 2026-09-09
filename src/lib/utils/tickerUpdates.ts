/**
 * Ticker Update Utilities
 * Functions for updating ticker data (sharesOutstanding, previousClose)
 */

import { prisma } from '@/lib/db/prisma';
import { getSharesOutstanding, getPreviousClose } from './marketCapUtils';
import { getLastTradingDay, getTradingDay } from './timeUtils';
import { getDateET, createETDate } from './dateET';

/**
 * Update sharesOutstanding for a ticker
 */
export async function updateTickerSharesOutstanding(ticker: string): Promise<boolean> {
  try {
    const shares = await getSharesOutstanding(ticker);
    if (shares > 0) {
      await prisma.ticker.upsert({
        where: { symbol: ticker },
        update: { sharesOutstanding: shares },
        create: {
          symbol: ticker,
          sharesOutstanding: shares,
        },
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to update sharesOutstanding for ${ticker}:`, error);
    return false;
  }
}

/**
 * Update previousClose for a ticker
 * IMPORTANT: date = actual trading day of the close, not "today"
 */
export async function updateTickerPreviousClose(ticker: string): Promise<boolean> {
  try {
    const prevClose = await getPreviousClose(ticker);
    if (prevClose > 0) {
      // PrevClose model: calendar-date key (ET) -> close(prevTradingDay)
      const calendarDateETStr = getDateET();
      const calendarDateET = createETDate(calendarDateETStr);
      const prevTradingDay = getLastTradingDay(getTradingDay(calendarDateET));

      // Use findFirst + create/update instead of upsert for compound unique constraint
      const existing = await prisma.dailyRef.findFirst({
        where: {
          symbol: ticker,
          date: calendarDateET,
        },
      });

      if (existing) {
        await prisma.dailyRef.update({
          where: { id: existing.id },
          data: { previousClose: prevClose },
        });
      } else {
        await prisma.dailyRef.create({
          data: {
            symbol: ticker,
            date: calendarDateET, // Calendar date (ET) for the session
            previousClose: prevClose,
          },
        });
      }

      // Denormalize to Ticker table for quick access
      await prisma.ticker.update({
        where: { symbol: ticker },
        data: {
          latestPrevClose: prevClose,
          latestPrevCloseDate: prevTradingDay, // Date of the close
        },
      });

      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to update previousClose for ${ticker}:`, error);
    return false;
  }
}

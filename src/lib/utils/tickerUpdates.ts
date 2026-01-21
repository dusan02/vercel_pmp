/**
 * Ticker Update Utilities
 * Functions for updating ticker data (sharesOutstanding, previousClose)
 */

import { prisma } from '@/lib/db/prisma';
import { getSharesOutstanding, getPreviousClose } from './marketCapUtils';
import { getLastTradingDay } from './timeUtils';

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
      // Get the last trading day (the day when this close actually happened)
      const lastTradingDay = getLastTradingDay();

      // Use findFirst + create/update instead of upsert for compound unique constraint
      const existing = await prisma.dailyRef.findFirst({
        where: {
          symbol: ticker,
          date: lastTradingDay,
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
            date: lastTradingDay, // Date of the actual trading day, not "today"
            previousClose: prevClose,
          },
        });
      }

      // Denormalize to Ticker table for quick access
      await prisma.ticker.update({
        where: { symbol: ticker },
        data: {
          latestPrevClose: prevClose,
          latestPrevCloseDate: lastTradingDay,
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

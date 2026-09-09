/**
 * Price Verification Utilities
 * Functions for verifying price consistency across DB, Redis, and Polygon API
 */

import { prisma } from '@/lib/db/prisma';
import { getPrevClose } from '@/lib/redis/operations';
import { getDateET, createETDate } from './dateET';
import { getLastTradingDay } from './timeUtils';
import { fetchPolygonSnapshot, fetchPolygonPreviousClose } from './polygonApiHelpers';

export interface PriceVerificationResult {
  checked: number;
  issues: number;
  details: Array<{ ticker: string; issues: string[] }>;
}

/**
 * Verify price consistency between DB, Redis, and Polygon API
 * Checks for mismatches and logs issues (includes current price check)
 */
export async function verifyPriceConsistency(
  tickers: string[],
  apiKey: string
): Promise<PriceVerificationResult> {
  const today = getDateET();
  const todayTradingDay = getLastTradingDay(createETDate(today));
  const todayTradingDateStr = getDateET(todayTradingDay);
  const yesterdayTradingDay = getLastTradingDay(todayTradingDay);
  const yesterdayDateStr = getDateET(yesterdayTradingDay);

  let checked = 0;
  let issues = 0;
  const details: Array<{ ticker: string; issues: string[] }> = [];

  // Sample up to 50 tickers for verification (to avoid rate limits)
  const tickersToCheck = tickers.slice(0, 50);

  for (const ticker of tickersToCheck) {
    try {
      const tickerIssues: string[] = [];

      // 1. Get data from DB
      const dbTicker = await prisma.ticker.findUnique({
        where: { symbol: ticker },
        select: {
          lastPrice: true,
          latestPrevClose: true,
          latestPrevCloseDate: true,
          lastChangePct: true,
        }
      });

      // 2. Get data from Redis
      const redisPrevCloseMap = await getPrevClose(todayTradingDateStr, [ticker]);
      const redisPreviousClose = redisPrevCloseMap.get(ticker) || null;

      // 3. Get current price from Polygon API
      const polygonSnapshot = await fetchPolygonSnapshot(ticker, apiKey);
      const polygonCurrentPrice = polygonSnapshot?.lastTrade?.p || 
                                   polygonSnapshot?.min?.c || 
                                   polygonSnapshot?.day?.c || 
                                   polygonSnapshot?.prevDay?.c ||
                                   null;

      // 4. Get previous close from Polygon API
      const polygonPrevCloseData = await fetchPolygonPreviousClose(ticker, apiKey, yesterdayDateStr);
      const polygonPreviousClose = polygonPrevCloseData.close;
      const polygonTradingDay = polygonPrevCloseData.tradingDay;

      // 5. Check for issues - Current Price
      if (!dbTicker?.lastPrice || dbTicker.lastPrice <= 0) {
        tickerIssues.push('DB price missing or zero');
      }

      if (!polygonCurrentPrice || polygonCurrentPrice <= 0) {
        tickerIssues.push('Polygon current price missing or zero');
      }

      // Check if current prices match (within 0.1% tolerance)
      if (dbTicker?.lastPrice && polygonCurrentPrice) {
        const diff = Math.abs(dbTicker.lastPrice - polygonCurrentPrice);
        const diffPercent = (diff / polygonCurrentPrice) * 100;
        if (diffPercent > 0.1) {
          tickerIssues.push(`Price mismatch: DB=$${dbTicker.lastPrice.toFixed(2)}, Polygon=$${polygonCurrentPrice.toFixed(2)} (diff: ${diffPercent.toFixed(2)}%)`);
        }
      }

      // 6. Check for issues - Previous Close
      if (!dbTicker?.latestPrevClose || dbTicker.latestPrevClose <= 0) {
        tickerIssues.push('DB previousClose missing or zero');
      }

      if (!redisPreviousClose || redisPreviousClose <= 0) {
        tickerIssues.push('Redis previousClose missing or zero');
      }

      if (!polygonPreviousClose || polygonPreviousClose <= 0) {
        tickerIssues.push('Polygon previousClose missing or zero');
      }

      // Check if previousClose prices match (within 0.1% tolerance)
      if (dbTicker?.latestPrevClose && polygonPreviousClose) {
        const diff = Math.abs(dbTicker.latestPrevClose - polygonPreviousClose);
        const diffPercent = (diff / polygonPreviousClose) * 100;
        if (diffPercent > 0.1) {
          tickerIssues.push(`PreviousClose mismatch: DB=$${dbTicker.latestPrevClose.toFixed(2)}, Polygon=$${polygonPreviousClose.toFixed(2)} (diff: ${diffPercent.toFixed(2)}%)`);
        }
      }

      // 7. Check if trading day matches
      if (dbTicker?.latestPrevCloseDate && polygonTradingDay) {
        const dbTradingDayStr = getDateET(dbTicker.latestPrevCloseDate);
        if (dbTradingDayStr !== polygonTradingDay) {
          tickerIssues.push(`Trading day mismatch: DB=${dbTradingDayStr}, Polygon=${polygonTradingDay}`);
        }
      }

      // 8. Check percent change consistency (if both available)
      if (dbTicker && dbTicker.lastChangePct !== null && dbTicker.lastPrice && polygonPreviousClose) {
        const calculatedPct = ((dbTicker.lastPrice / polygonPreviousClose) - 1) * 100;
        const pctDiff = Math.abs(calculatedPct - dbTicker.lastChangePct);
        if (pctDiff > 0.01) {
          tickerIssues.push(`% Change mismatch: DB=${dbTicker.lastChangePct.toFixed(2)}%, Calculated=${calculatedPct.toFixed(2)}%`);
        }
      }

      if (tickerIssues.length > 0) {
        issues++;
        details.push({ ticker, issues: tickerIssues });
      }

      checked++;

      // Rate limiting
      if (checked < tickersToCheck.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Error verifying ${ticker}:`, error);
      checked++;
    }
  }

  // Log summary
  if (issues > 0) {
    console.warn(`⚠️  Found ${issues} tickers with price consistency issues:`);
    details.forEach(({ ticker, issues: tickerIssues }) => {
      console.warn(`  ${ticker}: ${tickerIssues.join('; ')}`);
    });
  }

  return { checked, issues, details };
}

/**
 * Cron job for checking pre-market price movements
 * 
 * Monitors pre-market prices and triggers price verification
 * if movement exceeds ±1% threshold
 * 
 * Should run during pre-market hours (e.g., 08:00 ET)
 * 
 * Usage: POST /api/cron/check-premarket-movements
 * Authorization: Bearer token with CRON_SECRET_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { detectSession, getLastTradingDay } from '@/lib/utils/timeUtils';
import { getDateET, createETDate, nowET } from '@/lib/utils/dateET';
import { calculatePercentChange } from '@/lib/utils/priceResolver';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { getPrevClose } from '@/lib/redis/operations';
import { fetchPolygonSnapshot, fetchPolygonPreviousClose } from '@/lib/utils/polygonApiHelpers';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createGetEndpointWrapper } from '@/lib/utils/cronErrorHandler';

const MOVEMENT_THRESHOLD = 1.0; // ±1% threshold
const MAX_TICKERS_TO_CHECK = 100; // Limit to avoid rate limits

interface MovementCheckResult {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  percentChange: number;
  needsVerification: boolean;
  session: string;
}

/**
 * Check single ticker for large pre-market movement
 */
async function checkTickerMovement(
  ticker: string,
  apiKey: string,
  todayTradingDateStr: string
): Promise<MovementCheckResult | null> {
  try {
    const etNow = nowET();
    const session = detectSession(etNow);

    // Only check during pre-market hours
    if (session !== 'pre') {
      return null;
    }

    // 1. Get current price from DB
    const dbTicker = await prisma.ticker.findUnique({
      where: { symbol: ticker },
      select: {
        lastPrice: true,
        latestPrevClose: true,
        lastPriceUpdated: true,
      }
    });

    if (!dbTicker?.lastPrice || dbTicker.lastPrice <= 0) {
      return null; // Skip tickers without price
    }

    if (!dbTicker.latestPrevClose || dbTicker.latestPrevClose <= 0) {
      return null; // Skip tickers without previousClose
    }

    // 2. Get previous close from Redis (more reliable)
    const redisPrevCloseMap = await getPrevClose(todayTradingDateStr, [ticker]);
    const redisPreviousClose = redisPrevCloseMap.get(ticker) || dbTicker.latestPrevClose;

    // 3. Calculate percent change
    const percentChangeResult = calculatePercentChange(
      dbTicker.lastPrice,
      session,
      redisPreviousClose > 0 ? redisPreviousClose : null,
      null // regularClose not needed for pre-market
    );

    const percentChange = percentChangeResult.changePct;

    // 4. Check if movement exceeds threshold
    const needsVerification = Math.abs(percentChange) >= MOVEMENT_THRESHOLD;

    return {
      ticker,
      currentPrice: dbTicker.lastPrice,
      previousClose: redisPreviousClose,
      percentChange,
      needsVerification,
      session
    };
  } catch (error) {
    console.error(`Error checking movement for ${ticker}:`, error);
    return null;
  }
}

/**
 * Verify price for ticker with large movement
 */
async function verifyTickerPrice(
  ticker: string,
  apiKey: string,
  todayTradingDateStr: string
): Promise<{ verified: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // 1. Get data from DB
    const dbTicker = await prisma.ticker.findUnique({
      where: { symbol: ticker },
      select: {
        lastPrice: true,
        latestPrevClose: true,
        latestPrevCloseDate: true,
      }
    });

    // 2. Get data from Redis
    const redisPrevCloseMap = await getPrevClose(todayTradingDateStr, [ticker]);
    const redisPreviousClose = redisPrevCloseMap.get(ticker) || null;

    // 3. Get data from Polygon API
    const polygonSnapshot = await fetchPolygonSnapshot(ticker, apiKey);
    const polygonCurrentPrice = polygonSnapshot?.lastTrade?.p || 
                                 polygonSnapshot?.min?.c || 
                                 polygonSnapshot?.day?.c || 
                                 polygonSnapshot?.prevDay?.c ||
                                 null;

    // 4. Get previous close from Polygon
    const yesterdayTradingDay = getLastTradingDay(createETDate(todayTradingDateStr));
    const yesterdayDateStr = getDateET(yesterdayTradingDay);
    const polygonPrevCloseData = await fetchPolygonPreviousClose(ticker, apiKey, yesterdayDateStr);
    const polygonPreviousClose = polygonPrevCloseData.close;

    // 5. Check for issues
    if (!dbTicker?.latestPrevClose || dbTicker.latestPrevClose <= 0) {
      issues.push('DB previousClose missing or zero');
    }

    if (!redisPreviousClose || redisPreviousClose <= 0) {
      issues.push('Redis previousClose missing or zero');
    }

    if (!polygonCurrentPrice || polygonCurrentPrice <= 0) {
      issues.push('Polygon current price missing or zero');
    }

    if (!polygonPreviousClose || polygonPreviousClose <= 0) {
      issues.push('Polygon previousClose missing or zero');
    }

    // Check if prices match (within 0.1% tolerance)
    if (dbTicker?.lastPrice && polygonCurrentPrice) {
      const diff = Math.abs(dbTicker.lastPrice - polygonCurrentPrice);
      const diffPercent = (diff / polygonCurrentPrice) * 100;
      if (diffPercent > 0.1) {
        issues.push(`Price mismatch: DB=$${dbTicker.lastPrice.toFixed(2)}, Polygon=$${polygonCurrentPrice.toFixed(2)} (diff: ${diffPercent.toFixed(2)}%)`);
      }
    }

    // Check if previousClose matches (within 0.1% tolerance)
    if (dbTicker?.latestPrevClose && polygonPreviousClose) {
      const diff = Math.abs(dbTicker.latestPrevClose - polygonPreviousClose);
      const diffPercent = (diff / polygonPreviousClose) * 100;
      if (diffPercent > 0.1) {
        issues.push(`PreviousClose mismatch: DB=$${dbTicker.latestPrevClose.toFixed(2)}, Polygon=$${polygonPreviousClose.toFixed(2)} (diff: ${diffPercent.toFixed(2)}%)`);
      }
    }

    return {
      verified: issues.length === 0,
      issues
    };
  } catch (error) {
    console.error(`Error verifying price for ${ticker}:`, error);
    return {
      verified: false,
      issues: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}


export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify authorization
    const authError = verifyCronAuth(request);
    if (authError) {
      return authError;
    }

    const etNow = nowET();
    const session = detectSession(etNow);

    // Only run during pre-market hours
    if (session !== 'pre') {
      return NextResponse.json({
        success: true,
        message: `Skipping - not in pre-market session (current session: ${session})`,
        results: {
          checked: 0,
          largeMovements: 0,
          verified: 0,
          issues: []
        },
        timestamp: new Date().toISOString(),
      });
    }

    console.log('🔍 Starting pre-market movement check...');

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured',
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Get all tracked tickers
    const allTickers = await getAllTrackedTickers();
    const tickersToCheck = allTickers.slice(0, MAX_TICKERS_TO_CHECK);
    
    console.log(`📊 Checking ${tickersToCheck.length} tickers for pre-market movements > ±${MOVEMENT_THRESHOLD}%...`);

    const today = getDateET(etNow);
    const todayTradingDay = getLastTradingDay(createETDate(today));
    const todayTradingDateStr = getDateET(todayTradingDay);

    const movementResults: MovementCheckResult[] = [];
    const verificationResults: Array<{ ticker: string; verified: boolean; issues: string[] }> = [];

    // Check movements for all tickers
    for (const ticker of tickersToCheck) {
      const result = await checkTickerMovement(ticker, apiKey, todayTradingDateStr);
      if (result) {
        movementResults.push(result);
        
        // If movement exceeds threshold, verify price
        if (result.needsVerification) {
          console.log(`⚠️  Large movement detected for ${ticker}: ${result.percentChange.toFixed(2)}% - verifying price...`);
          const verification = await verifyTickerPrice(ticker, apiKey, todayTradingDateStr);
          verificationResults.push({
            ticker,
            ...verification
          });

          if (verification.issues.length > 0) {
            console.warn(`❌ ${ticker} verification issues:`, verification.issues);
          } else {
            console.log(`✅ ${ticker} price verified OK`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Rate limiting between tickers
      if (tickersToCheck.indexOf(ticker) < tickersToCheck.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const largeMovements = movementResults.filter(r => r.needsVerification);
    const verified = verificationResults.filter(r => r.verified);
    const withIssues = verificationResults.filter(r => !r.verified);

    const duration = Date.now() - startTime;

    console.log(`✅ Pre-market movement check complete:`);
    console.log(`   - Checked: ${movementResults.length} tickers`);
    console.log(`   - Large movements (>±${MOVEMENT_THRESHOLD}%): ${largeMovements.length}`);
    console.log(`   - Verified OK: ${verified.length}`);
    console.log(`   - With issues: ${withIssues.length}`);

    return NextResponse.json({
      success: true,
      message: 'Pre-market movement check completed',
      results: {
        checked: movementResults.length,
        largeMovements: largeMovements.length,
        verified: verified.length,
        withIssues: withIssues.length,
        movements: largeMovements.map(m => ({
          ticker: m.ticker,
          percentChange: m.percentChange,
          currentPrice: m.currentPrice,
          previousClose: m.previousClose
        })),
        issues: withIssues.map(v => ({
          ticker: v.ticker,
          issues: v.issues
        }))
      },
      summary: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        threshold: `±${MOVEMENT_THRESHOLD}%`
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return handleCronError(error, 'pre-market movement check');
  }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) {
    return authError;
  }
  return createGetEndpointWrapper(request, POST);
}

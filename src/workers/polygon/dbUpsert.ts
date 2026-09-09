/**
 * Database upsert for ingest batch.
 *
 * Handles:
 * - Ticker upsert (price, changePct, marketCap, volume, zScore, rvol)
 * - SessionPrice upsert (only during static lock or forced)
 * - DailyRef upsert (only during static lock or forced)
 * - Movers archive (significant zScore + rvol events)
 * - Metadata enrichment (sector, sharesOutstanding from Polygon)
 * - Staleness prevention (skip older timestamps)
 * - Z-score and RVOL calculation
 */

import { redisClient } from '@/lib/redis';
import { nowET, getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';
import { getPricingState, canOverwritePrice, PriceState } from '@/lib/utils/pricingStateMachine';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { prisma } from '@/lib/db/prisma';
import type { MarketSession } from '@/lib/types';
import { calculateExpectedVolume } from './snapshotFetcher';
import type { NormalizedSnapshot } from './snapshotNormalizer';
import { computeMarketCap, computeMarketCapDiff } from '@/lib/utils/marketCapUtils';

export async function upsertToDB(
  symbol: string,
  session: MarketSession,
  normalized: NormalizedSnapshot | null,
  previousClose: number | null,
  shares: number,
  isStaticUpdateLocked: boolean = false,
  lastChangePctFromCache: number | null | undefined = undefined,
  stats?: { avgVolume20d: number | null; avgReturn20d: number | null; stdDevReturn20d: number | null },
  force: boolean = false
): Promise<{ success: boolean; effectiveChangePct: number; effectivePrice: number; marketCap: number; marketCapDiff: number; zScore: number; rvol: number }> {
  if (!normalized) return { success: false, effectiveChangePct: 0, effectivePrice: 0, marketCap: 0, marketCapDiff: 0, zScore: 0, rvol: 0 };

  try {
    const dateET = getDateET();
    const today = createETDate(dateET);
    const lastTradingDay = getLastTradingDay();

    // 1. Fetch existing ticker
    const existingTicker = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        lastPrice: true,
        lastPriceUpdated: true,
        lastChangePct: true,
        latestPrevClose: true,
        latestPrevCloseDate: true,
        avgVolume20d: true,
        avgReturn20d: true,
        stdDevReturn20d: true,
        moversCategory: true,
        moversReason: true,
        sector: true,
        industry: true,
        sharesOutstanding: true
      }
    });

    // 1.5. Metadata Enrichment & De-listing Check
    const needsMetadata = !existingTicker
      || existingTicker.sector === 'Unknown'
      || existingTicker.sector === 'Other'
      || !existingTicker.sector
      || existingTicker.sharesOutstanding === 1000000000;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metadataUpdate: any = {};
    if (needsMetadata) {
      try {
        const polygon = getPolygonClient();
        if (polygon) {
          const details = await polygon.fetchTickerDetails(symbol);
          if (details) {
            if (details.active === false) {
              console.warn(`🗑️  [Enrichment] ${symbol} is INACTIVE. Cleaning up universe.`);
              if (redisClient && redisClient.isOpen) {
                await redisClient.sRem('universe:sp500', symbol);
                await redisClient.sRem('universe:pmp', symbol);
              }
              return { success: false, effectiveChangePct: 0, effectivePrice: 0, marketCap: 0, marketCapDiff: 0, zScore: 0, rvol: 0 };
            }

            metadataUpdate = {
              name: details.name || undefined,
              sharesOutstanding: details.weighted_shares_outstanding || details.share_class_shares_outstanding || undefined,
            };
          }
        }
      } catch (err) {
        console.warn(`⚠️  [Enrichment] Failed for ${symbol}:`, err);
      }
    }

    // 2. Calculate Z-score and RVOL
    let zScore = 0;
    let rvol = 0;

    const avgVolume = stats?.avgVolume20d ?? existingTicker?.avgVolume20d;
    const avgReturn = stats?.avgReturn20d ?? existingTicker?.avgReturn20d;
    const stdDev = stats?.stdDevReturn20d ?? existingTicker?.stdDevReturn20d;

    if (avgVolume && avgVolume > 0 && normalized.volume > 0) {
      const now = nowET();
      const timeStr = `${String(toET(now).hour).padStart(2, '0')}:${String(toET(now).minute).padStart(2, '0')}`;

      try {
        const expectedVolume = await calculateExpectedVolume(symbol, timeStr, avgVolume);
        rvol = normalized.volume / (expectedVolume || avgVolume);

        const stalenessLimitMs = 5 * 60 * 1000;
        const isHalted = (now.getTime() - normalized.timestamp.getTime()) > stalenessLimitMs;
        if (isHalted) {
          console.log(`⚠️  [HaltDetection] ${symbol} might be halted (Staleness: ${Math.round((now.getTime() - normalized.timestamp.getTime()) / 60000)}m)`);
        }
      } catch {
        rvol = normalized.volume / avgVolume;
      }
    }

    if (stdDev && stdDev > 0) {
      const effectiveChangePctForZ =
        (normalized.changePct !== 0)
          ? normalized.changePct
          : (lastChangePctFromCache ?? existingTicker?.lastChangePct ?? 0);

      const priceRatio = (effectiveChangePctForZ / 100) + 1;

      if (priceRatio > 0) {
        const logReturn = Math.log(priceRatio);
        const avgLogReturn = avgReturn ? Math.log((avgReturn / 100) + 1) : 0;
        zScore = (logReturn - avgLogReturn) / (stdDev / 100);
      }
    } else {
      const effectiveChangePct =
        (normalized.changePct !== 0)
          ? normalized.changePct
          : (lastChangePctFromCache ?? existingTicker?.lastChangePct ?? 0);

      if (Math.abs(effectiveChangePct) >= 3.0) {
        const TYPICAL_DAILY_STDDEV = 1.5;
        zScore = effectiveChangePct / TYPICAL_DAILY_STDDEV;
        console.log(`📐 [Z-fallback] ${symbol}: no stdDev, approximating Z=${zScore.toFixed(2)} from changePct=${effectiveChangePct.toFixed(2)}%`);
      }
    }

    // 3. Staleness Check
    let skipPriceUpdate = false;

    if (!force && existingTicker?.lastPriceUpdated && normalized.timestamp < existingTicker.lastPriceUpdated) {
      if (!isStaticUpdateLocked) {
        console.log(`⏭️ Skipping price update for ${symbol} - incoming data is older (${normalized.timestamp.toISOString()} < ${existingTicker.lastPriceUpdated.toISOString()})`);
      }
      skipPriceUpdate = true;
    }

    // 3.5. Resolve Change Pct
    let changePctToUse = normalized.changePct;
    const hasValidReference = normalized.reference && normalized.reference.used !== null;
    const isPriceFromFallback = normalized.source === 'regularClose' && normalized.isStale;

    if (!hasValidReference || isPriceFromFallback) {
      if (lastChangePctFromCache !== undefined && lastChangePctFromCache !== null) {
        changePctToUse = lastChangePctFromCache;
      } else if (existingTicker?.lastChangePct !== null && existingTicker?.lastChangePct !== undefined) {
        changePctToUse = existingTicker.lastChangePct;
      }
    }

    // When skipping price update (incoming data is older than last DB price), use
    // existing lastPrice (newer than normalized.price) and recompute changePct from
    // current previousClose so Redis cache stays consistent.
    const effectivePrice = (skipPriceUpdate && existingTicker?.lastPrice && existingTicker.lastPrice > 0)
      ? existingTicker.lastPrice
      : normalized.price;

    if (skipPriceUpdate && effectivePrice && previousClose) {
      const recomputedPct = ((effectivePrice / previousClose) - 1) * 100;
      if (Math.abs(recomputedPct) <= 1000) {
        changePctToUse = recomputedPct;
      }
    }

    const marketCap = computeMarketCap(effectivePrice, shares);
    const marketCapDiff = previousClose && previousClose > 0
      ? computeMarketCapDiff(effectivePrice, previousClose, shares)
      : 0;

    // 4. Skip path: stale data
    if (skipPriceUpdate) {
      const skipPrevCloseIsNewer = existingTicker?.latestPrevCloseDate
        && lastTradingDay.getTime() < existingTicker.latestPrevCloseDate.getTime();
      if (previousClose && existingTicker && !skipPrevCloseIsNewer
        && (!existingTicker.latestPrevClose || previousClose !== existingTicker.latestPrevClose)) {
        await prisma.ticker.upsert({
          where: { symbol },
          update: {
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date()
          },
          create: {
            symbol,
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay,
            updatedAt: new Date(),
            lastPrice: 0,
            lastChangePct: 0,
            lastMarketCap: 0,
            lastMarketCapDiff: 0,
            lastVolume: 0,
            sector: 'Unknown',
            industry: 'Unknown'
          }
        });
      }

      return { success: true, effectiveChangePct: changePctToUse, effectivePrice, marketCap, marketCapDiff, zScore, rvol };
    }

    // Guard latestPrevClose from being overwritten with stale data
    const shouldUpdatePrevClose = previousClose && (() => {
      if (!existingTicker?.latestPrevCloseDate) return true;
      return lastTradingDay.getTime() >= existingTicker.latestPrevCloseDate.getTime();
    })();

    // WEEKEND_FROZEN: skip Ticker price update but still write SessionPrice/DailyRef
    const pricingStateNow = getPricingState(nowET());
    const isWeekendFrozen = pricingStateNow.state === PriceState.WEEKEND_FROZEN && !force;

    // 4. Ticker upsert (skip on weekend frozen — keep Friday's close)
    if (!isWeekendFrozen) {
      await prisma.ticker.upsert({
        where: { symbol },
        update: {
          updatedAt: new Date(),
          lastPrice: normalized.price,
          lastChangePct: changePctToUse,
          lastMarketCap: marketCap,
          lastMarketCapDiff: marketCapDiff,
          lastPriceUpdated: normalized.timestamp,
          lastVolume: normalized.volume,
          ...(shouldUpdatePrevClose ? {
            latestPrevClose: previousClose,
            latestPrevCloseDate: lastTradingDay
          } : {}),
          latestMoversZScore: zScore,
          latestMoversRVOL: rvol,
          ...metadataUpdate
        },
        create: {
          symbol,
          updatedAt: new Date(),
          lastPrice: normalized.price,
          lastChangePct: changePctToUse,
          lastMarketCap: marketCap,
          lastMarketCapDiff: marketCapDiff,
          lastPriceUpdated: normalized.timestamp,
          lastVolume: normalized.volume,
          latestPrevClose: previousClose || 0,
          latestPrevCloseDate: previousClose ? lastTradingDay : null,
          latestMoversZScore: zScore,
          latestMoversRVOL: rvol,
          sector: 'Unknown',
          industry: 'Unknown',
          ...metadataUpdate
        }
      });
    }

    // 5. SessionPrice upsert (always — canOverwritePrice guards stale data)
    {
      const existingSession = await prisma.sessionPrice.findUnique({
        where: { symbol_date_session: { symbol, date: today, session } }
      });

      const sessionCanOverwrite = existingSession && existingSession.lastPrice && existingSession.lastPrice > 0
        ? canOverwritePrice(
          pricingStateNow,
          { price: existingSession.lastPrice, timestamp: existingSession.lastTs, session: existingSession.session },
          { price: normalized.price, timestamp: normalized.timestamp }
        )
        : true;

      if (sessionCanOverwrite && (!existingSession || normalized.timestamp >= existingSession.lastTs)) {
        await prisma.sessionPrice.upsert({
          where: { symbol_date_session: { symbol, date: today, session } },
          update: {
            lastPrice: normalized.price,
            lastTs: normalized.timestamp,
            changePct: changePctToUse,
            source: normalized.quality,
            quality: normalized.quality,
            zScore,
            rvol,
            updatedAt: new Date()
          },
          create: {
            symbol, date: today, session,
            lastPrice: normalized.price,
            lastTs: normalized.timestamp,
            changePct: changePctToUse,
            source: normalized.quality,
            quality: normalized.quality,
            zScore,
            rvol
          }
        });
      }
    }

    // 6. DailyRef upsert (always when previousClose is available)
    if (previousClose) {
      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol, date: today } },
        update: { previousClose, updatedAt: new Date() },
        create: { symbol, date: today, previousClose }
      });
    }

    // 7. Movers Archive
    const archiveThresholdZ = 2.0;
    const archiveThresholdRVOL = 1.5;

    if (Math.abs(zScore) >= archiveThresholdZ && rvol >= archiveThresholdRVOL) {
      try {
        const existingEvent = await prisma.moverEvent.findFirst({
          where: { symbol, date: today }
        });

        if (!existingEvent) {
          const tickerData = await prisma.ticker.findUnique({
            where: { symbol },
            select: { moversCategory: true, moversReason: true }
          });

          await prisma.moverEvent.create({
            data: {
              symbol,
              date: today,
              priceAtEvent: normalized.price,
              zScore,
              rvol,
              changePct: changePctToUse,
              category: tickerData?.moversCategory ?? null,
              reason: tickerData?.moversReason ?? null,
              timestamp: normalized.timestamp
            }
          });
          console.log(`📜 [MoversArchive] Archived event for ${symbol} (zScore: ${zScore.toFixed(2)}, rvol: ${rvol.toFixed(2)})`);
        }
      } catch (archiveError) {
        console.warn(`⚠️ Failed to archive MoverEvent for ${symbol}:`, archiveError);
      }
    }

  return { success: true, effectiveChangePct: changePctToUse, effectivePrice, marketCap, marketCapDiff, zScore, rvol };
  } catch (error) {
    console.error(`Error upserting ${symbol} to DB:`, error);
    return { success: false, effectiveChangePct: normalized ? normalized.changePct : 0, effectivePrice: normalized ? normalized.price : 0, marketCap: 0, marketCapDiff: 0, zScore: 0, rvol: 0 };
  }
}

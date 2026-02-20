import { prisma } from '@/lib/db/prisma';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, getSharesOutstanding } from '@/lib/utils/marketCapUtils';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET, getDateET, createETDate } from '@/lib/utils/dateET';
import { getPricingState } from '@/lib/utils/pricingStateMachine';
import { calculatePercentChange } from '@/lib/utils/priceResolver';

import { StockData } from '@/lib/types';
import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';

interface StockServiceResult {
  data: StockData[];
  errors: string[];
}

/**
 * Main entry point for stock data - SQL-first implementation using Ticker table
 */
export async function getStocksData(
  tickers: string[],
  project: string = 'pmp'
): Promise<StockServiceResult> {
  console.log(`🔍 getStocksData CALLED with tickers=${tickers.join(',')}, project=${project}`);
  const result = await getStocksList({ tickers });
  console.log(`🔍 getStocksData RETURNING ${result.data.length} stocks, ${result.errors.length} errors`);
  return result;
}

/**
 * SQL-first efficient fetching for pagination and sorting
 */
export async function getStocksList(options: {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  tickers?: string[];
}): Promise<StockServiceResult> {
  const { limit = 50, offset = 0, sort = 'marketCapDiff', order = 'desc', tickers } = options;
  console.log(`🔍 getStocksList CALLED with tickers=${tickers?.join(',') || 'ALL'}, limit=${limit}, offset=${offset}, sort=${sort}`);

  // Map sort keys to DB columns
  const sortMapping: Record<string, string> = {
    marketCap: 'lastMarketCap',
    marketCapDiff: 'lastMarketCapDiff',
    percentChange: 'lastChangePct',
    currentPrice: 'lastPrice',
    ticker: 'symbol'
  };

  const dbSortColumn = sortMapping[sort] || 'lastMarketCapDiff';

  try {
    const etNow = nowET();
    const session = detectSession(etNow);
    const pricingState = getPricingState(etNow);

    // IMPORTANT: For "All stocks" list (no explicit tickers), exclude rows with no price.
    // These are usually tickers that Polygon doesn't support / haven't been ingested yet and show up as $0.00 in UI.
    const where = tickers && tickers.length > 0
      ? { symbol: { in: tickers } }
      : { lastPrice: { gt: 0 } };

    // Only apply limit if no specific tickers are requested
    // When tickers are specified, return all requested tickers (respecting the ticker list, not the limit)
    const effectiveLimit = (tickers && tickers.length > 0)
      ? undefined  // No limit when specific tickers are requested
      : (limit && limit > 0 ? limit : undefined);  // Apply limit only when fetching all tickers

    // Only apply offset when fetching all tickers (not when specific tickers are requested)
    const effectiveOffset = (tickers && tickers.length > 0) ? undefined : offset;

    // Guard log: explicit tickers mode ignores offset/limit
    if (tickers && tickers.length > 0 && (offset !== 0 || (limit && limit > 0))) {
      console.log(`🔍 Explicit tickers mode: ignoring offset=${offset} and limit=${limit}, returning all ${tickers.length} requested tickers`);
    }

    const stocks = await prisma.ticker.findMany({
      where,
      ...(effectiveLimit ? { take: effectiveLimit } : {}),
      ...(effectiveOffset !== undefined ? { skip: effectiveOffset } : {}),
      orderBy: {
        [dbSortColumn]: order
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        logoUrl: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
        latestPrevClose: true,
        updatedAt: true,
        lastPriceUpdated: true,
        sharesOutstanding: true // Required for dynamic marketCapDiff calculation
      }
    });

    const symbols = stocks.map(s => s.symbol);

    // Prefer freshest price source (SessionPrice vs Ticker) using timestamps.
    // This fixes cases where Portfolio shows very wrong intraday prices (URI/PRU etc).
    const bestPriceBySymbol = new Map<string, { price: number; ts: Date; source: 'ticker' | 'session' }>();
    for (const s of stocks) {
      const baseTs = s.lastPriceUpdated ?? s.updatedAt;
      bestPriceBySymbol.set(s.symbol, { price: s.lastPrice || 0, ts: baseTs, source: 'ticker' });
    }

    try {
      const dateET = getDateET(etNow);
      const today = createETDate(dateET);
      const lookback = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000); // last ~48h (DST-safe enough for our use)

      const sessionPrices = await prisma.sessionPrice.findMany({
        where: {
          symbol: { in: symbols },
          date: { gte: lookback, lte: today }
        },
        orderBy: { lastTs: 'desc' },
        select: { symbol: true, lastPrice: true, lastTs: true }
      });

      // Keep newest SessionPrice per symbol
      const latestSpBySymbol = new Map<string, { price: number; ts: Date }>();
      for (const sp of sessionPrices) {
        if (!latestSpBySymbol.has(sp.symbol)) {
          latestSpBySymbol.set(sp.symbol, { price: sp.lastPrice, ts: sp.lastTs });
        }
      }

      // Apply tie-break: Prefer SessionPrice only if it's significantly newer (at least 1 minute)
      // This prevents using stale SessionPrice that has same timestamp but older price
      // If SessionPrice is older or same age, prefer Ticker.lastPrice (which is updated more frequently)
      const STALE_THRESHOLD_MS = 60 * 1000; // 1 minute
      for (const [symbol, sp] of latestSpBySymbol.entries()) {
        const existing = bestPriceBySymbol.get(symbol);
        if (existing) {
          const spIsNewer = sp.ts.getTime() > existing.ts.getTime() + STALE_THRESHOLD_MS;

          // Only use SessionPrice if it's significantly newer (at least 1 minute)
          // Otherwise prefer Ticker.lastPrice (more reliable, updated by worker)
          if (spIsNewer) {
            bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts, source: 'session' });
          }
          // If SessionPrice is same age or older, keep Ticker.lastPrice (existing)
        } else {
          // No existing price, use SessionPrice
          bestPriceBySymbol.set(symbol, { price: sp.price, ts: sp.ts, source: 'session' });
        }
      }
    } catch (e) {
      // Non-fatal: fall back to Ticker.lastPrice
    }

    // Quick lookup for current price (used for best-effort shares estimation from Polygon market_cap)
    const priceBySymbol = new Map<string, number>();
    bestPriceBySymbol.forEach((v, k) => {
      priceBySymbol.set(k, v.price || 0);
    });

    // DEBUG: Log na začiatok getStocksList
    if (tickers && tickers.some(t => ['NVDA', 'GOOG', 'MSFT'].includes(t))) {
      console.log(`🔍 getStocksList: Found ${stocks.length} stocks, tickers=${tickers.join(',')}`);
      stocks.forEach(s => {
        if (['NVDA', 'GOOG', 'MSFT'].includes(s.symbol)) {
          console.log(`🔍 DB VALUES for ${s.symbol}: lastMarketCap=${s.lastMarketCap}, lastPrice=${s.lastPrice}, latestPrevClose=${s.latestPrevClose}, sharesOutstanding=${s.sharesOutstanding} (type: ${typeof s.sharesOutstanding})`);
        }
      });
    }

    // CRITICAL: Always fetch regularClose for all sessions (needed for correct % change calculation)
    // Only use regularClose from TODAY (not previous day) - same logic as heatmap API
    const regularCloseBySymbol = new Map<string, number>();
    const dateET = getDateET(etNow);
    const todayDateObj = createETDate(dateET);
    const dailyRefs = await prisma.dailyRef.findMany({
      where: {
        symbol: { in: stocks.map(s => s.symbol) },
        date: todayDateObj // Only today's regularClose
      },
      select: { symbol: true, regularClose: true, date: true }
    });
    dailyRefs.forEach(r => {
      // CRITICAL: Only use regularClose from TODAY (not previous day)
      // This prevents using stale regularClose from yesterday which causes incorrect % changes
      if (r.regularClose && r.regularClose > 0) {
        const drDate = new Date(r.date);
        const isToday = drDate.getTime() === todayDateObj.getTime();
        if (isToday) {
          regularCloseBySymbol.set(r.symbol, r.regularClose);
        }
      }
    });

    // On-demand prevClose fetch for tickers missing previousClose (API-safe for /api/stocks)
    const tickersNeedingPrevClose = stocks
      .filter(s => (priceBySymbol.get(s.symbol) || 0) > 0 && (s.latestPrevClose || 0) === 0)
      .map(s => s.symbol);

    const onDemandPrevCloseMap = new Map<string, number>();
    if (tickersNeedingPrevClose.length > 0) {
      try {
        const { fetchPreviousClosesBatchAndPersist } = await import('@/lib/utils/onDemandPrevClose');
        const today = getDateET();
        // For /api/stocks, we can be more generous (smaller datasets, 10-50 tickers typical)
        const onDemandResults = await fetchPreviousClosesBatchAndPersist(
          tickersNeedingPrevClose,
          today,
          {
            maxTickers: 50,        // Cap at 50 (usually less)
            timeoutBudget: 800,     // 800ms budget (more generous than heatmap)
            maxConcurrent: 5
          }
        );
        onDemandResults.forEach((prevClose, ticker) => {
          onDemandPrevCloseMap.set(ticker, prevClose);
        });
        console.log(`✅ On-demand fetched ${onDemandPrevCloseMap.size} prevClose for /api/stocks`);
      } catch (error) {
        console.warn(`⚠️ On-demand prevClose fetch failed in stockService:`, error);
      }
    }

    // On-demand sharesOutstanding fetch for tickers missing shares (needed for marketCapDiff calculation)
    // Request-scoped memoization: track in-flight promises to avoid duplicate API calls
    const sharesFetchPromises = new Map<string, Promise<number>>();
    const sharesSourceMap = new Map<string, 'db' | 'polygon' | 'fallback' | 'missing'>(); // Guard log tracking

    const tickersNeedingShares = stocks
      .filter(s => {
        const hasPrice = (priceBySymbol.get(s.symbol) || 0) > 0;
        const hasPrevClose = (onDemandPrevCloseMap.get(s.symbol) || s.latestPrevClose || 0) > 0;
        const missingShares = !s.sharesOutstanding || s.sharesOutstanding === 0;
        if (!missingShares) {
          sharesSourceMap.set(s.symbol, 'db'); // Track source for guard logs
        }
        return hasPrice && hasPrevClose && missingShares;
      })
      .map(s => s.symbol);

    const onDemandSharesMap = new Map<string, number>();
    if (tickersNeedingShares.length > 0) {
      const startTime = Date.now();
      const timeoutBudget = 1000; // 1 second max for shares fetching in SSR

      try {
        const maxConcurrent = 5;

        for (let i = 0; i < tickersNeedingShares.length; i += maxConcurrent) {
          // Check timeout budget
          if (Date.now() - startTime >= timeoutBudget) {
            console.warn(`⚠️ On-demand shares fetch timeout budget exceeded, stopping early`);
            break;
          }

          const batch = tickersNeedingShares.slice(i, i + maxConcurrent);
          const batchPromises = batch.map(async (ticker) => {
            if (!sharesFetchPromises.has(ticker)) {
              sharesFetchPromises.set(ticker, (async () => {
                try {
                  const currentPrice = priceBySymbol.get(ticker) || 0;
                  const shares = await getSharesOutstanding(ticker, currentPrice);
                  if (shares > 0) {
                    sharesSourceMap.set(ticker, 'polygon');
                    onDemandSharesMap.set(ticker, shares);
                    prisma.ticker.update({
                      where: { symbol: ticker },
                      data: { sharesOutstanding: shares }
                    }).catch(() => { }); // Silent persist
                    return shares;
                  }
                  sharesSourceMap.set(ticker, 'missing');
                  return 0;
                } catch (error) {
                  sharesSourceMap.set(ticker, 'fallback');
                  return 0;
                }
              })());
            }
            return await sharesFetchPromises.get(ticker)!;
          });

          await Promise.all(batchPromises);
        }

        console.log(`✅ On-demand fetched ${onDemandSharesMap.size} shares for /api/stocks`);
      } catch (error) {
        console.warn(`⚠️ On-demand shares fetch failed:`, error);
      }
    }

    // Collect DB update promises to ensure they complete before response
    // IMPORTANT:
    // Do NOT write to the DB in request path.
    // SQLite (used on this server) will frequently time out / lock under concurrent writes (P1008),
    // which degrades UX and can cascade into 502s behind nginx.
    // Persistence is handled by background workers (pmp-polygon-worker).

    // DEBUG: Log pred map
    if (tickers && tickers.some(t => ['NVDA', 'GOOG', 'MSFT'].includes(t))) {
      console.log(`🔍 About to map ${stocks.length} stocks`);
    }

    const results: StockData[] = stocks.map(s => {
      const best = bestPriceBySymbol.get(s.symbol);
      const currentPrice = best?.price || 0;
      // Use on-demand prevClose if available, otherwise fallback to DB value
      const previousClose = onDemandPrevCloseMap.get(s.symbol) || (s.latestPrevClose || 0);
      // Use on-demand sharesOutstanding if available, otherwise fallback to DB value
      const sharesOutstanding = onDemandSharesMap.get(s.symbol) || (s.sharesOutstanding || 0);
      // Get regularClose from today's DailyRef (same logic as heatmap API)
      const regularClose = regularCloseBySymbol.get(s.symbol) || 0;

      const lastTs = best?.ts || (s.lastPriceUpdated || s.updatedAt);
      const lastUpdated = lastTs.toISOString();

      const isFrozen = !!pricingState.useFrozenPrice;
      // "isStale" is used for UX/diagnostics ("is this price reasonably fresh for this session?").
      // The previous thresholds (live=1min, pre/after=5min) were too strict and caused most tickers
      // to appear stale even though they were updated recently.
      const thresholdMin =
        session === 'live' ? 5 :
          session === 'pre' ? 30 :
            session === 'after' ? 30 :
              60;
      const ageMs = etNow.getTime() - lastTs.getTime();
      const isStale = !isFrozen && currentPrice > 0 && ageMs > thresholdMin * 60_000;

      // VŽDY počítať percentChange z aktuálnych hodnôt pre konzistentnosť s heatmapou
      // Use same logic as heatmap API: computePercentChange (which internally uses calculatePercentChange)
      const pct = calculatePercentChange(
        currentPrice,
        session,
        previousClose > 0 ? previousClose : null,
        regularClose > 0 ? regularClose : null
      );

      // CRITICAL: Always use calculated percentChange if we have valid reference price
      // Don't fallback to s.lastChangePct (it may be stale) - same as heatmap API
      // This ensures consistency between heatmap and tables
      const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
        ? pct.changePct
        : 0; // Return 0 instead of stale lastChangePct

      // Vypočítaj market cap z aktuálnych hodnôt
      const marketCap = (currentPrice > 0 && sharesOutstanding > 0)
        ? computeMarketCap(currentPrice, sharesOutstanding)
        : (s.lastMarketCap || 0);

      // DEBUG: Log pre veľké spoločnosti PRED výpočtom marketCapDiff
      if (s.lastMarketCap && s.lastMarketCap > 1000) {
        console.log(`🔍 ${s.symbol}: PRE-CALC - marketCap=${marketCap}B (from DB: ${s.lastMarketCap}B), price=${currentPrice}, prevClose=${previousClose}, shares=${sharesOutstanding} (type: ${typeof sharesOutstanding}), pct.changePct=${pct.changePct}, pct.ref.price=${pct.reference.price}, pct.ref.used=${pct.reference.used}`);
      }

      // VŽDY počítať marketCapDiff z aktuálnych hodnôt pre konzistentnosť
      // Metóda A (highest confidence): price + prevClose + shares
      // Metóda B (medium): marketCap + percentChange (použijeme dynamicky vypočítaný pct.changePct)
      // Fallback: lastMarketCapDiff z DB
      type CapDiffMethod = "shares" | "mcap_pct" | "db_fallback" | "none";

      const computeCapDiffFromMcapPct = (mcap: number, pct: number): number => {
        // marketCap je v biliónoch (billions), percentChange v %
        return mcap * (pct / 100);
      };

      let marketCapDiff = 0;
      let capDiffMethod: CapDiffMethod = "none";

      // Debug log pre veľké spoločnosti na začiatku (handle NULL sharesOutstanding)
      if (marketCap > 1000 && (!sharesOutstanding || sharesOutstanding === 0)) {
        console.log(`🔍 ${s.symbol}: START - marketCap=${marketCap}B, price=${currentPrice}, prevClose=${previousClose}, shares=${sharesOutstanding} (type: ${typeof sharesOutstanding}), pct.changePct=${pct.changePct}, pct.ref.price=${pct.reference.price}`);
      }

      // Guard log: track sharesOutstanding source
      const sharesSource = sharesSourceMap.get(s.symbol) || (sharesOutstanding > 0 ? 'db' : 'missing');

      // CRITICAL: Use the same reference price as percentChange calculation (for after-hours consistency)
      // For after-hours/closed sessions, use regularClose if available, otherwise previousClose
      const referencePrice = pct.reference.price || (regularClose > 0 ? regularClose : previousClose);

      // A) Najpresnejšie: shares
      if (currentPrice > 0 && referencePrice > 0 && sharesOutstanding > 0) {
        marketCapDiff = computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding);
        capDiffMethod = "shares";
        if (marketCap > 1000) {
          console.log(`✅ ${s.symbol}: Method A (shares) - marketCapDiff=${marketCapDiff}B [sharesSource=${sharesSource}, refPrice=${referencePrice}, refUsed=${pct.reference.used}]`);
        }
      }
      // B) Bez shares: marketCap + percentChange (použijeme dynamicky vypočítaný pct.changePct, nie percentChange z DB)
      else if (marketCap > 0 && pct.changePct !== 0 && pct.reference.price && pct.reference.price > 0) {
        // Použijeme dynamicky vypočítaný percentChange (pct.changePct), nie percentChange z DB
        marketCapDiff = computeCapDiffFromMcapPct(marketCap, pct.changePct);
        capDiffMethod = "mcap_pct";
        // Guard log: track why Method B was used
        const reason = sharesSource === 'missing' ? 'polygon missing field' : sharesSource === 'fallback' ? 'polygon error' : 'db stale';
        if (marketCap > 1000) {
          console.log(`📊 ${s.symbol}: Method B (pct.changePct) - marketCapDiff=${marketCapDiff}B (marketCap=${marketCap}B, percentChange=${pct.changePct}%, method=${capDiffMethod}, reason=${reason})`);
        }
      }
      // B2) Alternatíva: ak máme marketCap a referencePrice, môžeme dopočítať percentChange
      else if (marketCap > 0 && currentPrice > 0 && referencePrice > 0 && referencePrice !== currentPrice) {
        // Vypočítaj percentChange z currentPrice a referencePrice (same as percentChange calculation)
        const calculatedPct = ((currentPrice - referencePrice) / referencePrice) * 100;
        if (calculatedPct !== 0) {
          marketCapDiff = computeCapDiffFromMcapPct(marketCap, calculatedPct);
          capDiffMethod = "mcap_pct";
          // Guard log: track why Method B2 was used
          const reason = sharesSource === 'missing' ? 'polygon missing field' : sharesSource === 'fallback' ? 'polygon error' : 'db stale';
          if (marketCap > 1000) {
            console.log(`📊 ${s.symbol}: Method B2 (calculatedPct) - marketCapDiff=${marketCapDiff}B (marketCap=${marketCap}B, calculatedPct=${calculatedPct}%, method=${capDiffMethod}, reason=${reason}, price=${currentPrice}, refPrice=${referencePrice}, refUsed=${pct.reference.used})`);
          }
        } else if (marketCap > 1000) {
          console.log(`⚠️ ${s.symbol}: calculatedPct=0 (price=${currentPrice}, refPrice=${referencePrice})`);
        }
      } else if (marketCap > 1000 && (!sharesOutstanding || sharesOutstanding === 0)) {
        // Debug: prečo sa nepočíta pre veľké spoločnosti
        console.log(`⚠️ ${s.symbol}: NO METHOD - marketCap=${marketCap}B, price=${currentPrice}, refPrice=${referencePrice}, shares=${sharesOutstanding} (type: ${typeof sharesOutstanding}, source=${sharesSource}), pct.changePct=${pct.changePct}, pct.ref.price=${pct.reference.price}, condition A=${currentPrice > 0 && referencePrice > 0 && sharesOutstanding > 0}, condition B=${marketCap > 0 && pct.changePct !== 0 && pct.reference.price && pct.reference.price > 0}, condition B2=${marketCap > 0 && currentPrice > 0 && referencePrice > 0 && referencePrice !== currentPrice}`);
      }
      // C) Fallback z DB
      else if (s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) {
        marketCapDiff = s.lastMarketCapDiff;
        capDiffMethod = "db_fallback";
      }

      // Sanity check: ochrana pred extrémnymi hodnotami
      if (!Number.isFinite(marketCapDiff)) {
        marketCapDiff = 0;
        capDiffMethod = "none";
      } else if (marketCap > 0) {
        const maxAbs = marketCap * 0.50; // 50% cap guard (relaxed from 15% to allow for earnings volatility)
        if (Math.abs(marketCapDiff) > maxAbs) {
          // Ak sem padneš, zvyčajne je percentChange alebo marketCap chyba z API
          marketCapDiff = 0;
          capDiffMethod = "none";
        }
      }

      // NOTE: We intentionally do not persist marketCapDiff here.
      // If you need persistence, add it to a background worker instead.
      if (marketCap > 1000 && marketCapDiff === 0 && (!sharesOutstanding || sharesOutstanding === 0)) {
        // Debug: prečo sa nepočíta pre veľké spoločnosti
        console.log(`⚠️ ${s.symbol}: marketCapDiff=0 (marketCap=${marketCap}B, percentChange=${percentChange}%, sharesOutstanding=${sharesOutstanding} (type: ${typeof sharesOutstanding}), method=${capDiffMethod})`);
      }

      return {
        ticker: s.symbol,
        companyName: s.name || '',
        sector: (() => {
          const raw = (s.sector || '').trim();
          const ov = SECTOR_INDUSTRY_OVERRIDES[s.symbol];
          if (ov && (!raw || raw === 'Other' || raw === 'Unrecognized')) return ov.sector;
          return raw;
        })(),
        industry: (() => {
          const raw = (s.industry || '').trim();
          const sectorRaw = (s.sector || '').trim();
          const ov = SECTOR_INDUSTRY_OVERRIDES[s.symbol];
          if (ov && (!raw || raw === 'Uncategorized' || raw === 'Unrecognized' || sectorRaw === 'Other' || sectorRaw === 'Unrecognized')) {
            return ov.industry;
          }
          return raw;
        })(),
        logoUrl: s.logoUrl || `/logos/${s.symbol.toLowerCase()}-32.webp`,
        currentPrice,
        closePrice: previousClose,
        percentChange,
        marketCap,
        marketCapDiff,
        lastUpdated,
        referenceUsed: pct.reference.used,
        referencePrice: pct.reference.price,
        isFrozen,
        isStale
      };
    });

    // No DB writes here (see note above).

    // Fallback for missing tickers (e.g. indices SPY, QQQ which might not be in DB during dev)
    if (tickers && tickers.length > 0) {
      const foundTickers = new Set(results.map(r => r.ticker));
      const missingTickers = tickers.filter(t => !foundTickers.has(t));

      if (missingTickers.length > 0) {
        try {
          // Dynamic import to avoid circular deps if any, though client is safe
          const { getPolygonClient } = await import('@/lib/clients/polygonClient');
          const client = getPolygonClient();

          if (client) {
            const polygonData = await client.fetchBatchSnapshot(missingTickers);

            polygonData.forEach(snap => {
              if (snap.ticker) {
                // Determine current price (close of day, or last min close, or last trade)
                // Use optional chaining to safely access nested properties
                const currentPrice = snap.day?.c || snap.min?.c || (snap.lastTrade ? snap.lastTrade.p : 0);
                const previousClose = snap.prevDay?.c || 0;

                const percentChange = (currentPrice > 0 && previousClose > 0)
                  ? ((currentPrice - previousClose) / previousClose) * 100
                  : 0;

                results.push({
                  ticker: snap.ticker,
                  currentPrice,
                  closePrice: previousClose,
                  percentChange,
                  marketCap: 0, // Indices don't have market cap usually or we don't know it
                  marketCapDiff: 0,
                  companyName: snap.ticker, // Fallback
                  logoUrl: `/logos/${snap.ticker.toLowerCase()}-32.webp`
                });
              }
            });
          }
        } catch (polyError) {
          console.error('Failed to fetch missing tickers from Polygon:', polyError);
        }
      }
    }

    return { data: results, errors: [] };

  } catch (error) {
    console.error('Error fetching stock list:', error);
    return { data: [], errors: [String(error)] };
  }
}


import { prisma } from '@/lib/db/prisma';
import { SessionPrice, DailyRef } from '@prisma/client';
import { SECTOR_INDUSTRY_OVERRIDES } from '@/data/sectorIndustryOverrides';
import { normalizeSectorIndustryPair } from '@/lib/utils/sectorIndustryValidator';
import { getCacheKey } from '@/lib/redis/keys';
import { getDateET, createETDate, toET } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';

export interface TickerInfo {
  name: string;
  sector: string;
  industry: string;
  sharesOutstanding: number | null;
  lastPrice: number | null;
  lastPriceUpdated: Date | null;
  latestPrevClose: number | null;
  latestPrevCloseDate: Date | null;
  lastChangePct: number | null;
  lastMarketCap: number | null;
  lastMarketCapDiff: number | null;
}

export interface HeatmapFetchResult {
  tickerMap: Map<string, TickerInfo>;
  tickerSymbols: string[];
  sessionPrices: SessionPrice[];
  dailyRefs: DailyRef[];
  cachedStockDataMap: Map<string, any>;
  prevCloseBatchMap: Map<string, number>;
  todayYMD: string;
  today: Date;
  tomorrow: Date;
  dayAgo: Date;
}

/**
 * Fetch all tickers from DB with sector/industry overrides applied.
 */
export async function fetchTickers(maxTickers: number): Promise<{
  tickers: any[];
  tickerMap: Map<string, TickerInfo>;
  tickerSymbols: string[];
}> {
  const tickers = await prisma.ticker.findMany({
    where: {},
    select: {
      symbol: true,
      name: true,
      sector: true,
      industry: true,
      sharesOutstanding: true,
      lastPrice: true,
      lastPriceUpdated: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
      lastChangePct: true,
      lastMarketCap: true,
      lastMarketCapDiff: true,
    },
    take: maxTickers,
  });
  console.log(`📊 Found ${tickers.length} tickers (sector/industry may be missing in dev)`);

  const tickerMap = new Map<string, TickerInfo>();
  for (const t of tickers) {
    const symbol = t.symbol;
    const ov = SECTOR_INDUSTRY_OVERRIDES[symbol];
    const normalized = normalizeSectorIndustryPair(t.sector, t.industry);
    const sector = ov ? ov.sector : normalized.sector;
    const industry = ov ? ov.industry : normalized.industry;
    const name = ov?.name && (!t.name || t.name.trim() === '') ? ov.name : (t.name || symbol);

    tickerMap.set(symbol, {
      name,
      sector,
      industry,
      sharesOutstanding: t.sharesOutstanding,
      lastPrice: t.lastPrice,
      lastPriceUpdated: t.lastPriceUpdated,
      latestPrevClose: t.latestPrevClose,
      latestPrevCloseDate: t.latestPrevCloseDate,
      lastChangePct: t.lastChangePct,
      lastMarketCap: t.lastMarketCap,
      lastMarketCapDiff: t.lastMarketCapDiff,
    });
  }

  return { tickers, tickerMap, tickerSymbols: tickers.map(t => t.symbol) };
}

/**
 * Fetch SessionPrice and DailyRef records in parallel.
 */
export async function fetchPriceData(
  tickerSymbols: string[],
  canUseFastPath: boolean,
  timeframe: string,
  dayAgo: Date,
  tomorrow: Date,
  oneWeekAgo: Date,
  today: Date
): Promise<{ sessionPrices: SessionPrice[]; dailyRefs: DailyRef[] }> {
  if (!canUseFastPath || timeframe !== 'day') {
    const [sessionPricesResult, dailyRefsResult] = await Promise.all([
      prisma.sessionPrice.findMany({
        where: {
          symbol: { in: tickerSymbols },
          date: { gte: dayAgo, lt: tomorrow },
        },
        orderBy: [
          { lastTs: 'desc' },
          { session: 'asc' },
        ],
      }),
      prisma.dailyRef.findMany({
        where: {
          symbol: { in: tickerSymbols },
          date: { gte: oneWeekAgo, lte: today },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    console.log(`💰 Found ${sessionPricesResult.length} SessionPrice records`);
    console.log(`📊 Found ${dailyRefsResult.length} DailyRef records (last 7 days state)`);
    return { sessionPrices: sessionPricesResult, dailyRefs: dailyRefsResult };
  }

  console.log('🚀 Fast Path: Using denormalized Ticker data (skipping SessionPrice/DailyRef)');
  return { sessionPrices: [], dailyRefs: [] };
}

/**
 * Batch fetch cached stock data from Redis using mGet.
 */
export async function fetchCachedStockData(
  tickerSymbols: string[],
  tickerMap: Map<string, TickerInfo>
): Promise<Map<string, any>> {
  const project = 'pmp';
  const validTickers = tickerSymbols.filter(ticker => ticker !== 'GOOG' && tickerMap.has(ticker));
  const cacheKeys = validTickers.map(ticker => getCacheKey(project, ticker, 'stock'));

  const cachedStockDataMap = new Map<string, any>();
  try {
    const { mGetJsonMap } = await import('@/lib/redis');
    if (cacheKeys.length > 0) {
      const cachedData = await mGetJsonMap<any>(cacheKeys);
      validTickers.forEach((ticker, index) => {
        const cacheKey = cacheKeys[index];
        if (!cacheKey) return;
        const data = cachedData.get(cacheKey);
        if (data) {
          cachedStockDataMap.set(ticker, data);
        }
      });
    }
  } catch (e) {
    console.warn('Batch cache fetch failed, fallback handled by mGetJson');
  }
  return cachedStockDataMap;
}

/**
 * On-demand batch fetch previousClose for tickers missing it.
 */
export async function fetchPrevCloseOnDemand(
  tickerSymbols: string[],
  tickerMap: Map<string, TickerInfo>,
  cachedStockDataMap: Map<string, any>,
  previousCloseMap: Map<string, number>,
  priceMap: Map<string, { price: number; changePct: number; tsMs: number; source: string }>,
  todayYMD: string
): Promise<Map<string, number>> {
  const tickersNeedingPrevClose: string[] = [];
  for (const ticker of tickerSymbols) {
    if (ticker === 'GOOG') continue;
    const tickerInfo = tickerMap.get(ticker);
    if (!tickerInfo) continue;

    const cachedStockData = cachedStockDataMap.get(ticker);
    if (!cachedStockData || !cachedStockData.closePrice) {
      const previousClose = previousCloseMap.get(ticker) || 0;
      const priceInfo = priceMap.get(ticker);
      const currentPrice = priceInfo?.price || 0;
      if (previousClose === 0 && currentPrice > 0) {
        tickersNeedingPrevClose.push(ticker);
      }
    }
  }

  const prevCloseBatchMap = new Map<string, number>();
  const missingBefore = tickersNeedingPrevClose.length;
  if (missingBefore > 0) {
    const startTime = Date.now();
    console.log(`🔄 On-demand fetching previousClose for ${missingBefore} tickers (max 50, timeout 600ms)...`);
    try {
      const { fetchPreviousClosesBatchAndPersist } = await import('@/lib/utils/onDemandPrevClose');
      const results = await fetchPreviousClosesBatchAndPersist(
        tickersNeedingPrevClose,
        todayYMD,
        { maxTickers: 50, timeoutBudget: 600, maxConcurrent: 5 }
      );
      results.forEach((prevClose, ticker) => prevCloseBatchMap.set(ticker, prevClose));
      const duration = Date.now() - startTime;
      const missingAfter = missingBefore - prevCloseBatchMap.size;
      console.log(`✅ On-demand prevClose: ${missingBefore} missing → ${prevCloseBatchMap.size} fetched → ${missingAfter} still missing (${duration}ms, persisted to DB)`);
    } catch (error) {
      console.warn(`⚠️ On-demand prevClose fetch failed:`, error);
    }
  }
  return prevCloseBatchMap;
}

/**
 * Compute ET date boundaries for the heatmap query.
 */
export function computeDateBoundaries(now: Date) {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const addETCalendarDays = (base: Date, days: number) => {
    const p = toET(base);
    const utcNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
    utcNoon.setUTCDate(utcNoon.getUTCDate() + days);
    return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
  };

  const todayYMD = getDateET(now);
  const tomorrowYMD = addETCalendarDays(now, 1);
  const today = createETDate(todayYMD);
  const tomorrow = createETDate(tomorrowYMD);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = getLastTradingDay(now);

  return { todayYMD, today, tomorrow, oneWeekAgo, dayAgo };
}

/**
 * Deduplicate SessionPrice records to latest per ticker.
 */
export function deduplicateSessionPrices(records: SessionPrice[]): SessionPrice[] {
  const priceMap = new Map<string, SessionPrice>();
  for (const sp of records) {
    const existing = priceMap.get(sp.symbol);
    if (!existing || (sp.lastTs && existing.lastTs && sp.lastTs > existing.lastTs)) {
      priceMap.set(sp.symbol, sp);
    }
  }
  return Array.from(priceMap.values());
}

/**
 * Deduplicate DailyRef records to latest per ticker.
 */
export function deduplicateDailyRefs(records: DailyRef[]): DailyRef[] {
  const map = new Map<string, DailyRef>();
  for (const dr of records) {
    if (!map.has(dr.symbol)) {
      map.set(dr.symbol, dr);
    }
  }
  return Array.from(map.values());
}

import { SessionPrice, DailyRef } from '@prisma/client';
import { StockData } from '@/lib/types';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, validateMarketCap, validatePercentChange } from '@/lib/utils/marketCapUtils';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { detectSession, nowET, isMarketHoliday, getTradingDay, getLastTradingDay } from '@/lib/utils/timeUtils';
import { isWeekendET } from '@/lib/utils/dateET';
import { resolvePrevClose } from '@/lib/heatmap/resolvePrevClose';
import type { TickerInfo } from './heatmapFetcher';

export interface HeatmapPayloadRow {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  percentChange: number;
  marketCapDiff: number;
  currentPrice: number;
  lastUpdated?: string;
  isStale?: boolean;
  priceSource?: string;
  _timestamp?: string;
}

export interface TransformContext {
  session: string;
  etNow: Date;
  isNonTradingClosedDay: boolean;
  lastTradingDayForQuery: Date;
  regularCloseReferenceDayStr: string | null;
  todayDateStr: string;
  todayDateObj: Date;
}

export interface TransformResult {
  results: HeatmapPayloadRow[];
  processed: number;
  cacheHits: number;
  dbHits: number;
  skippedNoPrice: number;
  skippedNoMarketCap: number;
  maxUpdatedAt: Date | null;
  debugStats?: any;
}

/**
 * Build previousClose and regularClose maps from DailyRef records.
 */
export function buildPrevCloseMaps(
  dailyRefs: DailyRef[],
  ctx: TransformContext
): {
  previousCloseMap: Map<string, number>;
  regularCloseMap: Map<string, number>;
  debugStats: any;
} {
  const previousCloseMap = new Map<string, number>();
  const regularCloseMap = new Map<string, number>();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ctx.etNow.getDay()];

  const debugStats = {
    totalDailyRefs: dailyRefs.length,
    dailyRefsUsedConfig: {
      todayDateStr: ctx.todayDateStr,
      todayName: dayName,
      isMonday: ctx.etNow.getDay() === 1
    },
    counts: {
      totalTickers: 0,
      dailyRefToday: 0,
      dailyRefOlder: 0,
      tickerFallback: 0,
      missing: 0
    }
  };

  // Pass 1: Set regularCloseMap and previousCloseMap from regularClose.
  // Records are ordered by date desc, so the first regularClose per symbol is the most recent.
  for (const dr of dailyRefs) {
    const drDate = new Date(dr.date);
    const drDateStr = getDateET(drDate);
    const isToday = drDateStr === ctx.todayDateStr;

    if (dr.regularClose && dr.regularClose > 0) {
      const isRegularCloseReferenceDay = ctx.regularCloseReferenceDayStr
        ? (drDateStr === ctx.regularCloseReferenceDayStr)
        : isToday;
      if (isRegularCloseReferenceDay) {
        regularCloseMap.set(dr.symbol, dr.regularClose);
      }

      // Use regularClose as previousClose for older records (not today)
      if (!isToday && !previousCloseMap.has(dr.symbol)) {
        previousCloseMap.set(dr.symbol, dr.regularClose);
        debugStats.counts.dailyRefOlder++;
      }
    }
  }

  // Pass 2: For symbols without previousClose from regularClose,
  // use previousClose from the latest DailyRef record.
  // Covers: early weekday mornings before pre-market, weekends, holidays.
  for (const dr of dailyRefs) {
    if (previousCloseMap.has(dr.symbol)) continue;

    const drDate = new Date(dr.date);
    const drDateStr = getDateET(drDate);
    const isToday = drDateStr === ctx.todayDateStr;

    if (isToday && dr.previousClose > 0) {
      previousCloseMap.set(dr.symbol, dr.previousClose);
      debugStats.counts.dailyRefToday++;
    } else if (!isToday && dr.previousClose > 0 && (ctx.isNonTradingClosedDay || ctx.session === 'closed')) {
      previousCloseMap.set(dr.symbol, dr.previousClose);
      debugStats.counts.dailyRefOlder++;
    }
  }

  return { previousCloseMap, regularCloseMap, debugStats };
}

/**
 * Build price map from ticker data and session prices (timestamp-aware).
 */
export function buildPriceMap(
  tickerMap: Map<string, TickerInfo>,
  sessionPrices: SessionPrice[]
): Map<string, { price: number; changePct: number; tsMs: number; source: 'ticker' | 'session' }> {
  const priceMap = new Map<string, { price: number; changePct: number; tsMs: number; source: 'ticker' | 'session' }>();

  for (const [symbol, info] of tickerMap.entries()) {
    if (info.lastPrice && info.lastPrice > 0) {
      priceMap.set(symbol, {
        price: info.lastPrice,
        changePct: 0,
        tsMs: info.lastPriceUpdated ? new Date(info.lastPriceUpdated).getTime() : 0,
        source: 'ticker',
      });
    }
  }

  for (const sp of sessionPrices) {
    const spTs = sp.lastTs ? new Date(sp.lastTs).getTime() : (sp.updatedAt ? new Date(sp.updatedAt).getTime() : 0);
    const existing = priceMap.get(sp.symbol);
    if (!existing || (spTs && spTs >= existing.tsMs)) {
      priceMap.set(sp.symbol, {
        price: sp.lastPrice,
        changePct: sp.changePct,
        tsMs: spTs,
        source: 'session',
      });
    }
  }

  return priceMap;
}

/**
 * Compute transform context (session, ET dates, trading day references).
 */
export function computeTransformContext(): TransformContext {
  const etNow = nowET();
  const session = detectSession(etNow);
  const calendarYMD = getDateET(etNow);
  const calendarDateET = createETDate(calendarYMD);
  const isNonTradingClosedDay =
    session === 'closed' && (isWeekendET(etNow) || isMarketHoliday(etNow));
  const lastTradingDayForQuery = getLastTradingDay(calendarDateET);
  const lastTradingDayForReference = isNonTradingClosedDay ? getTradingDay(etNow) : null;
  const regularCloseReferenceDayStr = isNonTradingClosedDay && lastTradingDayForReference
    ? getDateET(lastTradingDayForReference)
    : null;

  return {
    session,
    etNow,
    isNonTradingClosedDay,
    lastTradingDayForQuery,
    regularCloseReferenceDayStr,
    todayDateStr: calendarYMD,
    todayDateObj: calendarDateET,
  };
}

/**
 * Transform all ticker data into heatmap payload rows.
 */
export function transformToHeatmap(
  tickerSymbols: string[],
  tickerMap: Map<string, TickerInfo>,
  sessionPrices: SessionPrice[],
  dailyRefs: DailyRef[],
  cachedStockDataMap: Map<string, any>,
  prevCloseBatchMap: Map<string, number>,
  ctx: TransformContext,
  now: Date,
  debug: boolean
): TransformResult {
  const { previousCloseMap, regularCloseMap, debugStats } = buildPrevCloseMaps(dailyRefs, ctx);
  const priceMap = buildPriceMap(tickerMap, sessionPrices);
  debugStats.counts.totalTickers = tickerSymbols.length;

  const results: HeatmapPayloadRow[] = [];
  let skippedNoPrice = 0;
  let skippedNoMarketCap = 0;
  let processed = 0;
  let cacheHits = 0;
  let dbHits = 0;

  for (const ticker of tickerSymbols) {
    if (ticker === 'GOOG') continue;

    const tickerInfo = tickerMap.get(ticker);
    if (!tickerInfo) continue;

    const cachedStockData = cachedStockDataMap.get(ticker);

    let currentPrice = 0;
    let previousClose = 0;
    let changePercent = 0;
    let marketCap = 0;
    let marketCapDiff = 0;
    let priceTsMs = 0;
    let priceSource: 'cache' | 'ticker' | 'session' | 'unknown' = 'unknown';

    const hasStockCache = cachedStockData && (cachedStockData.currentPrice || cachedStockData.p) && cachedStockData.closePrice;
    const hasPriceCache = cachedStockData && cachedStockData.p && !cachedStockData.closePrice;

    if (hasStockCache) {
      currentPrice = cachedStockData.currentPrice || cachedStockData.p;
      const cachedClose = cachedStockData.closePrice;

      previousClose = resolvePrevClose(
        { refFromDaily: previousCloseMap.get(ticker) || 0, prevFromTicker: 0, cachedClose, batchClose: prevCloseBatchMap.get(ticker) || 0 },
        { isNonTradingClosedDay: ctx.isNonTradingClosedDay }
      );

      const regularClose = regularCloseMap.get(ticker) || null;
      const cachedPct = Number(cachedStockData.percentChange);
      changePercent = (cachedPct && isFinite(cachedPct))
        ? cachedPct
        : computePercentChange(currentPrice, previousClose, ctx.session as any, regularClose);

      marketCap = cachedStockData.marketCap || 0;

      const sharesOutstanding = tickerInfo?.sharesOutstanding || 0;
      const referencePrice = previousClose > 0 ? previousClose : (regularClose && regularClose > 0 ? regularClose : 0);
      marketCapDiff = (sharesOutstanding > 0 && referencePrice > 0)
        ? computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding)
        : (cachedStockData.marketCapDiff || 0);

      priceSource = 'cache';
      cacheHits++;

      if (!validateMarketCap(marketCap, ticker)) { skippedNoMarketCap++; continue; }
      if (!validatePercentChange(changePercent, ticker)) { skippedNoPrice++; continue; }
    } else if (hasPriceCache) {
      currentPrice = cachedStockData.p;
      priceTsMs = cachedStockData.ts || 0;

      previousClose = resolvePrevClose(
        { refFromDaily: previousCloseMap.get(ticker) || 0, prevFromTicker: tickerInfo?.latestPrevClose || 0, cachedClose: 0, batchClose: prevCloseBatchMap.get(ticker) || 0 },
        { isNonTradingClosedDay: ctx.isNonTradingClosedDay }
      );

      if (previousClose === 0 && currentPrice > 0) {
        previousClose = prevCloseBatchMap.get(ticker) || 0;
        if (previousClose === 0) { skippedNoPrice++; continue; }
      }

      const regularClose = regularCloseMap.get(ticker) || null;
      const cachedChange = Number(cachedStockData.change);
      changePercent = (cachedChange && isFinite(cachedChange))
        ? cachedChange
        : computePercentChange(currentPrice, previousClose, ctx.session as any, regularClose);

      const sharesOutstanding = tickerInfo?.sharesOutstanding || 0;
      marketCap = sharesOutstanding > 0
        ? computeMarketCap(currentPrice, sharesOutstanding)
        : (tickerInfo?.lastMarketCap || 0);

      if (marketCap <= 0) { skippedNoMarketCap++; continue; }

      const referencePrice = previousClose > 0 ? previousClose : (regularClose && regularClose > 0 ? regularClose : 0);
      marketCapDiff = (sharesOutstanding > 0 && referencePrice > 0)
        ? computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding)
        : (tickerInfo?.lastMarketCapDiff || 0);

      priceSource = 'cache';
      cacheHits++;

      if (!validateMarketCap(marketCap, ticker)) { skippedNoMarketCap++; continue; }
      if (!validatePercentChange(changePercent, ticker)) { skippedNoPrice++; continue; }
    } else {
      const priceInfo = priceMap.get(ticker);
      currentPrice = priceInfo?.price || 0;
      priceTsMs = priceInfo?.tsMs || 0;
      priceSource = priceInfo?.source || 'unknown';

      // On weekends/holidays, allow prices up to 72h old (Friday close)
      const maxAgeMs = ctx.isNonTradingClosedDay ? 72 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      if (priceTsMs === 0 || (now.getTime() - priceTsMs) > maxAgeMs) {
        skippedNoPrice++; continue;
      }

      const rawPrevClose = tickerInfo?.latestPrevClose || 0;
      const rawPrevCloseDate = tickerInfo?.latestPrevCloseDate;
      const prevCloseDateIsValid = rawPrevCloseDate
        ? new Date(rawPrevCloseDate).getTime() >= ctx.lastTradingDayForQuery.getTime()
        : false;
      const prevFromTicker = (rawPrevClose > 0 && prevCloseDateIsValid) ? rawPrevClose : 0;
      if (rawPrevClose > 0 && !prevCloseDateIsValid) {
        console.warn(`⚠️ [STALE_PREVCLOSE][heatmap] ${ticker}: latestPrevClose=${rawPrevClose} from ${rawPrevCloseDate ? new Date(rawPrevCloseDate).toISOString().slice(0,10) : 'null'}, expected >= ${ctx.lastTradingDayForQuery.toISOString().slice(0,10)} — ignoring`);
      }
      const prevFromDaily = previousCloseMap.get(ticker) || 0;

      previousClose = resolvePrevClose(
        { refFromDaily: prevFromDaily, prevFromTicker, cachedClose: 0, batchClose: prevCloseBatchMap.get(ticker) || 0 },
        { isNonTradingClosedDay: ctx.isNonTradingClosedDay }
      );

      dbHits++;

      if (currentPrice === 0 && previousClose > 0) currentPrice = previousClose;
      if (previousClose === 0 && currentPrice > 0) {
        previousClose = prevCloseBatchMap.get(ticker) || 0;
        if (previousClose === 0) { skippedNoPrice++; continue; }
      }
      if (currentPrice === 0) { skippedNoPrice++; continue; }

      const regularClose = regularCloseMap.get(ticker) || null;
      if (currentPrice > 0 && previousClose > 0 && Math.abs(currentPrice - previousClose) < 0.001) {
        changePercent = tickerInfo.lastChangePct || 0;
      } else {
        changePercent = computePercentChange(currentPrice, previousClose, ctx.session as any, regularClose);
      }

      const sharesOutstanding = tickerInfo.sharesOutstanding || 0;
      marketCap = sharesOutstanding > 0
        ? computeMarketCap(currentPrice, sharesOutstanding)
        : (tickerInfo.lastMarketCap ? tickerInfo.lastMarketCap / 1_000_000_000 : 0);

      if (marketCap <= 0) { skippedNoMarketCap++; continue; }

      const referencePrice = previousClose > 0 ? previousClose : (regularClose && regularClose > 0 ? regularClose : 0);
      marketCapDiff = (sharesOutstanding > 0 && referencePrice > 0)
        ? computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding)
        : (tickerInfo.lastMarketCapDiff ? tickerInfo.lastMarketCapDiff / 1_000_000_000 : 0);
    }

    if (currentPrice === 0) { skippedNoPrice++; continue; }
    if (marketCap <= 0) { skippedNoMarketCap++; continue; }
    if (!validateMarketCap(marketCap, ticker)) { skippedNoMarketCap++; continue; }
    if (!validatePercentChange(changePercent, ticker)) { skippedNoPrice++; continue; }

    if (!tickerInfo.sector || tickerInfo.sector === 'Unknown' || tickerInfo.sector === 'Other') continue;
    if (Math.abs(changePercent) > 999) {
      console.warn(`⚠️ [Heatmap] Filtering out ${ticker} due to extreme change: ${changePercent.toFixed(2)}%`);
      continue;
    }

    const thresholdMin = ctx.session === 'live' ? 5 : ctx.session === 'pre' ? 30 : ctx.session === 'after' ? 30 : 60;
    const nowMs = ctx.etNow.getTime();
    const isStale = currentPrice > 0 && priceTsMs > 0 && (nowMs - priceTsMs) > thresholdMin * 60_000;
    const lastUpdatedIso = priceTsMs ? new Date(priceTsMs).toISOString() : undefined;

    results.push({
      ticker,
      companyName: tickerInfo.name || ticker,
      sector: tickerInfo.sector,
      industry: tickerInfo.industry,
      currentPrice,
      marketCap,
      percentChange: changePercent,
      marketCapDiff,
      ...(lastUpdatedIso ? { lastUpdated: lastUpdatedIso } : {}),
      ...(isStale ? { isStale } : {}),
      ...(priceSource !== 'unknown' ? { priceSource } : {}),
    });

    processed++;
  }

  // Sort by market cap desc
  results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

  // Find maxUpdatedAt from session prices
  let maxUpdatedAt: Date | null = null;
  for (const sp of sessionPrices) {
    for (const ts of [sp.lastTs, sp.updatedAt]) {
      if (ts) {
        try {
          const d = new Date(ts);
          if (!isNaN(d.getTime()) && (!maxUpdatedAt || d > maxUpdatedAt)) maxUpdatedAt = d;
        } catch {}
      }
    }
  }

  return { results, processed, cacheHits, dbHits, skippedNoPrice, skippedNoMarketCap, maxUpdatedAt, debugStats: debug ? debugStats : undefined };
}

/**
 * Build final payload with _timestamp and compact rows.
 */
export function buildPayload(
  results: HeatmapPayloadRow[],
  dataTimestamp: string,
  requestedLimit: number | null
): { payload: HeatmapPayloadRow[]; rows: any[] } {
  const limitedResults = requestedLimit ? results.slice(0, requestedLimit) : results;

  const payload = limitedResults.map((s) => ({
    ticker: s.ticker,
    companyName: s.companyName,
    sector: s.sector,
    industry: s.industry,
    marketCap: s.marketCap,
    percentChange: s.percentChange,
    marketCapDiff: s.marketCapDiff,
    currentPrice: s.currentPrice,
    ...(s.lastUpdated ? { lastUpdated: s.lastUpdated } : {}),
    ...(s.isStale ? { isStale: s.isStale } : {}),
    ...(s.priceSource ? { priceSource: s.priceSource } : {}),
    _timestamp: dataTimestamp,
  }));

  const rows = limitedResults.map((s) => ({
    t: s.ticker,
    n: s.companyName,
    s: s.sector,
    i: s.industry,
    m: s.marketCap,
    c: s.percentChange,
    d: s.marketCapDiff,
    p: s.currentPrice,
  }));

  return { payload, rows };
}

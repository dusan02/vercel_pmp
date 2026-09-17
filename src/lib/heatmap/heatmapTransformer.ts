import { SessionPrice, DailyRef } from '@prisma/client';
import { StockData } from '@/lib/types';
import { computeMarketCap, computeMarketCapDiff, computePercentChange, validateMarketCap, validatePercentChange } from '@/lib/utils/marketCapUtils';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { detectSession, nowET, isMarketHoliday, getTradingDay, getLastTradingDay } from '@/lib/utils/timeUtils';
import { isWeekendET } from '@/lib/utils/dateET';
import { resolvePrevClose, buildPrevCloseFromDailyRefs } from '@/lib/heatmap/resolvePrevClose';
import type { TickerInfo, PerfRefCloses } from './heatmapFetcher';

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
  weekChange?: number;
  monthChange?: number;
  ytdChange?: number;
  yearChange?: number;
  healthScore?: number;
  valuationScore?: number;
  profitabilityScore?: number;
  piotroskiScore?: number;
  altmanZ?: number;
  beneishScore?: number;
  fcfMargin?: number;
  zScore?: number;
  rvol?: number;
  peRatio?: number;
  forwardPe?: number;
  psRatio?: number;
  pbRatio?: number;
  pegRatio?: number;
  evEbitda?: number;
  roe?: number;
  netMargin?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  dividendYield?: number;
  beta?: number;
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
 * Delegates to buildPrevCloseFromDailyRefs in resolvePrevClose.ts (single source of truth).
 */
export function buildPrevCloseMaps(
  dailyRefs: DailyRef[],
  ctx: TransformContext
): {
  previousCloseMap: Map<string, number>;
  regularCloseMap: Map<string, number>;
  debugStats: any;
} {
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ctx.etNow.getDay()];

  const result = buildPrevCloseFromDailyRefs(dailyRefs, {
    todayDateStr: ctx.todayDateStr,
    isNonTradingClosedDay: ctx.isNonTradingClosedDay,
    session: ctx.session,
    regularCloseReferenceDayStr: ctx.regularCloseReferenceDayStr,
  });

  return {
    previousCloseMap: result.previousCloseMap,
    regularCloseMap: result.regularCloseMap,
    debugStats: {
      totalDailyRefs: result.debugStats.totalDailyRefs,
      dailyRefsUsedConfig: {
        todayDateStr: ctx.todayDateStr,
        todayName: dayName,
        isMonday: ctx.etNow.getDay() === 1,
      },
      counts: {
        totalTickers: 0,
        dailyRefToday: result.debugStats.counts.dailyRefToday,
        dailyRefOlder: result.debugStats.counts.dailyRefOlder,
        tickerFallback: 0,
        missing: 0,
      },
    },
  };
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
 * Map symbol → regular close from ~5 sessions back (1-week reference).
 * dailyRefs arrive ordered by date desc; we exclude today's row (its
 * regularClose only exists post-close and would shift the window by a
 * day), so the 5th non-null regularClose is the close 5 sessions ago.
 */
function buildWeekRefCloseMap(
  dailyRefs: Pick<DailyRef, 'symbol' | 'date' | 'regularClose'>[],
  todayStart?: Date
): Map<string, number> {
  const bySymbol = new Map<string, number[]>();
  for (const ref of dailyRefs) {
    if (ref.regularClose == null || ref.regularClose <= 0) continue;
    if (todayStart && ref.date >= todayStart) continue;
    const arr = bySymbol.get(ref.symbol);
    if (arr) arr.push(ref.regularClose); else bySymbol.set(ref.symbol, [ref.regularClose]);
  }
  const map = new Map<string, number>();
  for (const [sym, closes] of bySymbol) {
    const ref = closes[4] ?? closes[closes.length - 1];
    if (ref) map.set(sym, ref);
  }
  return map;
}

/**
 * Compute transform context (session, ET dates, trading day references).
 */
export function computeTransformContext(): TransformContext {
  const etNow = nowET();
  const session = detectSession(etNow);
  const calendarYMD = getDateET(etNow);
  const calendarDateET = createETDate(calendarYMD);
  // On weekends/holidays, always treat as non-trading closed day regardless of
  // detectSession() (which may return 'after' on Sunday evening for futures).
  const isNonTradingClosedDay = isWeekendET(etNow) || isMarketHoliday(etNow);
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
  debug: boolean,
  weekRefs?: Pick<DailyRef, 'symbol' | 'date' | 'regularClose'>[],
  perfRefs?: PerfRefCloses,
  precomputedMaps?: {
    previousCloseMap: Map<string, number>;
    regularCloseMap: Map<string, number>;
    priceMap: Map<string, { price: number; changePct: number; tsMs: number; source: 'ticker' | 'session' }>;
  }
): TransformResult {
  // Use precomputed maps if available, otherwise compute from scratch
  // Only compute debugStats when debug is true (avoids 4000+ record loop in production)
  const prevCloseResult = (!precomputedMaps || debug) ? buildPrevCloseMaps(dailyRefs, ctx) : null;
  const previousCloseMap = precomputedMaps?.previousCloseMap ?? prevCloseResult!.previousCloseMap;
  const regularCloseMap = precomputedMaps?.regularCloseMap ?? prevCloseResult!.regularCloseMap;
  const priceMap = precomputedMaps?.priceMap ?? buildPriceMap(tickerMap, sessionPrices);
  const weekRefCloseMap = buildWeekRefCloseMap(weekRefs ?? dailyRefs, ctx.todayDateObj);
  const debugStats = prevCloseResult?.debugStats ?? { totalDailyRefs: 0, dailyRefsUsedConfig: {}, counts: { totalTickers: 0, dailyRefToday: 0, dailyRefOlder: 0, tickerFallback: 0, missing: 0 } };
  debugStats.counts.totalTickers = tickerSymbols.length;

  const results: HeatmapPayloadRow[] = [];
  let skippedNoPrice = 0;
  let skippedNoMarketCap = 0;
  let processed = 0;
  let cacheHits = 0;
  let dbHits = 0;
  const stalePrevCloseTickers: string[] = [];

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

      // When market is closed (weekend, holiday, or pre-market hours), allow prices up to 72h old (Friday close)
      const maxAgeMs = (ctx.isNonTradingClosedDay || ctx.session === 'closed') ? 72 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
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
        stalePrevCloseTickers.push(ticker);
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

    const weekRef = weekRefCloseMap.get(ticker);
    const weekChange = (weekRef && currentPrice > 0)
      ? ((currentPrice / weekRef) - 1) * 100
      : undefined;

    const perfFrom = (ref: number | undefined) =>
      (ref && currentPrice > 0) ? ((currentPrice / ref) - 1) * 100 : undefined;
    const monthChange = perfFrom(perfRefs?.month.get(ticker));
    const ytdChange = perfFrom(perfRefs?.ytd.get(ticker));
    const yearChange = perfFrom(perfRefs?.year.get(ticker));

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
      ...(weekChange !== undefined && isFinite(weekChange) ? { weekChange } : {}),
      ...(monthChange !== undefined && isFinite(monthChange) ? { monthChange } : {}),
      ...(ytdChange !== undefined && isFinite(ytdChange) ? { ytdChange } : {}),
      ...(yearChange !== undefined && isFinite(yearChange) ? { yearChange } : {}),
      ...(tickerInfo.healthScore != null ? { healthScore: tickerInfo.healthScore } : {}),
      ...(tickerInfo.valuationScore != null ? { valuationScore: tickerInfo.valuationScore } : {}),
      ...(tickerInfo.profitabilityScore != null ? { profitabilityScore: tickerInfo.profitabilityScore } : {}),
      ...(tickerInfo.piotroskiScore != null ? { piotroskiScore: tickerInfo.piotroskiScore } : {}),
      ...(tickerInfo.altmanZ != null ? { altmanZ: tickerInfo.altmanZ } : {}),
      ...(tickerInfo.beneishScore != null ? { beneishScore: tickerInfo.beneishScore } : {}),
      ...(tickerInfo.fcfMargin != null ? { fcfMargin: tickerInfo.fcfMargin } : {}),
      ...(tickerInfo.latestMoversZScore != null ? { zScore: tickerInfo.latestMoversZScore } : {}),
      ...(tickerInfo.latestMoversRVOL != null ? { rvol: tickerInfo.latestMoversRVOL } : {}),
      ...(tickerInfo.peRatio != null ? { peRatio: tickerInfo.peRatio } : {}),
      ...(tickerInfo.forwardPe != null ? { forwardPe: tickerInfo.forwardPe } : {}),
      ...(tickerInfo.psRatio != null ? { psRatio: tickerInfo.psRatio } : {}),
      ...(tickerInfo.pbRatio != null ? { pbRatio: tickerInfo.pbRatio } : {}),
      ...(tickerInfo.pegRatio != null ? { pegRatio: tickerInfo.pegRatio } : {}),
      ...(tickerInfo.evEbitda != null ? { evEbitda: tickerInfo.evEbitda } : {}),
      ...(tickerInfo.roe != null ? { roe: tickerInfo.roe } : {}),
      ...(tickerInfo.netMargin != null ? { netMargin: tickerInfo.netMargin } : {}),
      ...(tickerInfo.revenueGrowth != null ? { revenueGrowth: tickerInfo.revenueGrowth } : {}),
      ...(tickerInfo.earningsGrowth != null ? { earningsGrowth: tickerInfo.earningsGrowth } : {}),
      ...(tickerInfo.dividendYield != null ? { dividendYield: tickerInfo.dividendYield } : {}),
      ...(tickerInfo.beta != null ? { beta: tickerInfo.beta } : {}),
    });

    processed++;
  }

  // Batch log stale prevClose warnings (single log instead of 800+ individual ones)
  if (stalePrevCloseTickers.length > 0) {
    console.warn(`⚠️ [STALE_PREVCLOSE][heatmap] ${stalePrevCloseTickers.length} tickers with stale latestPrevClose (expected >= ${ctx.lastTradingDayForQuery.toISOString().slice(0, 10)}): ${stalePrevCloseTickers.slice(0, 10).join(', ')}${stalePrevCloseTickers.length > 10 ? ` ... +${stalePrevCloseTickers.length - 10} more` : ''}`);
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
    ...(s.weekChange !== undefined ? { weekChange: s.weekChange } : {}),
    ...(s.monthChange !== undefined ? { monthChange: s.monthChange } : {}),
    ...(s.ytdChange !== undefined ? { ytdChange: s.ytdChange } : {}),
    ...(s.yearChange !== undefined ? { yearChange: s.yearChange } : {}),
    ...(s.healthScore !== undefined ? { healthScore: s.healthScore } : {}),
    ...(s.valuationScore !== undefined ? { valuationScore: s.valuationScore } : {}),
    ...(s.profitabilityScore !== undefined ? { profitabilityScore: s.profitabilityScore } : {}),
    ...(s.piotroskiScore !== undefined ? { piotroskiScore: s.piotroskiScore } : {}),
    ...(s.altmanZ !== undefined ? { altmanZ: s.altmanZ } : {}),
    ...(s.beneishScore !== undefined ? { beneishScore: s.beneishScore } : {}),
    ...(s.fcfMargin !== undefined ? { fcfMargin: s.fcfMargin } : {}),
    ...(s.zScore !== undefined ? { zScore: s.zScore } : {}),
    ...(s.rvol !== undefined ? { rvol: s.rvol } : {}),
    ...(s.peRatio !== undefined ? { peRatio: s.peRatio } : {}),
    ...(s.forwardPe !== undefined ? { forwardPe: s.forwardPe } : {}),
    ...(s.psRatio !== undefined ? { psRatio: s.psRatio } : {}),
    ...(s.pbRatio !== undefined ? { pbRatio: s.pbRatio } : {}),
    ...(s.pegRatio !== undefined ? { pegRatio: s.pegRatio } : {}),
    ...(s.evEbitda !== undefined ? { evEbitda: s.evEbitda } : {}),
    ...(s.roe !== undefined ? { roe: s.roe } : {}),
    ...(s.netMargin !== undefined ? { netMargin: s.netMargin } : {}),
    ...(s.revenueGrowth !== undefined ? { revenueGrowth: s.revenueGrowth } : {}),
    ...(s.earningsGrowth !== undefined ? { earningsGrowth: s.earningsGrowth } : {}),
    ...(s.dividendYield !== undefined ? { dividendYield: s.dividendYield } : {}),
    ...(s.beta !== undefined ? { beta: s.beta } : {}),
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
    w: s.weekChange ?? null,
    m1: s.monthChange ?? null,
    ytd: s.ytdChange ?? null,
    y1: s.yearChange ?? null,
    hs: s.healthScore ?? null,
    vs: s.valuationScore ?? null,
    ps: s.profitabilityScore ?? null,
    pi: s.piotroskiScore ?? null,
    az: s.altmanZ ?? null,
    be: s.beneishScore ?? null,
    fcfm: s.fcfMargin ?? null,
    z: s.zScore ?? null,
    rv: s.rvol ?? null,
    pe: s.peRatio ?? null,
    fpe: s.forwardPe ?? null,
    psr: s.psRatio ?? null,
    pb: s.pbRatio ?? null,
    peg: s.pegRatio ?? null,
    eve: s.evEbitda ?? null,
    roe: s.roe ?? null,
    nm: s.netMargin ?? null,
    rg: s.revenueGrowth ?? null,
    eg: s.earningsGrowth ?? null,
    dy: s.dividendYield ?? null,
    bt: s.beta ?? null,
  }));

  return { payload, rows };
}

/**
 * Polygon historical baseline fetcher (10Y daily -> weekly downsampling, Wilder RSI
 * state, SMAs, Gaussian series) and live/premarket TradingView + DB quote overlay.
 */

import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { TICKER_RENAMES, foreignCutoffMs, spliceContinuous } from '@/lib/tickerRenames';
import { detectSession } from '@/lib/utils/timeUtils';
import {
  computeWilderRsiSeries,
  type TickerBaselineData,
  type LiveTickerQuote,
} from './dipTypesAndMath';

const BASELINE_CACHE_TTL = 12 * 3600; // 12 hours
const LIVE_QUOTES_CACHE_TTL = 45;     // 45 seconds
const MS_DAY = 24 * 60 * 60 * 1000;
const MS_WEEK = 7 * MS_DAY;
const MS_MONDAY_OFFSET = 4 * MS_DAY;

// ============================================================================
// POLYGON DAILY & WEEKLY OHLCV BASELINE FETCHER
// ============================================================================

interface RawAggBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function fetchPolygonDailyBars(symbol: string, years = 10): Promise<RawAggBar[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(toDate.getFullYear() - years);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const fetchRaw = async (sym: string, from: string, to: string): Promise<RawAggBar[]> => {
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.results) ? json.results : [];
  };

  try {
    const aggs = await fetchRaw(symbol, fromStr, toStr);
    if (!aggs.length) return [];

    // Sanitize foreign-instrument history on renamed tickers (e.g. META, FI)
    const cutoffMs = foreignCutoffMs(symbol, aggs);
    if (cutoffMs == null) return aggs.filter((a) => a.c > 0 && a.o > 0);

    const kept = aggs.filter((a) => a.t >= cutoffMs && a.c > 0 && a.o > 0);
    const rename = TICKER_RENAMES[symbol];
    if (!rename?.source || !kept.length) return kept;

    try {
      const toBefore = new Date(kept[0]!.t - MS_DAY).toISOString().slice(0, 10);
      if (toBefore >= fromStr) {
        const src = await fetchRaw(rename.source, fromStr, toBefore);
        const usable = src.filter((a) => a.t < kept[0]!.t && a.c > 0 && a.o > 0);
        const last = usable[usable.length - 1];
        if (last && spliceContinuous(last.c, kept[0]!.c)) {
          return [...usable, ...kept];
        }
      }
    } catch {
      /* fallback to kept */
    }
    return kept;
  } catch (err) {
    console.warn(`[dipEngine] Failed to fetch Polygon daily bars for ${symbol}:`, err);
    return [];
  }
}

/**
 * Fallback to local DB `DailyValuationHistory` when Polygon API key is absent
 * in local dev environment.
 */
async function fetchLocalDbFallbackBars(symbol: string): Promise<RawAggBar[]> {
  try {
    const rows = await prisma.dailyValuationHistory.findMany({
      where: { symbol, closePrice: { not: null, gt: 0 } },
      orderBy: { date: 'asc' },
      select: { date: true, closePrice: true },
    });
    if (!rows.length) return [];
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      select: { avgVolume20d: true, lastVolume: true },
    });
    const defaultVol = ticker?.avgVolume20d || ticker?.lastVolume || 1_000_000;
    return rows.map((r) => {
      const c = r.closePrice!;
      return {
        t: r.date.getTime(),
        o: c,
        h: c * 1.008,
        l: c * 0.992,
        c,
        v: defaultVol,
      };
    });
  } catch {
    return [];
  }
}

function downsampleToWeekly(dailyBars: RawAggBar[]): RawAggBar[] {
  const weekMap = new Map<number, RawAggBar>();
  for (const bar of dailyBars) {
    if (!bar || bar.c <= 0) continue;
    const wk = Math.floor((bar.t - MS_MONDAY_OFFSET) / MS_WEEK);
    const existing = weekMap.get(wk);
    if (!existing) {
      weekMap.set(wk, {
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v || 0,
      });
    } else {
      existing.h = Math.max(existing.h, bar.h);
      existing.l = Math.min(existing.l, bar.l);
      existing.c = bar.c;
      existing.v += bar.v || 0;
    }
  }
  return Array.from(weekMap.values()).sort((a, b) => a.t - b.t);
}

function computeSma(bars: { c: number }[], period: number, endIdx = bars.length - 1): number | null {
  if (endIdx + 1 < period || period <= 0) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    sum += bars[i]!.c;
  }
  return sum / period;
}

export async function getTickerBaseline(symbol: string): Promise<TickerBaselineData | null> {
  const sym = symbol.toUpperCase().trim();
  const cacheKey = `dip:baseline:v2:${sym}`;

  try {
    const cached = await getCachedData(cacheKey);
    if (cached && typeof cached === 'object' && 'symbol' in (cached as object)) {
      return cached as TickerBaselineData;
    }
  } catch {
    /* ignore cache error */
  }

  let dailyBars = await fetchPolygonDailyBars(sym, 10);
  if (dailyBars.length < 20) {
    const dbBars = await fetchLocalDbFallbackBars(sym);
    if (dbBars.length > dailyBars.length) {
      dailyBars = dbBars;
    }
  }

  if (dailyBars.length < 15) {
    return null;
  }

  const n = dailyBars.length;
  const lastBar = dailyBars[n - 1]!;
  const lastBarDateStr = new Date(lastBar.t).toISOString().slice(0, 10);

  const volWindow = dailyBars.slice(Math.max(0, n - 21), n - 1);
  const avgVolume20d =
    volWindow.length > 0
      ? volWindow.reduce((acc, b) => acc + (b.v || 0), 0) / volWindow.length
      : lastBar.v || 1;
  const prevRelVolume = avgVolume20d > 0 ? (lastBar.v || 0) / avgVolume20d : 1;

  const dailySma20 = computeSma(dailyBars, 20);
  const dailySma50 = computeSma(dailyBars, 50);
  const dailySma200 = computeSma(dailyBars, 200);

  const dailySma200DistValues: number[] = [];
  if (n >= 200) {
    let rollingSum = 0;
    for (let i = 0; i < n; i++) {
      rollingSum += dailyBars[i]!.c;
      if (i >= 200) rollingSum -= dailyBars[i - 200]!.c;
      if (i >= 199) {
        const sma200 = rollingSum / 200;
        if (sma200 > 0) {
          dailySma200DistValues.push(((dailyBars[i]!.c / sma200) - 1) * 100);
        }
      }
    }
  }

  const weeklyBars = downsampleToWeekly(dailyBars);
  const nw = weeklyBars.length;
  const weeklySma50 = computeSma(weeklyBars, 50);
  const weeklySma200 = computeSma(weeklyBars, 200);

  const weeklySma200DistValues: number[] = [];
  if (nw >= 200) {
    let rollingSum = 0;
    for (let i = 0; i < nw; i++) {
      rollingSum += weeklyBars[i]!.c;
      if (i >= 200) rollingSum -= weeklyBars[i - 200]!.c;
      if (i >= 199) {
        const wsma200 = rollingSum / 200;
        if (wsma200 > 0) {
          weeklySma200DistValues.push(((weeklyBars[i]!.c / wsma200) - 1) * 100);
        }
      }
    }
  }

  const refHigh = weeklySma50 ?? dailySma50 ?? lastBar.c;
  const refLow = weeklySma200 ?? dailySma200 ?? lastBar.c * 0.72;
  const horizontalSupport = Number(((refHigh * 0.45 + refLow * 0.55)).toFixed(2));

  const dailyRsiFull = computeWilderRsiSeries(dailyBars, 14);
  const weeklyRsiFull = computeWilderRsiSeries(weeklyBars, 14);

  const baseline: TickerBaselineData = {
    symbol: sym,
    computedAt: Date.now(),
    lastBarDateStr,
    prevClose: lastBar.c,
    prevLow: lastBar.l,
    prevHigh: lastBar.h,
    prevOpen: lastBar.o,
    prevVolume: lastBar.v || 0,
    avgVolume20d,
    prevRelVolume,
    dailySma20,
    dailySma50,
    dailySma200,
    weeklySma50,
    weeklySma200,
    horizontalSupport,
    dailyRsiState: {
      currentRsi: dailyRsiFull.currentRsi,
      prevRsi: dailyRsiFull.prevRsi,
      prevAvgGain: dailyRsiFull.prevAvgGain,
      prevAvgLoss: dailyRsiFull.prevAvgLoss,
      lastAvgGain: dailyRsiFull.lastAvgGain,
      lastAvgLoss: dailyRsiFull.lastAvgLoss,
      lastBarTime: dailyRsiFull.lastBarTime,
      lastBarClose: dailyRsiFull.lastBarClose,
      prevBarClose: dailyRsiFull.prevBarClose,
    },
    weeklyRsiState: {
      currentRsi: weeklyRsiFull.currentRsi,
      prevRsi: weeklyRsiFull.prevRsi,
      prevAvgGain: weeklyRsiFull.prevAvgGain,
      prevAvgLoss: weeklyRsiFull.prevAvgLoss,
      lastAvgGain: weeklyRsiFull.lastAvgGain,
      lastAvgLoss: weeklyRsiFull.lastAvgLoss,
      lastBarTime: weeklyRsiFull.lastBarTime,
      lastBarClose: weeklyRsiFull.lastBarClose,
      prevBarClose: weeklyRsiFull.prevBarClose,
    },
    distributions: {
      dailyRsiValues: dailyRsiFull.rsiSeries.map((p) => Number(p.v.toFixed(2))),
      weeklyRsiValues: weeklyRsiFull.rsiSeries.map((p) => Number(p.v.toFixed(2))),
      weeklySma200DistValues: weeklySma200DistValues.map((v) => Number(v.toFixed(2))),
      dailySma200DistValues: dailySma200DistValues.map((v) => Number(v.toFixed(2))),
    },
  };

  try {
    await setCachedData(cacheKey, baseline, BASELINE_CACHE_TTL);
  } catch {
    /* ignore cache error */
  }

  return baseline;
}

// ============================================================================
// LIVE & PREMARKET QUOTE OVERLAY (DB + TradingView Scanner)
// ============================================================================

const TV_SCAN_URL = 'https://scanner.tradingview.com/america/scan';
const TV_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

interface TvQuoteRow {
  close: number | null;
  volume: number | null;
  low: number | null;
  premarketClose: number | null;
  premarketChangePct: number | null;
  premarketVolume: number | null;
  postmarketClose: number | null;
  changePct: number | null;
}

async function fetchTradingViewBatchQuotes(symbols: string[]): Promise<Map<string, TvQuoteRow>> {
  const out = new Map<string, TvQuoteRow>();
  if (!symbols.length) return out;

  try {
    const body = {
      columns: [
        'name',
        'close',
        'volume',
        'low',
        'premarket_close',
        'premarket_change',
        'premarket_volume',
        'postmarket_close',
        'change',
      ],
      markets: ['america'],
      filter: [{ left: 'name', operation: 'in_range', right: symbols }],
    };

    const res = await fetch(TV_SCAN_URL, {
      method: 'POST',
      headers: { 'User-Agent': TV_UA, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 30 },
    });
    if (!res.ok) return out;

    const json = await res.json();
    const rows: { s: string; d: (number | string | null)[] }[] = json?.data ?? [];
    for (const r of rows) {
      const d = r?.d;
      if (!Array.isArray(d) || typeof d[0] !== 'string') continue;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      out.set(d[0].toUpperCase(), {
        close: num(d[1]),
        volume: num(d[2]),
        low: num(d[3]),
        premarketClose: num(d[4]),
        premarketChangePct: num(d[5]),
        premarketVolume: num(d[6]),
        postmarketClose: num(d[7]),
        changePct: num(d[8]),
      });
    }
  } catch {
    /* fallback to DB + baseline */
  }
  return out;
}

export async function getLiveQuotesForSymbols(
  symbols: string[],
  baselines: Map<string, TickerBaselineData>
): Promise<Map<string, LiveTickerQuote>> {
  const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase().trim()))];
  const session = detectSession();
  const out = new Map<string, LiveTickerQuote>();

  const dbTickers = await prisma.ticker
    .findMany({
      where: { symbol: { in: uniqueSymbols } },
      select: {
        symbol: true,
        lastPrice: true,
        lastChangePct: true,
        latestPrevClose: true,
        lastVolume: true,
        avgVolume20d: true,
        latestMoversRVOL: true,
        lastPriceUpdated: true,
      },
    })
    .catch(() => []);

  const dbSessionPrices = await prisma.sessionPrice
    .findMany({
      where: { symbol: { in: uniqueSymbols } },
      orderBy: { lastTs: 'desc' },
      take: uniqueSymbols.length * 3,
      select: {
        symbol: true,
        session: true,
        lastPrice: true,
        changePct: true,
        rvol: true,
        lastTs: true,
      },
    })
    .catch(() => []);

  const tickerBySym = new Map(dbTickers.map((t) => [t.symbol, t]));
  const preSessionBySym = new Map<string, { lastPrice: number; changePct: number }>();
  for (const sp of dbSessionPrices) {
    if (sp.session === 'pre' && !preSessionBySym.has(sp.symbol) && sp.lastPrice > 0) {
      preSessionBySym.set(sp.symbol, { lastPrice: sp.lastPrice, changePct: sp.changePct });
    }
  }

  const tvCacheKey = `dip:tvquotes:v1:${uniqueSymbols.slice().sort().join(',')}`;
  let tvMap = new Map<string, TvQuoteRow>();
  try {
    const cachedTv = await getCachedData(tvCacheKey);
    if (cachedTv && typeof cachedTv === 'object') {
      tvMap = new Map(Object.entries(cachedTv as Record<string, TvQuoteRow>));
    } else {
      tvMap = await fetchTradingViewBatchQuotes(uniqueSymbols);
      if (tvMap.size > 0) {
        await setCachedData(tvCacheKey, Object.fromEntries(tvMap), LIVE_QUOTES_CACHE_TTL);
      }
    }
  } catch {
    tvMap = await fetchTradingViewBatchQuotes(uniqueSymbols);
  }

  for (const sym of uniqueSymbols) {
    const base = baselines.get(sym);
    const dbT = tickerBySym.get(sym);
    const dbPre = preSessionBySym.get(sym);
    const tv = tvMap.get(sym);

    const prevClose =
      (base?.prevClose && base.prevClose > 0 ? base.prevClose : null) ??
      (dbT?.latestPrevClose && dbT.latestPrevClose > 0 ? dbT.latestPrevClose : null) ??
      (tv?.close && tv.close > 0 ? tv.close : 100);

    const prevLow =
      base?.prevLow && base.prevLow > 0 ? base.prevLow : prevClose * 0.985;

    const premarketPrice =
      tv?.premarketClose && tv.premarketClose > 0
        ? tv.premarketClose
        : dbPre?.lastPrice && dbPre.lastPrice > 0
          ? dbPre.lastPrice
          : session === 'pre' && dbT?.lastPrice && dbT.lastPrice > 0
            ? dbT.lastPrice
            : null;

    const regularPrice =
      tv?.close && tv.close > 0
        ? tv.close
        : dbT?.lastPrice && dbT.lastPrice > 0
          ? dbT.lastPrice
          : prevClose;

    const afterHoursPrice =
      tv?.postmarketClose && tv.postmarketClose > 0 ? tv.postmarketClose : null;

    let currentPrice = regularPrice;
    if (session === 'pre' && premarketPrice && premarketPrice > 0) {
      currentPrice = premarketPrice;
    } else if (session === 'after' && afterHoursPrice && afterHoursPrice > 0) {
      currentPrice = afterHoursPrice;
    } else if (dbT?.lastPrice && dbT.lastPrice > 0 && session !== 'closed') {
      currentPrice = dbT.lastPrice;
    }

    const premarketChangePct =
      premarketPrice && prevClose > 0
        ? ((premarketPrice / prevClose) - 1) * 100
        : tv?.premarketChangePct ?? dbPre?.changePct ?? null;

    const dayChangePct =
      prevClose > 0
        ? ((currentPrice / prevClose) - 1) * 100
        : tv?.changePct ?? dbT?.lastChangePct ?? 0;

    const refBottom = Math.min(prevClose, prevLow);
    const reboundFromYesterdayLowPct =
      refBottom > 0 ? ((currentPrice / refBottom) - 1) * 100 : 0;

    const avgVol = base?.avgVolume20d ?? dbT?.avgVolume20d ?? null;
    const rawVol =
      (session === 'pre' ? tv?.premarketVolume : tv?.volume) ??
      tv?.volume ??
      dbT?.lastVolume ??
      base?.prevVolume ??
      0;

    const computedRelVol =
      avgVol && avgVol > 0 && rawVol > 0
        ? rawVol / avgVol
        : dbT?.latestMoversRVOL && dbT.latestMoversRVOL > 0
          ? dbT.latestMoversRVOL
          : base?.prevRelVolume ?? 1.0;

    out.set(sym, {
      symbol: sym,
      currentPrice: Number(currentPrice.toFixed(2)),
      premarketPrice: premarketPrice != null ? Number(premarketPrice.toFixed(2)) : null,
      regularPrice: Number(regularPrice.toFixed(2)),
      afterHoursPrice: afterHoursPrice != null ? Number(afterHoursPrice.toFixed(2)) : null,
      prevClose: Number(prevClose.toFixed(2)),
      prevLow: Number(prevLow.toFixed(2)),
      todayLow: tv?.low != null ? Number(tv.low.toFixed(2)) : null,
      dayChangePct: Number(dayChangePct.toFixed(2)),
      premarketChangePct: premarketChangePct != null ? Number(premarketChangePct.toFixed(2)) : null,
      reboundFromYesterdayLowPct: Number(reboundFromYesterdayLowPct.toFixed(2)),
      volume: Math.round(rawVol),
      avgVolume20d: avgVol ? Math.round(avgVol) : null,
      relVolume: Number(Math.max(0.1, computedRelVol).toFixed(2)),
      session,
      updatedAt: dbT?.lastPriceUpdated?.toISOString() ?? new Date().toISOString(),
    });
  }

  return out;
}

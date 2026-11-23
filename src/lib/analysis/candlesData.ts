import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { prisma } from '@/lib/db/prisma';
import { readCandlesSqliteData, type ReadonlyCandlesDbData } from '@/lib/db/readonlySqlite';
import { TICKER_RENAMES, foreignCutoffMs, spliceContinuous } from '@/lib/tickerRenames';
import { quarterlyEpsSeries, ntmEpsAt } from '@/lib/utils/forwardEps';
import { analyzeFairValueSeries, FAIR_CFG, hasValuationInputs, type FairMethod } from '@/lib/valuation/fairValue';

const CANDLES_FRESH_MS = 3600 * 1000;   // 1 hour fresh window
const CANDLES_STALE_TTL_S = 86400;      // 24 hours Redis retention for SWR
const CANDLES_FALLBACK_TTL_S = 300;     // 5 min when synthesized from DVH fallback
const POLYGON_TIMEOUT_MS = 4500;
const MAX_MEM_CANDLES = 250;
const MS_DAY = 24 * 60 * 60 * 1000;

const SECTOR_ETF: Record<string, string> = {
  'Financial Services': 'XLF',
  'Technology': 'XLK',
  'Healthcare': 'XLV',
  'Industrials': 'XLI',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  'Energy': 'XLE',
  'Basic Materials': 'XLB',
  'Real Estate': 'XLRE',
  'Utilities': 'XLU',
  'Communication Services': 'XLC',
};

interface PolygonAgg {
  t: number; // timestamp (ms)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

export interface Candle {
  t: number; // timestamp (ms, start of week)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** TTM P/E on the candle's close day (DailyValuationHistory) — null outside coverage */
  pe?: number | null;
  /** TTM P/S */
  ps?: number | null;
  /** price ÷ book value per share */
  pb?: number | null;
  /** EV ÷ TTM EBIT (D&A unavailable → EBIT basis, not EBITDA) */
  evEbit?: number | null;
  /** TTM FCF ÷ market cap — decimal, may be negative (cash burn) */
  fcfYield?: number | null;
  /** market cap at this close (USD) */
  mcap?: number | null;
  /** Realized NTM P/E — close ÷ EPS of the four quarters REPORTED AFTER this
   *  week (uses future-known earnings; not a historical consensus estimate).
   *  Ends ~3–4 quarters before today. Null when NTM EPS ≤ 0 or unreported. */
  peFwd?: number | null;
  /** Finnhub consensus forward P/E snapshot stored on this day
   *  (DailyValuationHistory.peForward) — only exists from collection start,
   *  never fabricated backward. */
  peCons?: number | null;
  /** Composite fair value (50 % historical multiple + 50 % FCF DCF), point-in-time.
   *  Null/absent where inputs are missing or the sanity gate trips. */
  fv?: number | null;
  fvBear?: number | null;
  fvBull?: number | null;
  fvMethod?: FairMethod | null;
}

export interface MetricStats {
  median: number;
  p25: number;
  p75: number;
  n: number;
}

export type ValuationMetricKey = 'pe' | 'peFwd' | 'ps' | 'pb' | 'evEbit' | 'fcfYield';

export interface FairValueSummary {
  method: FairMethod;
  asOf: string;
  gated?: boolean;
  skipDcf?: boolean;
  components?: {
    rel: number | null;
    relKind: 'pe' | 'ps' | null;
    relMultiple: number | null;
    relMedian: number | null;
    relPerShare: number | null;
    dcf: number | null;
    fcfPerShare: number | null;
    growth: number | null;
  };
}

export interface CandlesPayload {
  symbol: string;
  candles: Candle[];
  fairValue?: FairValueSummary | null;
  peStats?: MetricStats | null;
  valuationStats?: Partial<Record<ValuationMetricKey, MetricStats>> | null;
  evNetDebt?: number | null;
  fwdPeNow?: number | null;
  fwdPeAsOf?: string | null;
  sector?: string | null;
  sectorEtf?: string | null;
}

type StoredCandlesEntry = CandlesPayload & { _cachedAt?: number };

const memCandlesCache = new Map<string, { payload: CandlesPayload; cachedAt: number }>();
const inflightCandles = new Map<string, Promise<CandlesPayload>>();

function touchMemCandlesCache(symbol: string, payload: CandlesPayload, cachedAt: number) {
  memCandlesCache.delete(symbol);
  memCandlesCache.set(symbol, { payload, cachedAt });
  while (memCandlesCache.size > MAX_MEM_CANDLES) {
    const oldestKey = memCandlesCache.keys().next().value;
    if (!oldestKey) break;
    memCandlesCache.delete(oldestKey);
  }
}

async function fetchDailyAggs(symbol: string, fromStr: string, toStr: string, apiKey: string): Promise<PolygonAgg[]> {
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(POLYGON_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Polygon ${symbol} ${res.status}: ${res.statusText}`);
  return (await res.json()).results ?? [];
}

/**
 * Daily aggs with ticker-reuse contamination removed: bars that belong to a
 * different instrument (the symbol's previous holder) are dropped, and for
 * renamed companies the old ticker's real history is spliced back in so the
 * chart keeps its full depth (META = FB pre-2022-06-09 + META after).
 */
async function fetchSanitizedDailyAggs(symbol: string, fromStr: string, toStr: string, apiKey: string): Promise<PolygonAgg[]> {
  const aggs = await fetchDailyAggs(symbol, fromStr, toStr, apiKey);
  const cutoffMs = foreignCutoffMs(symbol, aggs);
  if (cutoffMs == null) return aggs;

  const kept = aggs.filter((a) => a.t >= cutoffMs && a.c > 0);
  const rename = TICKER_RENAMES[symbol];
  if (!rename?.source || !kept.length) return kept;

  try {
    const toBefore = new Date(kept[0]!.t - MS_DAY).toISOString().slice(0, 10);
    if (toBefore < fromStr) return kept;
    const src = await fetchDailyAggs(rename.source, fromStr, toBefore, apiKey);
    const usable = src.filter((a) => a.t < kept[0]!.t && a.c > 0 && a.o > 0);
    const last = usable[usable.length - 1];
    if (last && spliceContinuous(last.c, kept[0]!.c)) {
      return [...usable, ...kept];
    }
  } catch { /* splice is best-effort — truncate-only is still correct */ }
  return kept;
}

/**
 * Load candles DB annotations using the fast in-process read-only SQLite
 * reader first, falling back to parallel Prisma queries if unavailable (e.g.
 * during tests or mocked environments).
 */
async function loadCandlesDbData(symbol: string, fromDate: Date): Promise<ReadonlyCandlesDbData> {
  const fast = readCandlesSqliteData(symbol, fromDate);
  if (fast) return fast;

  const [valRows, bs, stmts, fm, tickerRow] = await Promise.all([
    prisma.dailyValuationHistory.findMany({
      where: { symbol, date: { gte: fromDate } },
      orderBy: { date: 'asc' },
      select: {
        date: true, closePrice: true, peRatio: true, psRatio: true, pbRatio: true,
        evEbitda: true, fcfYield: true, marketCap: true, peForward: true,
      },
    }).catch(() => []),
    prisma.financialStatement.findFirst({
      where: { symbol, totalDebt: { not: null }, cashAndEquivalents: { not: null } },
      orderBy: { endDate: 'desc' },
      select: { totalDebt: true, cashAndEquivalents: true },
    }).catch(() => null),
    prisma.financialStatement.findMany({
      where: { symbol },
      select: {
        endDate: true, fiscalPeriod: true, fiscalYear: true,
        netIncome: true, sharesOutstanding: true,
      },
    }).catch(() => []),
    prisma.finnhubMetrics.findUnique({
      where: { symbol },
      select: { forwardPe: true, fetchedAt: true },
    }).catch(() => null),
    prisma.ticker.findUnique({
      where: { symbol },
      select: { sector: true },
    }).catch(() => null),
  ]);

  return {
    valRows,
    bs,
    stmts,
    fm,
    sector: tickerRow?.sector ?? null,
  };
}

export class MissingPolygonKeyError extends Error {
  constructor() {
    super('Missing Polygon API key');
    this.name = 'MissingPolygonKeyError';
  }
}

async function buildCandlesPayload(symbol: string): Promise<CandlesPayload> {
  const apiKey = process.env.POLYGON_API_KEY;
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(toDate.getFullYear() - 10);

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const [aggsOutcome, dbData] = await Promise.all([
    apiKey
      ? fetchSanitizedDailyAggs(symbol, fromStr, toStr, apiKey)
          .then((rows) => ({ ok: true as const, rows }))
          .catch((err) => ({ ok: false as const, err }))
      : Promise.resolve({ ok: false as const, err: new MissingPolygonKeyError() }),
    loadCandlesDbData(symbol, fromDate),
  ]);

  let aggs: PolygonAgg[];
  let cacheTtlSeconds = CANDLES_STALE_TTL_S;

  if (aggsOutcome.ok) {
    aggs = aggsOutcome.rows;
  } else {
    const dvhAggs: PolygonAgg[] = dbData.valRows
      .filter((r) => r.closePrice != null && r.closePrice > 0)
      .map((r) => ({
        t: r.date.getTime(),
        o: r.closePrice!,
        h: r.closePrice!,
        l: r.closePrice!,
        c: r.closePrice!,
        v: 0,
      }));
    if (dvhAggs.length > 0) {
      aggs = dvhAggs;
      cacheTtlSeconds = CANDLES_FALLBACK_TTL_S;
    } else {
      throw aggsOutcome.err;
    }
  }

  const cacheKey = `candles:${symbol}`;

  if (!aggs.length) {
    const emptyResponse: CandlesPayload = { symbol, candles: [] };
    const now = Date.now();
    touchMemCandlesCache(symbol, emptyResponse, now);
    try {
      await setCachedData(cacheKey, { ...emptyResponse, _cachedAt: now } satisfies StoredCandlesEntry, 3600);
    } catch {}
    return emptyResponse;
  }

  // Downsample daily → weekly: proper OHLC aggregation
  // open = first trading day's open, high = week max, low = week min,
  // close = last trading day's close, volume = sum, t = first day's timestamp.
  // Epoch weeks are Thursday-anchored — shift by 4d so buckets are
  // Monday–Sunday calendar weeks instead.
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const MS_MONDAY_OFFSET = 4 * 24 * 60 * 60 * 1000;
  type WeekBucket = { t: number; o: number; h: number; l: number; c: number; v: number };
  const weekMap = new Map<number, WeekBucket>();
  for (const agg of aggs) {
    if (!agg || agg.o <= 0) continue;
    const weekKey = Math.floor((agg.t - MS_MONDAY_OFFSET) / MS_WEEK);
    const existing = weekMap.get(weekKey);
    if (!existing) {
      weekMap.set(weekKey, { t: agg.t, o: agg.o, h: agg.h, l: agg.l, c: agg.c, v: agg.v });
    } else {
      existing.h = Math.max(existing.h, agg.h);
      existing.l = Math.min(existing.l, agg.l);
      existing.c = agg.c;   // last trading day's close
      existing.v += agg.v;  // cumulative volume
    }
  }
  const weekly = Array.from(weekMap.values()).sort((a, b) => a.t - b.t);

  const candles: Candle[] = weekly
    .filter((a) => a.o > 0 && a.h > 0 && a.l > 0 && a.c > 0)
    .map((a) => ({
      t: a.t,
      o: parseFloat(a.o.toFixed(2)),
      h: parseFloat(a.h.toFixed(2)),
      l: parseFloat(a.l.toFixed(2)),
      c: parseFloat(a.c.toFixed(2)),
      v: Math.round(a.v),
    }));

  // Attach per-candle valuation multiples + paired DVH closes
  let valuationStats: Partial<Record<ValuationMetricKey, MetricStats>> | null = null;
  let evNetDebt: number | null = null;
  const dvhCloses: (number | null)[] = new Array(candles.length).fill(null);

  try {
    const { valRows, bs } = dbData;
    if (valRows.length) {
      const times = valRows.map((r) => r.date.getTime());
      let vi = 0;
      for (let idx = 0; idx < candles.length; idx++) {
        const c = candles[idx]!;
        const start = c.t - 2 * MS_DAY;
        const end = c.t + 4 * MS_DAY;
        while (vi < times.length && times[vi]! < start) vi++;
        let bestValIdx: number | null = null;
        let fallbackIdx: number | null = null;
        for (let k = vi; k < times.length && times[k]! <= end; k++) {
          fallbackIdx = k;
          if (hasValuationInputs(valRows[k]!)) bestValIdx = k;
        }
        const picked = bestValIdx ?? fallbackIdx;
        if (picked != null) {
          const r = valRows[picked]!;
          c.pe = r.peRatio;
          c.ps = r.psRatio;
          c.pb = r.pbRatio;
          c.evEbit = r.evEbitda;
          c.fcfYield = r.fcfYield;
          c.mcap = r.marketCap;
          c.peCons = r.peForward;
          if (r.closePrice != null && r.closePrice > 0) dvhCloses[idx] = r.closePrice;
        }
      }

      const statsOf = (
        pick: (r: (typeof valRows)[number]) => number | null,
        allowNegative = false,
      ): MetricStats | null => {
        const vals = valRows
          .map(pick)
          .filter((v): v is number => v != null && Number.isFinite(v) && (allowNegative || v > 0))
          .sort((a, b) => a - b);
        if (vals.length < 10) return null;
        const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))]!;
        return { median: q(0.5), p25: q(0.25), p75: q(0.75), n: vals.length };
      };
      valuationStats = {};
      const entries: [ValuationMetricKey, MetricStats | null][] = [
        ['pe', statsOf((r) => r.peRatio)],
        ['ps', statsOf((r) => r.psRatio)],
        ['pb', statsOf((r) => r.pbRatio)],
        ['evEbit', statsOf((r) => r.evEbitda)],
        ['fcfYield', statsOf((r) => r.fcfYield, true)],
      ];
      for (const [k, s] of entries) if (s) valuationStats[k] = s;

      if (bs) evNetDebt = bs.totalDebt! - bs.cashAndEquivalents!;
    }
  } catch { /* valuation overlay is optional — candles still render */ }

  // Realized NTM P/E + Finnhub consensus forward P/E snapshot
  let fwdPeNow: number | null = null;
  let fwdPeAsOf: string | null = null;
  try {
    const { stmts, fm } = dbData;
    if (fm?.forwardPe != null && fm.forwardPe > 0) {
      fwdPeNow = fm.forwardPe;
      fwdPeAsOf = fm.fetchedAt.toISOString().slice(0, 10);
    }
    if (stmts.length) {
      const quarters = quarterlyEpsSeries(stmts);
      for (const c of candles) {
        const ntm = ntmEpsAt(quarters, c.t + 4 * MS_DAY);
        if (ntm != null && ntm > 0) c.peFwd = parseFloat((c.c / ntm).toFixed(2));
      }
      const fwdVals = candles
        .map((c) => c.peFwd)
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      if (fwdVals.length >= 10) {
        const q = (p: number) => fwdVals[Math.min(fwdVals.length - 1, Math.floor(fwdVals.length * p))]!;
        valuationStats ??= {};
        valuationStats.peFwd = { median: q(0.5), p25: q(0.25), p75: q(0.75), n: fwdVals.length };
      }
    }
  } catch { /* NTM overlay is optional */ }

  const sector = dbData.sector ?? null;
  const sectorEtf = (sector && SECTOR_ETF[sector]) || null;

  let fairValue: FairValueSummary | null = null;
  try {
    const skipDcf = sector === 'Financial Services';
    const fvSeriesInput = candles.map((c, idx) => ({
      t: c.t,
      c: dvhCloses[idx] ?? c.c,
      pe: c.pe ?? null,
      ps: c.ps ?? null,
      fcfYield: c.fcfYield ?? null,
    }));
    const fv = analyzeFairValueSeries(fvSeriesInput, { ...FAIR_CFG, skipDcf });
    const byT = new Map(fv.points.map((p) => [p.t, p]));
    for (const c of candles) {
      const p = byT.get(c.t);
      if (p) {
        c.fv = p.base;
        c.fvBear = p.bear;
        c.fvBull = p.bull;
        c.fvMethod = p.method;
      }
    }
    const last = fv.points[fv.points.length - 1];
    if (last || fv.latestGated) {
      const asOfT = fv.latestAsOfT ?? (fv.latestGated ? (candles[candles.length - 1]?.t ?? last?.t) : last?.t);
      const method = fv.latestGated ? (fv.latestMethod ?? last?.method) : (last?.method ?? fv.latestMethod);
      const comp = fv.latestComponents;
      const round2 = (v: number | null) => (v != null && Number.isFinite(v) ? +v.toFixed(2) : null);
      if (asOfT != null && method) {
        fairValue = {
          method,
          asOf: new Date(asOfT).toISOString().slice(0, 10),
          ...(fv.latestGated ? { gated: true } : {}),
          ...(skipDcf ? { skipDcf: true } : {}),
          ...(comp
            ? {
                components: {
                  rel: round2(comp.relBase),
                  relKind: comp.relKind,
                  relMultiple: comp.relMultiple != null ? +comp.relMultiple.toFixed(1) : null,
                  relMedian: comp.relMedian != null ? +comp.relMedian.toFixed(1) : null,
                  relPerShare: round2(comp.relPerShare),
                  dcf: round2(comp.dcfBase),
                  fcfPerShare: round2(comp.fcfPerShare),
                  growth: comp.growth != null ? +comp.growth.toFixed(4) : null,
                },
              }
            : {}),
        };
      }
    }
  } catch { /* fair value overlay is optional */ }

  const responseBody: CandlesPayload = {
    symbol,
    candles,
    fairValue,
    // Back-compat alias — the deployed P/E view reads peStats; the new
    // multi-metric view reads valuationStats.
    peStats: valuationStats?.pe ?? null,
    valuationStats,
    evNetDebt,
    fwdPeNow,
    fwdPeAsOf,
    sector,
    sectorEtf,
  };

  const now = Date.now();
  touchMemCandlesCache(symbol, responseBody, now);
  try {
    await setCachedData(
      cacheKey,
      { ...responseBody, _cachedAt: now } satisfies StoredCandlesEntry,
      cacheTtlSeconds,
    );
  } catch {}

  return responseBody;
}

function refreshCandlesSingleFlight(symbol: string): Promise<CandlesPayload> {
  const existing = inflightCandles.get(symbol);
  if (existing) return existing;

  const promise = buildCandlesPayload(symbol).finally(() => {
    inflightCandles.delete(symbol);
  });
  inflightCandles.set(symbol, promise);
  return promise;
}

/**
 * Returns ~10 years of weekly OHLC candles + valuation overlays for `symbolInput`.
 * Uses in-memory + Redis Stale-While-Revalidate caching with single-flight
 * deduplication and fast read-only SQLite access.
 */
export async function getCandlesPayload(symbolInput: string): Promise<CandlesPayload> {
  const symbol = symbolInput.toUpperCase();

  const mem = memCandlesCache.get(symbol);
  if (mem) {
    touchMemCandlesCache(symbol, mem.payload, mem.cachedAt);
    if (Date.now() - mem.cachedAt > CANDLES_FRESH_MS) {
      void refreshCandlesSingleFlight(symbol).catch(() => {});
    }
    return mem.payload;
  }

  const cacheKey = `candles:${symbol}`;
  try {
    const raw = (await getCachedData(cacheKey)) as StoredCandlesEntry | null;
    if (raw && Array.isArray(raw.candles)) {
      const { _cachedAt, ...payload } = raw;
      const effectiveCachedAt = typeof _cachedAt === 'number' ? _cachedAt : Date.now() - CANDLES_FRESH_MS - 1;
      touchMemCandlesCache(symbol, payload, effectiveCachedAt);
      if (Date.now() - effectiveCachedAt > CANDLES_FRESH_MS) {
        void refreshCandlesSingleFlight(symbol).catch(() => {});
      }
      return payload;
    }
  } catch {}

  return await refreshCandlesSingleFlight(symbol);
}

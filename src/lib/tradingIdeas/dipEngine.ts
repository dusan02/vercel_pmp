/**
 * Trading Ideas (Long / Dip-Buying Engine)
 *
 * Contrarian mathematical & decision engine for timing entries in sharp
 * capitulations across stocks, index ETFs, and leveraged ETFs (Master -> Slave).
 *
 * Architecture:
 * 1. EOD / Historical Baseline (cached 12h in Redis `dip:baseline:v2:{symbol}`):
 *    - Fetches 10Y daily OHLCV from Polygon `/v2/aggs/ticker/{symbol}/range/1/day/...`
 *    - Downsamples to Monday-anchored Weekly OHLCV candles
 *    - Computes Wilder's Daily RSI (14) & Weekly RSI (14) + saves Wilder state
 *      (avgGain13, avgLoss13) so intraday/premarket RSI updates in <1ms
 *    - Computes Daily SMA 20/50/200, Weekly SMA 50/200, structural horizontal support,
 *      Avg Volume (20), and Gaussian distribution parameters (mean μ, stdDev σ, min, max)
 *      across multiple metrics (Daily RSI, Weekly RSI, Weekly SMA 200 distance %,
 *      Daily SMA 200 distance %, and P/E ratio when available).
 *
 * 2. Live / Premarket Overlay (cached 45s in Redis):
 *    - Merges DB (`Ticker`, `SessionPrice`, `DailyRef`) with real-time TradingView
 *      Scanner overlay (`premarket_close`, `close`, `postmarket_close`, `low`, `volume`)
 *      and Polygon Snapshot fallback so ETFs outside the S&P 500 universe (`SOXX`, `SOXL`,
 *      `QQQ`, `TQQQ`, `MSFL`, `KMLI`, `NFLU`) always have live premarket & regular data.
 */

import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { TICKER_RENAMES, foreignCutoffMs, spliceContinuous } from '@/lib/tickerRenames';
import { detectSession } from '@/lib/utils/timeUtils';

const BASELINE_CACHE_TTL = 12 * 3600; // 12 hours
const LIVE_QUOTES_CACHE_TTL = 45;     // 45 seconds
const MS_DAY = 24 * 60 * 60 * 1000;
const MS_WEEK = 7 * MS_DAY;
const MS_MONDAY_OFFSET = 4 * MS_DAY;

// ============================================================================
// 1. MASTER -> SLAVE LEVERAGED ETF REGISTRY
// ============================================================================

export interface MasterSlavePairConfig {
  masterSymbol: string;
  masterName: string;
  slaveSymbol: string | null;
  slaveName: string | null;
  leverage: 1 | 2 | 3;
  inverseSymbol: string | null;
  inverseLeverage: 1 | 2 | 3 | null;
  category: 'Index ETF' | 'Sector ETF' | 'Big Tech' | 'Growth / Tech';
  defaultRsiMean?: number;
  defaultRsiStdDev?: number;
}

export const MASTER_SLAVE_PAIRS: MasterSlavePairConfig[] = [
  {
    masterSymbol: 'SOXX',
    masterName: 'iShares Semiconductor ETF',
    slaveSymbol: 'SOXL',
    slaveName: 'Direxion Daily Semiconductor Bull 3X',
    leverage: 3,
    inverseSymbol: 'SOXS',
    inverseLeverage: 3,
    category: 'Sector ETF',
    defaultRsiMean: 53.2,
    defaultRsiStdDev: 12.6,
  },
  {
    masterSymbol: 'QQQ',
    masterName: 'Invesco QQQ Trust (Nasdaq-100)',
    slaveSymbol: 'TQQQ',
    slaveName: 'ProShares UltraPro QQQ 3X',
    leverage: 3,
    inverseSymbol: 'SQQQ',
    inverseLeverage: 3,
    category: 'Index ETF',
    defaultRsiMean: 54.5,
    defaultRsiStdDev: 12.2,
  },
  {
    masterSymbol: 'SPY',
    masterName: 'SPDR S&P 500 ETF Trust',
    slaveSymbol: 'UPRO',
    slaveName: 'ProShares UltraPro S&P 500 3X',
    leverage: 3,
    inverseSymbol: 'SPXU',
    inverseLeverage: 3,
    category: 'Index ETF',
    defaultRsiMean: 54.8,
    defaultRsiStdDev: 11.8,
  },
  {
    masterSymbol: 'MSFT',
    masterName: 'Microsoft Corporation',
    slaveSymbol: 'MSFL',
    slaveName: 'GraniteShares 2x Long MSFT Daily ETF',
    leverage: 2,
    inverseSymbol: 'MSFD',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 53.8,
    defaultRsiStdDev: 12.8,
  },
  {
    masterSymbol: 'MELI',
    masterName: 'MercadoLibre, Inc.',
    slaveSymbol: 'KMLI',
    slaveName: 'KraneShares 2x Long MELI Daily ETF',
    leverage: 2,
    inverseSymbol: 'SQQQ',
    inverseLeverage: 3,
    category: 'Growth / Tech',
    defaultRsiMean: 52.5,
    defaultRsiStdDev: 13.5,
  },
  {
    masterSymbol: 'NFLX',
    masterName: 'Netflix, Inc.',
    slaveSymbol: 'NFLU',
    slaveName: 'T-Rex 2X Long NFLX Daily Target ETF',
    leverage: 2,
    inverseSymbol: 'NFXL',
    inverseLeverage: 1,
    category: 'Growth / Tech',
    defaultRsiMean: 53.0,
    defaultRsiStdDev: 13.4,
  },
  {
    masterSymbol: 'NVDA',
    masterName: 'NVIDIA Corporation',
    slaveSymbol: 'NVDL',
    slaveName: 'GraniteShares 2x Long NVDA Daily ETF',
    leverage: 2,
    inverseSymbol: 'NVDD',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 55.2,
    defaultRsiStdDev: 13.8,
  },
  {
    masterSymbol: 'TSLA',
    masterName: 'Tesla, Inc.',
    slaveSymbol: 'TSLL',
    slaveName: 'Direxion Daily TSLA Bull 2X Shares',
    leverage: 2,
    inverseSymbol: 'TSLS',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 51.5,
    defaultRsiStdDev: 14.5,
  },
  {
    masterSymbol: 'AMZN',
    masterName: 'Amazon.com, Inc.',
    slaveSymbol: 'AMZU',
    slaveName: 'Direxion Daily AMZN Bull 2X Shares',
    leverage: 2,
    inverseSymbol: 'AMZD',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 53.0,
    defaultRsiStdDev: 13.0,
  },
  {
    masterSymbol: 'META',
    masterName: 'Meta Platforms, Inc.',
    slaveSymbol: 'FBL',
    slaveName: 'GraniteShares 2x Long META Daily ETF',
    leverage: 2,
    inverseSymbol: 'METD',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 53.4,
    defaultRsiStdDev: 13.6,
  },
  {
    masterSymbol: 'GOOGL',
    masterName: 'Alphabet Inc.',
    slaveSymbol: 'GGLL',
    slaveName: 'Direxion Daily GOOGL Bull 2X Shares',
    leverage: 2,
    inverseSymbol: 'GGLS',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 53.3,
    defaultRsiStdDev: 12.9,
  },
  {
    masterSymbol: 'AMD',
    masterName: 'Advanced Micro Devices, Inc.',
    slaveSymbol: 'AMDL',
    slaveName: 'GraniteShares 2x Long AMD Daily ETF',
    leverage: 2,
    inverseSymbol: 'AMDS',
    inverseLeverage: 1,
    category: 'Growth / Tech',
    defaultRsiMean: 51.8,
    defaultRsiStdDev: 14.1,
  },
  {
    masterSymbol: 'AVGO',
    masterName: 'Broadcom Inc.',
    slaveSymbol: 'AVL',
    slaveName: 'Direxion Daily AVGO Bull 2X Shares',
    leverage: 2,
    inverseSymbol: 'AVS',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 54.6,
    defaultRsiStdDev: 13.1,
  },
  {
    masterSymbol: 'AAPL',
    masterName: 'Apple Inc.',
    slaveSymbol: 'AAPU',
    slaveName: 'Direxion Daily AAPL Bull 2X Shares',
    leverage: 2,
    inverseSymbol: 'AAPD',
    inverseLeverage: 1,
    category: 'Big Tech',
    defaultRsiMean: 54.0,
    defaultRsiStdDev: 12.7,
  },
];

const BY_MASTER = new Map<string, MasterSlavePairConfig>(
  MASTER_SLAVE_PAIRS.map((p) => [p.masterSymbol, p])
);
const BY_SLAVE = new Map<string, MasterSlavePairConfig>(
  MASTER_SLAVE_PAIRS.filter((p) => p.slaveSymbol).map((p) => [p.slaveSymbol!, p])
);

// Handle GOOG -> GOOGL alias
BY_MASTER.set('GOOG', {
  ...BY_MASTER.get('GOOGL')!,
  masterSymbol: 'GOOG',
});

export function resolvePairConfig(symbol: string): {
  config: MasterSlavePairConfig;
  queriedRole: 'master' | 'slave';
} {
  const sym = symbol.toUpperCase().trim();
  const asMaster = BY_MASTER.get(sym);
  if (asMaster) {
    return { config: asMaster, queriedRole: 'master' };
  }
  const asSlave = BY_SLAVE.get(sym);
  if (asSlave) {
    return { config: asSlave, queriedRole: 'slave' };
  }
  return {
    config: {
      masterSymbol: sym,
      masterName: sym,
      slaveSymbol: null,
      slaveName: null,
      leverage: 1,
      inverseSymbol: 'SQQQ',
      inverseLeverage: 3,
      category: 'Growth / Tech',
      defaultRsiMean: 53.0,
      defaultRsiStdDev: 12.5,
    },
    queriedRole: 'master',
  };
}

// ============================================================================
// 2. MATHEMATICAL HELPERS (Wilder RSI, Gaussian Normal CDF, Z-Score)
// ============================================================================

/**
 * Standard normal cumulative distribution function Φ(z) = P(Z <= z)
 * using Abramowitz & Stegun 7.1.26 approximation (max error 1.5e-7).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return 0.5;
  if (z < -8) return 0;
  if (z > 8) return 1;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal probability density function φ(z)
 */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

export interface WilderRsiState {
  currentRsi: number | null;
  prevRsi: number | null;
  /** Wilder avgGain BEFORE the very last bar (so we can recompute the last bar live) */
  prevAvgGain: number | null;
  prevAvgLoss: number | null;
  /** Last completed bar's avgGain and avgLoss (used when appending a new day) */
  lastAvgGain: number | null;
  lastAvgLoss: number | null;
  lastBarTime: number | null;
  lastBarClose: number | null;
  prevBarClose: number | null;
  /** Full historical RSI series for Gaussian statistics */
  rsiSeries: { t: number; v: number }[];
}

/**
 * Compute Wilder's 14-period RSI over an ascending series of bars.
 * Returns both the full historical RSI series and the Wilder smoothing state
 * so a live/premarket price can update the latest RSI without re-fetching.
 */
export function computeWilderRsiSeries(
  bars: { t: number; c: number }[],
  period = 14
): WilderRsiState {
  const n = bars.length;
  if (n <= period) {
    return {
      currentRsi: null,
      prevRsi: null,
      prevAvgGain: null,
      prevAvgLoss: null,
      lastAvgGain: null,
      lastAvgLoss: null,
      lastBarTime: bars[n - 1]?.t ?? null,
      lastBarClose: bars[n - 1]?.c ?? null,
      prevBarClose: bars[n - 2]?.c ?? null,
      rsiSeries: [],
    };
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i]!.c - bars[i - 1]!.c;
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiFrom = (g: number, l: number) =>
    l === 0 ? 100 : 100 - 100 / (1 + g / l);

  const rsiSeries: { t: number; v: number }[] = [
    { t: bars[period]!.t, v: rsiFrom(avgGain, avgLoss) },
  ];

  let prevAvgGain = avgGain;
  let prevAvgLoss = avgLoss;

  for (let i = period + 1; i < n; i++) {
    prevAvgGain = avgGain;
    prevAvgLoss = avgLoss;
    const diff = bars[i]!.c - bars[i - 1]!.c;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsiSeries.push({ t: bars[i]!.t, v: rsiFrom(avgGain, avgLoss) });
  }

  const currentRsi = rsiSeries[rsiSeries.length - 1]?.v ?? null;
  const prevRsi = rsiSeries.length >= 2 ? rsiSeries[rsiSeries.length - 2]!.v : null;

  return {
    currentRsi,
    prevRsi,
    prevAvgGain,
    prevAvgLoss,
    lastAvgGain: avgGain,
    lastAvgLoss: avgLoss,
    lastBarTime: bars[n - 1]!.t,
    lastBarClose: bars[n - 1]!.c,
    prevBarClose: bars[n - 2]?.c ?? null,
    rsiSeries,
  };
}

/**
 * Dynamically projects Wilder RSI (14) given a fresh live/premarket price.
 * If the live price belongs to a NEW trading day after `lastBarTime`, it steps
 * forward from `lastAvgGain`/`lastAvgLoss` and `lastBarClose`.
 * If `lastBarTime` is already today's bar, it replaces today's bar using
 * `prevAvgGain`/`prevAvgLoss` and `prevBarClose`.
 */
export function computeLiveRsiFromState(
  state: Omit<WilderRsiState, 'rsiSeries'>,
  livePrice: number | null,
  isNewBarAfterLast: boolean,
  period = 14
): number | null {
  if (!livePrice || livePrice <= 0) return state.currentRsi;
  if (state.lastAvgGain == null || state.lastAvgLoss == null || state.lastBarClose == null) {
    return state.currentRsi;
  }

  const baseGain = isNewBarAfterLast ? state.lastAvgGain : (state.prevAvgGain ?? state.lastAvgGain);
  const baseLoss = isNewBarAfterLast ? state.lastAvgLoss : (state.prevAvgLoss ?? state.lastAvgLoss);
  const refClose = isNewBarAfterLast ? state.lastBarClose : (state.prevBarClose ?? state.lastBarClose);

  const diff = livePrice - refClose;
  const gain = diff > 0 ? diff : 0;
  const loss = diff < 0 ? -diff : 0;

  const avgGain = (baseGain * (period - 1) + gain) / period;
  const avgLoss = (baseLoss * (period - 1) + loss) / period;

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * Estimate what price a ticker needs to reach today so that its Wilder RSI (14)
 * equals `targetRsi` (e.g. RSI = 26 or 23 or 20).
 */
export function solvePriceForTargetRsi(
  state: Omit<WilderRsiState, 'rsiSeries'>,
  targetRsi: number,
  currentPrice: number
): number {
  if (
    state.lastAvgGain == null ||
    state.lastAvgLoss == null ||
    state.lastBarClose == null ||
    targetRsi <= 1 ||
    targetRsi >= 99
  ) {
    return currentPrice * 0.92;
  }
  // RS_target = targetRsi / (100 - targetRsi)
  // If price drops by L (loss > 0, gain = 0):
  // newAvgGain = lastAvgGain * 13 / 14
  // newAvgLoss = (lastAvgLoss * 13 + L) / 14
  // RS_target = newAvgGain / newAvgLoss => (lastAvgLoss * 13 + L) = (lastAvgGain * 13) / RS_target
  const rsTarget = targetRsi / (100 - targetRsi);
  const requiredLoss = (state.lastAvgGain * 13) / rsTarget - state.lastAvgLoss * 13;
  if (requiredLoss > 0) {
    const targetPx = state.lastBarClose - requiredLoss;
    return Math.max(currentPrice * 0.55, Math.min(currentPrice * 0.99, targetPx));
  }
  return currentPrice;
}

export type GaussianZone =
  | 'EXTREME_BOTTOM'        // < 0.3 % (RSI <= 20, Z <= -2.6σ)
  | 'DEEP_OVERSOLD'         // < 0.8 % (RSI <= 23, Z <= -2.4σ)
  | 'CAPITULATION_1'        // < 2.0 % (RSI <= 27, Z <= -2.1σ)
  | 'APPROACHING_OVERSOLD'  // RSI 27 - 32
  | 'NEUTRAL'               // RSI 32 - 70 (~88% of days)
  | 'WARM'                  // RSI 70 - 78
  | 'EUPHORIA';             // > 98.5 % (RSI >= 78, Z >= +2.0σ)

export interface GaussianDistributionStats {
  metricKey: 'dailyRsi' | 'weeklyRsi' | 'weeklySma200Dist' | 'dailySma200Dist' | 'peRatio';
  label: string;
  unit: string;
  currentValue: number | null;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  sampleSize: number;
  zScore: number | null;
  /** Cumulative probability from the left in % (0 to 100) via Normal CDF Φ(Z) */
  gaussianPercentile: number | null;
  /** Empirical percentile in % (0 to 100) from actual historical observations */
  empiricalPercentile: number | null;
  zone: GaussianZone;
  zoneLabelSk: string;
  /** Threshold values at key sigma levels for bell-curve markers */
  thresholds: {
    neg2_6Sigma: number; // ~0.3-0.5% left tail (3rd tranche)
    neg2_4Sigma: number; // ~0.8% left tail (2nd tranche)
    neg2_1Sigma: number; // ~1.8-2.0% left tail (1st tranche)
    neg1_0Sigma: number;
    mean: number;
    pos1_0Sigma: number;
    pos2_0Sigma: number; // ~98.5% right tail (Take profit / Hedge)
  };
}

export function buildGaussianStats(
  metricKey: GaussianDistributionStats['metricKey'],
  label: string,
  unit: string,
  values: number[],
  currentValue: number | null,
  fallbackMean = 53.0,
  fallbackStdDev = 12.5,
  isRsiMetric = true
): GaussianDistributionStats {
  const clean = values.filter((v) => Number.isFinite(v));
  const n = clean.length;

  let mean = fallbackMean;
  let stdDev = fallbackStdDev;
  let min = isRsiMetric ? 14 : -35;
  let max = isRsiMetric ? 86 : 65;

  if (n >= 30) {
    mean = clean.reduce((a, b) => a + b, 0) / n;
    const variance = clean.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;
    stdDev = Math.max(isRsiMetric ? 6.0 : 1.0, Math.sqrt(variance));
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of clean) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min = lo;
    max = hi;
  }

  const zScore =
    currentValue != null && Number.isFinite(currentValue) && stdDev > 0
      ? (currentValue - mean) / stdDev
      : null;

  const gaussianPercentile = zScore != null ? normalCdf(zScore) * 100 : null;

  let empiricalPercentile: number | null = null;
  if (currentValue != null && n >= 10) {
    const belowCount = clean.filter((v) => v <= currentValue).length;
    empiricalPercentile = (belowCount / n) * 100;
  }

  // Classify zone using both RSI thresholds and Gaussian Z-score / percentile
  let zone: GaussianZone = 'NEUTRAL';
  let zoneLabelSk = 'Neutral Zone (Hold / Wait)';

  if (currentValue != null && zScore != null && gaussianPercentile != null) {
    if (isRsiMetric) {
      if (currentValue <= 20 || zScore <= -2.6 || gaussianPercentile <= 0.35) {
        zone = 'EXTREME_BOTTOM';
        zoneLabelSk = 'Generational Bottom (< 0.3% · 3rd Tranche Buy)';
      } else if (currentValue <= 23 || zScore <= -2.4 || gaussianPercentile <= 0.85) {
        zone = 'DEEP_OVERSOLD';
        zoneLabelSk = 'Deep Oversold (< 0.8% · 2nd Tranche Buy)';
      } else if (currentValue <= 27 || zScore <= -2.1 || gaussianPercentile <= 2.05) {
        zone = 'CAPITULATION_1';
        zoneLabelSk = '1st Capitulation Wave (< 2.0% · 1st Tranche Buy)';
      } else if (currentValue <= 32 || zScore <= -1.65) {
        zone = 'APPROACHING_OVERSOLD';
        zoneLabelSk = 'Approaching Capitulation (Prepare Limit Buy)';
      } else if (currentValue >= 78 || zScore >= 2.0 || gaussianPercentile >= 98.5) {
        zone = 'EUPHORIA';
        zoneLabelSk = 'Extreme Euphoria (> 98.5% · Take Profit / Tax Hedge)';
      } else if (currentValue >= 70 || zScore >= 1.4) {
        zone = 'WARM';
        zoneLabelSk = 'Overheated Zone (Caution)';
      }
    } else {
      // Non-RSI metric (e.g., Weekly SMA 200 distance % or P/E ratio)
      if (zScore <= -2.5) {
        zone = 'EXTREME_BOTTOM';
        zoneLabelSk = 'Extreme Left Tail (< 0.6% tail)';
      } else if (zScore <= -2.0) {
        zone = 'DEEP_OVERSOLD';
        zoneLabelSk = 'Deep Left Tail (< 2.3% tail)';
      } else if (zScore <= -1.5) {
        zone = 'CAPITULATION_1';
        zoneLabelSk = 'Significant Downside Deviation (≤ -1.5σ)';
      } else if (zScore <= -1.0) {
        zone = 'APPROACHING_OVERSOLD';
        zoneLabelSk = 'Below Historical Mean (-1.0σ to -1.5σ)';
      } else if (zScore >= 2.0) {
        zone = 'EUPHORIA';
        zoneLabelSk = 'Extreme Right Tail (≥ +2.0σ)';
      } else if (zScore >= 1.3) {
        zone = 'WARM';
        zoneLabelSk = 'Above Historical Mean (+1.3σ to +2.0σ)';
      }
    }
  }

  return {
    metricKey,
    label,
    unit,
    currentValue: currentValue != null ? Number(currentValue.toFixed(2)) : null,
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    sampleSize: n,
    zScore: zScore != null ? Number(zScore.toFixed(2)) : null,
    gaussianPercentile: gaussianPercentile != null ? Number(gaussianPercentile.toFixed(2)) : null,
    empiricalPercentile: empiricalPercentile != null ? Number(empiricalPercentile.toFixed(2)) : null,
    zone,
    zoneLabelSk,
    thresholds: {
      neg2_6Sigma: Number((isRsiMetric ? Math.min(20, mean - 2.6 * stdDev) : mean - 2.6 * stdDev).toFixed(1)),
      neg2_4Sigma: Number((isRsiMetric ? Math.min(23, mean - 2.4 * stdDev) : mean - 2.4 * stdDev).toFixed(1)),
      neg2_1Sigma: Number((isRsiMetric ? Math.min(27, mean - 2.1 * stdDev) : mean - 2.1 * stdDev).toFixed(1)),
      neg1_0Sigma: Number((mean - 1.0 * stdDev).toFixed(1)),
      mean: Number(mean.toFixed(1)),
      pos1_0Sigma: Number((mean + 1.0 * stdDev).toFixed(1)),
      pos2_0Sigma: Number((isRsiMetric ? Math.max(78, mean + 2.0 * stdDev) : mean + 2.0 * stdDev).toFixed(1)),
    },
  };
}

// ============================================================================
// 3. POLYGON DAILY & WEEKLY OHLCV BASELINE FETCHER
// ============================================================================

interface RawAggBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface TickerBaselineData {
  symbol: string;
  computedAt: number;
  lastBarDateStr: string;
  prevClose: number;
  prevLow: number;
  prevHigh: number;
  prevOpen: number;
  prevVolume: number;
  avgVolume20d: number;
  prevRelVolume: number;
  dailySma20: number | null;
  dailySma50: number | null;
  dailySma200: number | null;
  weeklySma50: number | null;
  weeklySma200: number | null;
  /** Structural horizontal support between Weekly SMA 50 and Weekly SMA 200 */
  horizontalSupport: number | null;
  dailyRsiState: {
    currentRsi: number | null;
    prevRsi: number | null;
    prevAvgGain: number | null;
    prevAvgLoss: number | null;
    lastAvgGain: number | null;
    lastAvgLoss: number | null;
    lastBarTime: number | null;
    lastBarClose: number | null;
    prevBarClose: number | null;
  };
  weeklyRsiState: {
    currentRsi: number | null;
    prevRsi: number | null;
    prevAvgGain: number | null;
    prevAvgLoss: number | null;
    lastAvgGain: number | null;
    lastAvgLoss: number | null;
    lastBarTime: number | null;
    lastBarClose: number | null;
    prevBarClose: number | null;
  };
  /** Pre-aggregated historical values for Gaussian curves */
  distributions: {
    dailyRsiValues: number[];
    weeklyRsiValues: number[];
    weeklySma200DistValues: number[];
    dailySma200DistValues: number[];
  };
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

  // Avg Volume (20) over the 20 bars preceding or including the last completed day
  const volWindow = dailyBars.slice(Math.max(0, n - 21), n - 1);
  const avgVolume20d =
    volWindow.length > 0
      ? volWindow.reduce((acc, b) => acc + (b.v || 0), 0) / volWindow.length
      : lastBar.v || 1;
  const prevRelVolume = avgVolume20d > 0 ? (lastBar.v || 0) / avgVolume20d : 1;

  // Daily SMAs
  const dailySma20 = computeSma(dailyBars, 20);
  const dailySma50 = computeSma(dailyBars, 50);
  const dailySma200 = computeSma(dailyBars, 200);

  // Historical Daily SMA 200 distance (%) distribution
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

  // Weekly bars & Weekly SMAs + Weekly RSI (14)
  const weeklyBars = downsampleToWeekly(dailyBars);
  const nw = weeklyBars.length;
  const weeklySma50 = computeSma(weeklyBars, 50);
  const weeklySma200 = computeSma(weeklyBars, 200);

  // Historical Weekly SMA 200 distance (%) distribution
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

  // Structural horizontal support between Weekly SMA 50 and Weekly SMA 200
  // (or ~15% below Weekly SMA 50 / current price when Weekly SMA 200 is far below)
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
// 4. LIVE & PREMARKET QUOTE OVERLAY (DB + TradingView Scanner + Polygon)
// ============================================================================

export interface LiveTickerQuote {
  symbol: string;
  currentPrice: number;
  premarketPrice: number | null;
  regularPrice: number | null;
  afterHoursPrice: number | null;
  prevClose: number;
  prevLow: number;
  todayLow: number | null;
  dayChangePct: number;
  premarketChangePct: number | null;
  reboundFromYesterdayLowPct: number;
  volume: number;
  avgVolume20d: number | null;
  relVolume: number;
  session: 'pre' | 'live' | 'after' | 'closed';
  updatedAt: string;
}

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

  // 1. Query local DB (`Ticker` and latest `SessionPrice`)
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

  // 2. Fetch real-time TradingView overlay (cached 45s per symbol set)
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

  // 3. Merge baseline + DB + TradingView into unified LiveTickerQuote
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

    // Rebound from yesterday's low (or yesterday's close if lower) — key for Anti-FOMO Semafor
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

// ============================================================================
// 5. PREMARKET ANTI-FOMO SEMAFOR & DECISION ENGINE
// ============================================================================

export type SemaforStatus =
  | 'BUY_TRANCHE_1'              // 🟢 KÚPIŤ 1. TRANŽU (Market/Limit)
  | 'WAIT_RETEST'                // 🟡 ČAKAŤ NA RETEST (Limit Buy - Anti-FOMO)
  | 'BROKEN_200W_NO_CAPITULATION'// 🟠 POZOR: PRERAZENÝ 200W SMA BEZ KAPITULÁCIE
  | 'TAKE_PROFIT_HEDGE'          // 🔴 VYBRAŤ ZISK / HEDŽOVAŤ
  | 'WATCH_APPROACHING'          // 🔵 SLEDOVAŤ: BLÍŽI SA K 1. VLNE KAPITULÁCIE
  | 'NEUTRAL_WAIT';              // ⚪ NEUTRÁLNE PÁSMO (Čakať na signál)

export interface SemaforEvaluation {
  status: SemaforStatus;
  badgeColor: 'emerald' | 'amber' | 'orange' | 'rose' | 'sky' | 'slate';
  emoji: '🟢' | '🟡' | '🟠' | '🔴' | '🔵' | '⚪';
  headlineSk: string;
  actionSk: string;
  explanationSk: string;
  /** Suggested limit buy range [low, high] when Anti-FOMO triggers or approaching */
  limitBuyRange: { min: number; max: number } | null;
  activeWave: 1 | 2 | 3 | null;
  isAntiFomoTriggered: boolean;
}

export function evaluateAntiFomoSemafor(params: {
  dailyRsi: number | null;
  prevDailyRsi: number | null;
  weeklyRsi: number | null;
  zScoreDailyRsi: number | null;
  relVolume: number;
  prevRelVolume: number;
  currentPrice: number;
  premarketPrice: number | null;
  prevClose: number;
  prevLow: number;
  masterPrice: number;
  masterWeeklySma50: number | null;
  masterWeeklySma200: number | null;
}): SemaforEvaluation {
  const {
    dailyRsi,
    prevDailyRsi,
    weeklyRsi,
    zScoreDailyRsi,
    relVolume,
    prevRelVolume,
    currentPrice,
    premarketPrice,
    prevClose,
    prevLow,
    masterPrice,
    masterWeeklySma200,
  } = params;

  const rsi = dailyRsi ?? 50;
  const prevRsi = prevDailyRsi ?? rsi;
  const z = zScoreDailyRsi ?? 0;
  const maxRelVol = Math.max(relVolume, prevRelVolume);

  // Reference bottom from yesterday (min of prevLow and prevClose)
  const refBottom = Math.min(prevClose, prevLow > 0 ? prevLow : prevClose);
  const effectiveLivePrice = premarketPrice && premarketPrice > 0 ? premarketPrice : currentPrice;
  const reboundFromClosePct = prevClose > 0 ? ((effectiveLivePrice / prevClose) - 1) * 100 : 0;
  const reboundFromLowPct = refBottom > 0 ? ((effectiveLivePrice / refBottom) - 1) * 100 : 0;
  const maxReboundPct = Math.max(reboundFromClosePct, reboundFromLowPct);

  const isOversoldToday = rsi <= 27 || z <= -2.1;
  const wasCapitulationYesterday = prevRsi <= 27 || (prevRsi <= 29.5 && maxRelVol >= 2.2);
  const isBelowWeekly200 =
    masterWeeklySma200 != null && masterWeeklySma200 > 0 && masterPrice < masterWeeklySma200;

  // Determine which wave of capitulation we're in if oversold
  let activeWave: 1 | 2 | 3 | null = null;
  if (rsi <= 20 || z <= -2.6 || (rsi <= 22 && isBelowWeekly200)) {
    activeWave = 3;
  } else if (rsi <= 23 || z <= -2.4) {
    activeWave = 2;
  } else if (isOversoldToday || wasCapitulationYesterday) {
    activeWave = 1;
  }

  // 4. 🔴 TAKE PROFIT / HEDGE (Daily RSI >= 78 or Z >= +2.0σ)
  if (rsi >= 78 || z >= 2.0) {
    return {
      status: 'TAKE_PROFIT_HEDGE',
      badgeColor: 'rose',
      emoji: '🔴',
      headlineSk: 'TAKE PROFIT / TAX HEDGE',
      actionSk: 'Trim position or open an inverse ETF tax hedge',
      explanationSk: `Daily RSI (${rsi.toFixed(1)}) is in the right tail of the Gaussian curve (Z = +${z.toFixed(2)}σ, > 98.5%). Mean-reversion risk is elevated — ideal zone to lock in gains or hedge via an inverse ETF until the 1-year holding period completes.`,
      limitBuyRange: null,
      activeWave: null,
      isAntiFomoTriggered: false,
    };
  }

  // 2. 🟡 WAIT FOR RETEST (Limit Buy) — Anti-FOMO Guard!
  // Yesterday (or on the low) had capitulation (RSI <= 27), but premarket/live bounced > +4%
  if ((isOversoldToday || wasCapitulationYesterday) && maxReboundPct > 4.0) {
    const limitMin = Number(prevClose.toFixed(2));
    const limitMax = Number((prevClose * 1.02).toFixed(2));
    return {
      status: 'WAIT_RETEST',
      badgeColor: 'amber',
      emoji: '🟡',
      headlineSk: 'WAIT FOR RETEST (Limit Buy)',
      actionSk: `Do not chase premarket (+${maxReboundPct.toFixed(1)}%), place Limit Buy at $${limitMin} – $${limitMax}`,
      explanationSk: `Capitulation occurred yesterday (RSI ${prevRsi.toFixed(1)}, RelVol ${maxRelVol.toFixed(1)}×), but price has already bounced +${maxReboundPct.toFixed(1)}% off the low (classic illiquid premarket short-squeeze / dead-cat bounce). Anti-FOMO rule: do not market-buy; place a Limit Buy for a retest of yesterday's close ($${limitMin} to +2%).`,
      limitBuyRange: { min: limitMin, max: limitMax },
      activeWave: activeWave ?? 1,
      isAntiFomoTriggered: true,
    };
  }

  // 1. 🟢 BUY 1st / 2nd / 3rd TRANCHE (Market/Limit)
  if ((isOversoldToday || (wasCapitulationYesterday && maxRelVol >= 2.5)) && maxReboundPct <= 4.0) {
    const waveLabel =
      activeWave === 3
        ? 'BUY 3rd TRANCHE (Generational Bottom · 44%)'
        : activeWave === 2
          ? 'BUY 2nd TRANCHE (Deep Oversold · 28%)'
          : 'BUY 1st TRANCHE (Market/Limit · 28%)';

    const limitMin = Number((effectiveLivePrice * 0.99).toFixed(2));
    const limitMax = Number((effectiveLivePrice * 1.01).toFixed(2));
    return {
      status: 'BUY_TRANCHE_1',
      badgeColor: 'emerald',
      emoji: '🟢',
      headlineSk: waveLabel,
      actionSk: `Execute Tranche #${activeWave ?? 1} entry in the $${limitMin} – $${limitMax} zone`,
      explanationSk: `Confirmed left-tail capitulation on the Gaussian curve (Daily RSI ${rsi.toFixed(1)}, Z = ${z.toFixed(2)}σ, RelVol ${maxRelVol.toFixed(1)}×) and price has not bounced more than +4% off the low (currently ${maxReboundPct >= 0 ? '+' : ''}${maxReboundPct.toFixed(1)}%). Entry criteria are met.`,
      limitBuyRange: { min: limitMin, max: limitMax },
      activeWave: activeWave ?? 1,
      isAntiFomoTriggered: false,
    };
  }

  // 3. 🟠 WARNING: BROKEN 200W SMA WITHOUT CAPITULATION
  if (isBelowWeekly200 && rsi > 30) {
    return {
      status: 'BROKEN_200W_NO_CAPITULATION',
      badgeColor: 'orange',
      emoji: '🟠',
      headlineSk: 'CAUTION: BELOW 200W SMA WITHOUT CAPITULATION',
      actionSk: 'Do not buy yet — wait for panic washout (Daily RSI < 25)',
      explanationSk: `The underlying asset broke below its 200-Week SMA ($${masterWeeklySma200?.toFixed(2)}), but Daily RSI is still ${rsi.toFixed(1)} (> 30). Without a high-volume panic flush (RSI ≤ 25), stocks below the 200W SMA risk slow bleeding. Wait for horizontal support and RSI ≤ 25.`,
      limitBuyRange: null,
      activeWave: null,
      isAntiFomoTriggered: false,
    };
  }

  // 5. 🔵 WATCH: APPROACHING 1st CAPITULATION WAVE (RSI 27 - 32 or Weekly RSI <= 34)
  if (rsi <= 32 || (weeklyRsi != null && weeklyRsi <= 34)) {
    return {
      status: 'WATCH_APPROACHING',
      badgeColor: 'sky',
      emoji: '🔵',
      headlineSk: 'APPROACHING CAPITULATION (Stage Tranche 1)',
      actionSk: 'Stage resting Limit Buy orders at Tranche 1 (wait for RSI ≤ 27)',
      explanationSk: `Daily RSI (${rsi.toFixed(1)}) is approaching the 2% left-tail threshold (RSI ≤ 27). Full capitulation washout has not triggered yet — stage a resting Limit Buy at Tranche 1 and let price come to your level.`,
      limitBuyRange: null,
      activeWave: null,
      isAntiFomoTriggered: false,
    };
  }

  // 6. ⚪ NEUTRAL ZONE
  return {
    status: 'NEUTRAL_WAIT',
    badgeColor: 'slate',
    emoji: '⚪',
    headlineSk: 'NEUTRAL ZONE (Wait for Pullback)',
    actionSk: 'Hold cash / existing position — no statistical extreme',
    explanationSk: `Daily RSI (${rsi.toFixed(1)}) is inside the normal 88% Gaussian band (RSI 30–70). Contrarian dip-buying waits for a left-tail flush (< 2.0%, RSI ≤ 27).`,
    limitBuyRange: null,
    activeWave: null,
    isAntiFomoTriggered: false,
  };
}

// ============================================================================
// 6. WEIGHTED 3-TRANCHE PYRAMID CALCULATOR (28% : 28% : 44%)
// ============================================================================

export interface TrancheLevelPlan {
  trancheNumber: 1 | 2 | 3;
  weightPct: number; // 28, 28, 44
  labelSk: string;
  triggerConditionSk: string;
  masterTriggerPrice: number;
  masterDropFromCurrentPct: number;
  slaveEntryPrice: number;
  slaveDropFromCurrentPct: number;
  allocatedCapitalUsd: number;
}

export interface TrancheExecutionRow {
  trancheNumber: 1 | 2 | 3;
  weightPct: number;
  labelSk: string;
  triggerConditionSk: string;
  entryPrice: number;
  masterTriggerPrice: number;
  allocatedCapitalUsd: number;
  sharesBought: number;
  actualInvestedUsd: number;
  cumulativeShares: number;
  cumulativeInvestedUsd: number;
  /** New weighted average price (harmonic mean effect on cost basis) */
  newWeightedAvgPrice: number;
  /** Gross profit at targetPrice if the bounce happens from this tranche level */
  grossProfitUsd: number;
  grossReturnPct: number;
  /** Net profit after 15% tax (if sold before 1-year holding period) */
  netProfitAfter15PctTaxUsd: number;
  netReturnAfter15PctTaxPct: number;
  /** Net profit with 1Y tax test (0% tax) or inverse ETF tax hedge */
  netProfitTaxFree1YUsd: number;
  taxSavedBy1YTestUsd: number;
}

export interface TrancheCalculatorPlan {
  instrumentSymbol: string;
  masterSymbol: string;
  leverage: 1 | 2 | 3;
  inverseEtfSymbol: string | null;
  inverseEtfLeverage: 1 | 2 | 3 | null;
  currentInstrumentPrice: number;
  currentMasterPrice: number;
  suggestedTargetPrice: number;
  suggestedMasterTargetPrice: number;
  levels: [TrancheLevelPlan, TrancheLevelPlan, TrancheLevelPlan];
}

/**
 * Computes the 3 structural tranche prices on the Master asset and projects
 * them via leverage (1x, 2x, 3x) onto the Slave ETF.
 */
export function buildTranchePricePlan(params: {
  pair: MasterSlavePairConfig;
  useSlave: boolean;
  masterPrice: number;
  slavePrice: number;
  masterBaseline: TickerBaselineData;
  semafor: SemaforEvaluation;
}): TrancheCalculatorPlan {
  const { pair, useSlave, masterPrice, slavePrice, masterBaseline, semafor } = params;
  const isSlaveActive = useSlave && pair.slaveSymbol != null && slavePrice > 0;
  const instrumentSymbol = isSlaveActive ? pair.slaveSymbol! : pair.masterSymbol;
  const leverage = isSlaveActive ? pair.leverage : 1;
  const currentInstrumentPrice = isSlaveActive ? slavePrice : masterPrice;

  // 1. Determine Master Tranche 1 trigger price:
  //    - If currently in BUY_TRANCHE_1, entry is current price
  //    - If in WAIT_RETEST, entry is yesterday's close (retest)
  //    - Otherwise, solve for price where Master Daily RSI reaches ~26 (or Weekly SMA 50 if close)
  let masterT1Price = masterPrice;
  if (semafor.status === 'BUY_TRANCHE_1') {
    masterT1Price = masterPrice;
  } else if (semafor.status === 'WAIT_RETEST') {
    masterT1Price = Math.min(masterPrice, masterBaseline.prevClose);
  } else {
    const rsi26Px = solvePriceForTargetRsi(masterBaseline.dailyRsiState, 26, masterPrice);
    const wsma50 = masterBaseline.weeklySma50;
    if (wsma50 && wsma50 < masterPrice && wsma50 > masterPrice * 0.82) {
      masterT1Price = Math.min(rsi26Px, wsma50);
    } else {
      masterT1Price = Math.min(masterPrice * 0.95, rsi26Px);
    }
  }
  masterT1Price = Math.max(masterPrice * 0.65, Math.min(masterPrice, masterT1Price));

  // 2. Determine Master Tranche 2 trigger price:
  //    ~12-15% below Tranche 1 on Master (horizontal structural support / Daily RSI ~22-24)
  const rawSupport = masterBaseline.horizontalSupport;
  let masterT2Price = masterT1Price * 0.86; // -14% from T1 on Master
  if (rawSupport && rawSupport < masterT1Price * 0.93 && rawSupport > masterT1Price * 0.78) {
    masterT2Price = rawSupport;
  }

  // 3. Determine Master Tranche 3 trigger price:
  //    Touch of Weekly SMA 200 (or generational bottom ~12-15% below T2 if Weekly SMA 200 is already broken)
  const wsma200 = masterBaseline.weeklySma200;
  let masterT3Price = masterT2Price * 0.86;
  if (wsma200 && wsma200 < masterT2Price * 0.96 && wsma200 > masterT2Price * 0.70) {
    masterT3Price = wsma200;
  }

  // Project Master % drops onto Slave ETF using compounded daily leverage approximation
  // For a drop d on Master (e.g. -0.15), a leveraged ETF with leverage L drops by roughly
  // 1 - (1 + d)^L (which naturally accounts for multi-day path compounding and never goes <= 0).
  const projectToSlave = (mTarget: number): number => {
    if (!isSlaveActive || leverage === 1) return Number(mTarget.toFixed(2));
    const masterRatio = mTarget / masterPrice;
    const slaveRatio = Math.pow(Math.max(0.25, masterRatio), leverage);
    return Number(Math.max(0.5, slavePrice * slaveRatio).toFixed(2));
  };

  const slaveT1 =
    semafor.status === 'BUY_TRANCHE_1'
      ? currentInstrumentPrice
      : projectToSlave(masterT1Price);

  const slaveT2 = projectToSlave(masterT2Price);
  const slaveT3 = projectToSlave(masterT3Price);

  // Suggested target price: recovery of Master to Daily/Weekly SMA 50 or +18% from T1
  const masterTargetBase = Math.max(
    masterPrice * 1.08,
    masterT1Price * 1.22,
    masterBaseline.dailySma50 ?? 0,
    masterBaseline.weeklySma50 ?? 0
  );
  const suggestedMasterTargetPrice = Number(masterTargetBase.toFixed(2));
  const masterUpsideFromCurrent = suggestedMasterTargetPrice / masterPrice;
  const suggestedTargetPrice = isSlaveActive
    ? Number((slavePrice * Math.pow(masterUpsideFromCurrent, leverage)).toFixed(2))
    : suggestedMasterTargetPrice;

  const pctDiff = (target: number, base: number) =>
    base > 0 ? Number((((target / base) - 1) * 100).toFixed(2)) : 0;

  const levels: [TrancheLevelPlan, TrancheLevelPlan, TrancheLevelPlan] = [
    {
      trancheNumber: 1,
      weightPct: 28,
      labelSk: 'Tranche 1 (28% Capital · 1st Capitulation Wave)',
      triggerConditionSk: 'Daily RSI ≤ 26–27 (Left 2% tail, Z ≤ -2.1σ) · below Weekly SMA 50',
      masterTriggerPrice: Number(masterT1Price.toFixed(2)),
      masterDropFromCurrentPct: pctDiff(masterT1Price, masterPrice),
      slaveEntryPrice: slaveT1,
      slaveDropFromCurrentPct: pctDiff(slaveT1, currentInstrumentPrice),
      allocatedCapitalUsd: 0,
    },
    {
      trancheNumber: 2,
      weightPct: 28,
      labelSk: 'Tranche 2 (28% Capital · Structural Support)',
      triggerConditionSk: 'Further ~14% drop on Master to horizontal support (Daily RSI 22–24, Z ≤ -2.4σ)',
      masterTriggerPrice: Number(masterT2Price.toFixed(2)),
      masterDropFromCurrentPct: pctDiff(masterT2Price, masterPrice),
      slaveEntryPrice: slaveT2,
      slaveDropFromCurrentPct: pctDiff(slaveT2, currentInstrumentPrice),
      allocatedCapitalUsd: 0,
    },
    {
      trancheNumber: 3,
      weightPct: 44,
      labelSk: 'Tranche 3 (44% Capital · Iron Reserve)',
      triggerConditionSk: 'Master touches Weekly SMA 200 (Generational bottom · Daily RSI 18–21, Weekly RSI ≤ 30)',
      masterTriggerPrice: Number(masterT3Price.toFixed(2)),
      masterDropFromCurrentPct: pctDiff(masterT3Price, masterPrice),
      slaveEntryPrice: slaveT3,
      slaveDropFromCurrentPct: pctDiff(slaveT3, currentInstrumentPrice),
      allocatedCapitalUsd: 0,
    },
  ];

  return {
    instrumentSymbol,
    masterSymbol: pair.masterSymbol,
    leverage,
    inverseEtfSymbol: pair.inverseSymbol,
    inverseEtfLeverage: pair.inverseLeverage,
    currentInstrumentPrice: Number(currentInstrumentPrice.toFixed(2)),
    currentMasterPrice: Number(masterPrice.toFixed(2)),
    suggestedTargetPrice,
    suggestedMasterTargetPrice,
    levels,
  };
}

/**
 * Pure function (usable both on backend and interactively on frontend) to compute
 * exact share counts, harmonic/weighted average price, gross/net profits, and
 * 15% tax vs 1-year time test / inverse ETF tax hedging.
 */
export function calculateWeightedTranches(params: {
  capitalUsd: number;
  targetPrice: number;
  levels: [TrancheLevelPlan, TrancheLevelPlan, TrancheLevelPlan];
  customEntryPrices?: [number?, number?, number?];
  taxRatePct?: number; // default 15%
}): {
  rows: TrancheExecutionRow[];
  totalAllocatedUsd: number;
  totalInvestedUsd: number;
  uninvestedCashUsd: number;
  finalWeightedAvgPrice: number;
  totalShares: number;
  hedgeSimulation: {
    positionValueAtTargetUsd: number;
    capitalNeededFor1xInverseUsd: number;
    capitalNeededFor3xInverseUsd: number;
  };
} {
  const { capitalUsd, targetPrice, levels, customEntryPrices, taxRatePct = 15 } = params;
  const safeCapital = Math.max(100, Number.isFinite(capitalUsd) ? capitalUsd : 15300);
  const taxRate = taxRatePct / 100;

  let cumulativeShares = 0;
  let cumulativeInvestedUsd = 0;
  const rows: TrancheExecutionRow[] = [];

  for (let idx = 0; idx < 3; idx++) {
    const lvl = levels[idx]!;
    const rawEntry = customEntryPrices?.[idx] ?? lvl.slaveEntryPrice;
    const entryPrice = Math.max(0.01, Number(rawEntry.toFixed(2)));
    const allocatedCapitalUsd = Number(((safeCapital * lvl.weightPct) / 100).toFixed(2));

    // Whole shares (celé kusy akcií)
    const sharesBought = Math.max(0, Math.floor(allocatedCapitalUsd / entryPrice));
    const actualInvestedUsd = Number((sharesBought * entryPrice).toFixed(2));

    cumulativeShares += sharesBought;
    cumulativeInvestedUsd = Number((cumulativeInvestedUsd + actualInvestedUsd).toFixed(2));

    const newWeightedAvgPrice =
      cumulativeShares > 0
        ? Number((cumulativeInvestedUsd / cumulativeShares).toFixed(2))
        : entryPrice;

    const totalExitValue = cumulativeShares * targetPrice;
    const grossProfitUsd = Number((totalExitValue - cumulativeInvestedUsd).toFixed(2));
    const grossReturnPct =
      cumulativeInvestedUsd > 0
        ? Number(((grossProfitUsd / cumulativeInvestedUsd) * 100).toFixed(2))
        : 0;

    const taxAmountUsd = grossProfitUsd > 0 ? grossProfitUsd * taxRate : 0;
    const netProfitAfter15PctTaxUsd = Number((grossProfitUsd - taxAmountUsd).toFixed(2));
    const netReturnAfter15PctTaxPct =
      cumulativeInvestedUsd > 0
        ? Number(((netProfitAfter15PctTaxUsd / cumulativeInvestedUsd) * 100).toFixed(2))
        : 0;

    rows.push({
      trancheNumber: lvl.trancheNumber,
      weightPct: lvl.weightPct,
      labelSk: lvl.labelSk,
      triggerConditionSk: lvl.triggerConditionSk,
      entryPrice,
      masterTriggerPrice: lvl.masterTriggerPrice,
      allocatedCapitalUsd,
      sharesBought,
      actualInvestedUsd,
      cumulativeShares,
      cumulativeInvestedUsd,
      newWeightedAvgPrice,
      grossProfitUsd,
      grossReturnPct,
      netProfitAfter15PctTaxUsd,
      netReturnAfter15PctTaxPct,
      netProfitTaxFree1YUsd: grossProfitUsd,
      taxSavedBy1YTestUsd: Number(taxAmountUsd.toFixed(2)),
    });
  }

  const positionValueAtTargetUsd = Number((cumulativeShares * targetPrice).toFixed(2));

  return {
    rows,
    totalAllocatedUsd: safeCapital,
    totalInvestedUsd: cumulativeInvestedUsd,
    uninvestedCashUsd: Number(Math.max(0, safeCapital - cumulativeInvestedUsd).toFixed(2)),
    finalWeightedAvgPrice:
      cumulativeShares > 0
        ? Number((cumulativeInvestedUsd / cumulativeShares).toFixed(2))
        : 0,
    totalShares: cumulativeShares,
    hedgeSimulation: {
      positionValueAtTargetUsd,
      capitalNeededFor1xInverseUsd: positionValueAtTargetUsd,
      capitalNeededFor3xInverseUsd: Number((positionValueAtTargetUsd / 3).toFixed(2)),
    },
  };
}

// ============================================================================
// 7. HIGH-LEVEL ENTRYPOINT: EVALUATE PAIR OR SINGLE TICKER
// ============================================================================

export interface DipIdeaItem {
  id: string;
  pair: MasterSlavePairConfig;
  queriedSymbol: string;
  queriedRole: 'master' | 'slave';
  masterQuote: LiveTickerQuote;
  slaveQuote: LiveTickerQuote | null;
  /** Active quote for RSI & Semafor display (Master structural + Slave live pricing) */
  dailyRsi14: number | null;
  prevDailyRsi14: number | null;
  weeklyRsi14: number | null;
  slaveDailyRsi14: number | null;
  relVolume: number;
  masterTechnicals: {
    dailySma20: number | null;
    dailySma50: number | null;
    dailySma200: number | null;
    weeklySma50: number | null;
    weeklySma200: number | null;
    horizontalSupport: number | null;
    distWeeklySma50Pct: number | null;
    distWeeklySma200Pct: number | null;
    distDailySma200Pct: number | null;
  };
  gaussian: {
    dailyRsi: GaussianDistributionStats;
    weeklyRsi: GaussianDistributionStats;
    weeklySma200Dist: GaussianDistributionStats;
    dailySma200Dist: GaussianDistributionStats;
    peRatio?: GaussianDistributionStats | null;
  };
  semafor: SemaforEvaluation;
  tranchePlanSlave: TrancheCalculatorPlan;
  tranchePlanMaster: TrancheCalculatorPlan;
}

export async function evaluateDipIdeaForSymbol(
  symbol: string,
  includePeDistribution = false
): Promise<DipIdeaItem | null> {
  const { config: pair, queriedRole } = resolvePairConfig(symbol);
  const symbolsToFetch = [pair.masterSymbol];
  if (pair.slaveSymbol) symbolsToFetch.push(pair.slaveSymbol);

  const baselinesArr = await Promise.all(symbolsToFetch.map((s) => getTickerBaseline(s)));
  const baselines = new Map<string, TickerBaselineData>();
  baselinesArr.forEach((b) => {
    if (b) baselines.set(b.symbol, b);
  });

  const masterBaseline = baselines.get(pair.masterSymbol);
  if (!masterBaseline) return null;
  const slaveBaseline = pair.slaveSymbol ? baselines.get(pair.slaveSymbol) ?? null : null;

  const quotes = await getLiveQuotesForSymbols(symbolsToFetch, baselines);
  const masterQuote = quotes.get(pair.masterSymbol);
  if (!masterQuote) return null;
  const slaveQuote = pair.slaveSymbol ? quotes.get(pair.slaveSymbol) ?? null : null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const isNewDayMaster = masterBaseline.lastBarDateStr < todayStr;

  const liveMasterDailyRsi = computeLiveRsiFromState(
    masterBaseline.dailyRsiState,
    masterQuote.currentPrice,
    isNewDayMaster,
    14
  );
  const liveMasterWeeklyRsi = computeLiveRsiFromState(
    masterBaseline.weeklyRsiState,
    masterQuote.currentPrice,
    false, // Current week updates the active weekly candle
    14
  );

  const liveSlaveDailyRsi =
    slaveBaseline && slaveQuote
      ? computeLiveRsiFromState(
          slaveBaseline.dailyRsiState,
          slaveQuote.currentPrice,
          slaveBaseline.lastBarDateStr < todayStr,
          14
        )
      : null;

  const pctDist = (price: number, sma: number | null) =>
    sma && sma > 0 ? Number((((price / sma) - 1) * 100).toFixed(2)) : null;

  const distWeeklySma50Pct = pctDist(masterQuote.currentPrice, masterBaseline.weeklySma50);
  const distWeeklySma200Pct = pctDist(masterQuote.currentPrice, masterBaseline.weeklySma200);
  const distDailySma200Pct = pctDist(masterQuote.currentPrice, masterBaseline.dailySma200);

  // Build Gaussian distributions
  const dailyRsiGauss = buildGaussianStats(
    'dailyRsi',
    'Daily RSI (14)',
    'RSI',
    masterBaseline.distributions.dailyRsiValues,
    liveMasterDailyRsi,
    pair.defaultRsiMean ?? 53.0,
    pair.defaultRsiStdDev ?? 12.5,
    true
  );

  const weeklyRsiGauss = buildGaussianStats(
    'weeklyRsi',
    'Weekly RSI (14)',
    'RSI',
    masterBaseline.distributions.weeklyRsiValues,
    liveMasterWeeklyRsi,
    54.0,
    11.5,
    true
  );

  const weeklySma200DistGauss = buildGaussianStats(
    'weeklySma200Dist',
    'Distance from Weekly SMA 200',
    '%',
    masterBaseline.distributions.weeklySma200DistValues,
    distWeeklySma200Pct,
    22.0,
    18.0,
    false
  );

  const dailySma200DistGauss = buildGaussianStats(
    'dailySma200Dist',
    'Distance from Daily SMA 200',
    '%',
    masterBaseline.distributions.dailySma200DistValues,
    distDailySma200Pct,
    8.0,
    14.0,
    false
  );

  let peRatioGauss: GaussianDistributionStats | null = null;
  if (includePeDistribution) {
    try {
      const peRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol: pair.masterSymbol, peRatio: { not: null, gt: 0, lt: 250 } },
        orderBy: { date: 'asc' },
        select: { peRatio: true },
      });
      if (peRows.length >= 30) {
        const peVals = peRows.map((r) => r.peRatio!);
        const curPe = peVals[peVals.length - 1] ?? null;
        peRatioGauss = buildGaussianStats(
          'peRatio',
          'Historical P/E (Valuation)',
          '×',
          peVals,
          curPe,
          25.0,
          8.0,
          false
        );
      }
    } catch {
      /* optional */
    }
  }

  // Evaluate Anti-FOMO Semafor using Master RSI/SMA structure + active instrument's premarket rebound
  const activeQuoteForRebound =
    queriedRole === 'slave' && slaveQuote ? slaveQuote : masterQuote;

  const semafor = evaluateAntiFomoSemafor({
    dailyRsi: liveMasterDailyRsi,
    prevDailyRsi: masterBaseline.dailyRsiState.currentRsi,
    weeklyRsi: liveMasterWeeklyRsi,
    zScoreDailyRsi: dailyRsiGauss.zScore,
    relVolume: Math.max(masterQuote.relVolume, slaveQuote?.relVolume ?? 0),
    prevRelVolume: masterBaseline.prevRelVolume,
    currentPrice: activeQuoteForRebound.currentPrice,
    premarketPrice: activeQuoteForRebound.premarketPrice,
    prevClose: activeQuoteForRebound.prevClose,
    prevLow: activeQuoteForRebound.prevLow,
    masterPrice: masterQuote.currentPrice,
    masterWeeklySma50: masterBaseline.weeklySma50,
    masterWeeklySma200: masterBaseline.weeklySma200,
  });

  const slavePriceForPlan = slaveQuote?.currentPrice ?? masterQuote.currentPrice;

  const tranchePlanSlave = buildTranchePricePlan({
    pair,
    useSlave: Boolean(pair.slaveSymbol && slaveQuote),
    masterPrice: masterQuote.currentPrice,
    slavePrice: slavePriceForPlan,
    masterBaseline,
    semafor,
  });

  const tranchePlanMaster = buildTranchePricePlan({
    pair,
    useSlave: false,
    masterPrice: masterQuote.currentPrice,
    slavePrice: masterQuote.currentPrice,
    masterBaseline,
    semafor,
  });

  return {
    id: pair.slaveSymbol ? `${pair.masterSymbol}_${pair.slaveSymbol}` : pair.masterSymbol,
    pair,
    queriedSymbol: symbol.toUpperCase().trim(),
    queriedRole,
    masterQuote,
    slaveQuote,
    dailyRsi14: liveMasterDailyRsi != null ? Number(liveMasterDailyRsi.toFixed(2)) : null,
    prevDailyRsi14:
      masterBaseline.dailyRsiState.currentRsi != null
        ? Number(masterBaseline.dailyRsiState.currentRsi.toFixed(2))
        : null,
    weeklyRsi14: liveMasterWeeklyRsi != null ? Number(liveMasterWeeklyRsi.toFixed(2)) : null,
    slaveDailyRsi14: liveSlaveDailyRsi != null ? Number(liveSlaveDailyRsi.toFixed(2)) : null,
    relVolume: Number(Math.max(masterQuote.relVolume, slaveQuote?.relVolume ?? 0).toFixed(2)),
    masterTechnicals: {
      dailySma20: masterBaseline.dailySma20 ? Number(masterBaseline.dailySma20.toFixed(2)) : null,
      dailySma50: masterBaseline.dailySma50 ? Number(masterBaseline.dailySma50.toFixed(2)) : null,
      dailySma200: masterBaseline.dailySma200 ? Number(masterBaseline.dailySma200.toFixed(2)) : null,
      weeklySma50: masterBaseline.weeklySma50 ? Number(masterBaseline.weeklySma50.toFixed(2)) : null,
      weeklySma200: masterBaseline.weeklySma200 ? Number(masterBaseline.weeklySma200.toFixed(2)) : null,
      horizontalSupport: masterBaseline.horizontalSupport,
      distWeeklySma50Pct,
      distWeeklySma200Pct,
      distDailySma200Pct,
    },
    gaussian: {
      dailyRsi: dailyRsiGauss,
      weeklyRsi: weeklyRsiGauss,
      weeklySma200Dist: weeklySma200DistGauss,
      dailySma200Dist: dailySma200DistGauss,
      peRatio: peRatioGauss,
    },
    semafor,
    tranchePlanSlave,
    tranchePlanMaster,
  };
}

/**
 * Evaluate the full default watchlist of Master -> Slave pairs + any extra custom tickers,
 * plus also pull the top oversold stocks from `AnalysisCache` (where `rsi14 <= 30`)
 * so active market capitulations automatically appear in Trading Ideas!
 */
export async function evaluateTradingIdeasBoard(extraSymbols: string[] = []): Promise<{
  items: DipIdeaItem[];
  session: 'pre' | 'live' | 'after' | 'closed';
  updatedAt: string;
}> {
  const defaultMasters = MASTER_SLAVE_PAIRS.map((p) => p.masterSymbol);

  // Also discover up to 6 additional S&P 500 / PMP universe stocks currently in deep oversold territory (rsi14 <= 29)
  let discoveredOversold: string[] = [];
  try {
    const oversoldRows = await prisma.analysisCache.findMany({
      where: {
        rsi14: { not: null, gt: 0, lte: 29 },
        ticker: { lastMarketCap: { gte: 5 } }, // >= $5B market cap to avoid illiquid microcaps
      },
      orderBy: { rsi14: 'asc' },
      take: 6,
      select: { symbol: true },
    });
    discoveredOversold = oversoldRows.map((r) => r.symbol);
  } catch {
    /* ignore */
  }

  const allTargets = [
    ...new Set([
      ...defaultMasters,
      ...discoveredOversold,
      ...extraSymbols.map((s) => s.toUpperCase().trim()).filter(Boolean),
    ]),
  ];

  // Process in controlled concurrency
  const results: DipIdeaItem[] = [];
  const batchSize = 5;
  for (let i = 0; i < allTargets.length; i += batchSize) {
    const batch = allTargets.slice(i, i + batchSize);
    const items = await Promise.all(
      batch.map((sym) => evaluateDipIdeaForSymbol(sym, false).catch(() => null))
    );
    for (const item of items) {
      if (item) results.push(item);
    }
  }

  // Sort priority:
  // 1. BUY_TRANCHE_1 (🟢)
  // 2. WAIT_RETEST (🟡)
  // 3. BROKEN_200W_NO_CAPITULATION (🟠)
  // 4. WATCH_APPROACHING (🔵)
  // 5. TAKE_PROFIT_HEDGE (🔴)
  // 6. NEUTRAL_WAIT (⚪) — sorted by lowest Daily RSI first
  const priorityMap: Record<SemaforStatus, number> = {
    BUY_TRANCHE_1: 1,
    WAIT_RETEST: 2,
    BROKEN_200W_NO_CAPITULATION: 3,
    WATCH_APPROACHING: 4,
    TAKE_PROFIT_HEDGE: 5,
    NEUTRAL_WAIT: 6,
  };

  results.sort((a, b) => {
    const pa = priorityMap[a.semafor.status] ?? 9;
    const pb = priorityMap[b.semafor.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return (a.dailyRsi14 ?? 50) - (b.dailyRsi14 ?? 50);
  });

  return {
    items: results,
    session: detectSession(),
    updatedAt: new Date().toISOString(),
  };
}

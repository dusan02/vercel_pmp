/**
 * Shared types, leveraged Master -> Slave registry, Wilder RSI smoothing,
 * and Gaussian distribution statistics for the Trading Ideas dip-buying engine.
 */

import {
  normalCdf,
  normalPdf,
  calculateWeightedTranches,
} from './dipClientMath';

export { normalCdf, normalPdf, calculateWeightedTranches };

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
// 2. WILDER RSI & GAUSSIAN STATISTICS
// ============================================================================

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
    neg2_6Sigma: number;
    neg2_4Sigma: number;
    neg2_1Sigma: number;
    neg1_0Sigma: number;
    mean: number;
    pos1_0Sigma: number;
    pos2_0Sigma: number;
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
// 3. SHARED DOMAIN TYPES
// ============================================================================

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

export type SemaforStatus =
  | 'BUY_TRANCHE_1'
  | 'WAIT_RETEST'
  | 'BROKEN_200W_NO_CAPITULATION'
  | 'TAKE_PROFIT_HEDGE'
  | 'WATCH_APPROACHING'
  | 'NEUTRAL_WAIT';

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
  newWeightedAvgPrice: number;
  grossProfitUsd: number;
  grossReturnPct: number;
  netProfitAfter15PctTaxUsd: number;
  netReturnAfter15PctTaxPct: number;
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

export interface DipIdeaItem {
  id: string;
  pair: MasterSlavePairConfig;
  queriedSymbol: string;
  queriedRole: 'master' | 'slave';
  masterQuote: LiveTickerQuote;
  slaveQuote: LiveTickerQuote | null;
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

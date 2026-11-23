/**
 * Trading Ideas (Long / Dip-Buying Engine)
 *
 * Contrarian decision engine and orchestration layer for timing entries in sharp
 * capitulations across stocks, index ETFs, and leveraged ETFs (Master -> Slave).
 *
 * Pure types/math live in `./dipTypesAndMath` & `./dipClientMath`, while EOD
 * Polygon historical baselines and TradingView/DB quote overlays live in
 * `./dipDataFetcher`.
 */

import { prisma } from '@/lib/db/prisma';
import { detectSession } from '@/lib/utils/timeUtils';
import {
  MASTER_SLAVE_PAIRS,
  resolvePairConfig,
  computeLiveRsiFromState,
  solvePriceForTargetRsi,
  buildGaussianStats,
  type MasterSlavePairConfig,
  type GaussianDistributionStats,
  type TickerBaselineData,
  type SemaforStatus,
  type SemaforEvaluation,
  type TrancheLevelPlan,
  type TrancheCalculatorPlan,
  type DipIdeaItem,
} from './dipTypesAndMath';
import { getTickerBaseline, getLiveQuotesForSymbols } from './dipDataFetcher';

export {
  MASTER_SLAVE_PAIRS,
  resolvePairConfig,
  normalCdf,
  normalPdf,
  computeWilderRsiSeries,
  computeLiveRsiFromState,
  solvePriceForTargetRsi,
  buildGaussianStats,
  calculateWeightedTranches,
  type MasterSlavePairConfig,
  type WilderRsiState,
  type GaussianZone,
  type GaussianDistributionStats,
  type TickerBaselineData,
  type LiveTickerQuote,
  type SemaforStatus,
  type SemaforEvaluation,
  type TrancheLevelPlan,
  type TrancheExecutionRow,
  type TrancheCalculatorPlan,
  type DipIdeaItem,
} from './dipTypesAndMath';
export { getTickerBaseline, getLiveQuotesForSymbols } from './dipDataFetcher';

// ============================================================================
// PREMARKET ANTI-FOMO SEMAFOR & DECISION ENGINE
// ============================================================================

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

  let activeWave: 1 | 2 | 3 | null = null;
  if (rsi <= 20 || z <= -2.6 || (rsi <= 22 && isBelowWeekly200)) {
    activeWave = 3;
  } else if (rsi <= 23 || z <= -2.4) {
    activeWave = 2;
  } else if (isOversoldToday || wasCapitulationYesterday) {
    activeWave = 1;
  }

  // 4. TAKE PROFIT / HEDGE (Daily RSI >= 78 or Z >= +2.0σ)
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

  // 2. WAIT FOR RETEST (Limit Buy) — Anti-FOMO Guard!
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

  // 1. BUY 1st / 2nd / 3rd TRANCHE (Market/Limit)
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

  // 3. WARNING: BROKEN 200W SMA WITHOUT CAPITULATION
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

  // 5. WATCH: APPROACHING 1st CAPITULATION WAVE (RSI 27 - 32 or Weekly RSI <= 34)
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

  // 6. NEUTRAL ZONE
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
// WEIGHTED 3-TRANCHE PYRAMID PRICE PLAN (28% : 28% : 44%)
// ============================================================================

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

  const rawSupport = masterBaseline.horizontalSupport;
  let masterT2Price = masterT1Price * 0.86;
  if (rawSupport && rawSupport < masterT1Price * 0.93 && rawSupport > masterT1Price * 0.78) {
    masterT2Price = rawSupport;
  }

  const wsma200 = masterBaseline.weeklySma200;
  let masterT3Price = masterT2Price * 0.86;
  if (wsma200 && wsma200 < masterT2Price * 0.96 && wsma200 > masterT2Price * 0.70) {
    masterT3Price = wsma200;
  }

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

// ============================================================================
// HIGH-LEVEL ENTRYPOINTS: EVALUATE PAIR OR BOARD
// ============================================================================

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
    false,
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

  let discoveredOversold: string[] = [];
  try {
    const oversoldRows = await prisma.analysisCache.findMany({
      where: {
        rsi14: { not: null, gt: 0, lte: 29 },
        ticker: { lastMarketCap: { gte: 5 } },
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

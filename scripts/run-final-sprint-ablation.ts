/**
 * PMP Final Sprint: 3-Way Fundamental Ablation & SPY Total Return Benchmark
 * =========================================================================
 * 
 * Implements Phase 2 & Phase 3 of the final sprint:
 * - Variant 1: M2B Original (Current bot with static AnalysisCache + earnings)
 * - Variant 2: M2B PIT (Strict Point-in-Time from V2 DB with availableAt <= T)
 * - Variant 3: M2B No Fundamentals (Pure technical RSI2 + Breakout)
 * - Benchmark: SPY Total Return (reinvested dividends @ 1.55% p.a.)
 * 
 * Evaluated across:
 * - Cohort Universe (27 tickers, 100% controlled ceteris paribus)
 * - Full Universe (648 tickers, real-world comparison)
 * - In-Sample (2021-01-04 to 2023-12-29) vs Out-Of-Sample (2024-01-02 to 2026-11-06)
 * - Core Overlay Attribution (Stock-picking vs Market timing / Cash yield)
 * - Execution Timing Sensitivity (Same-Day Close vs Next-Day Open/Close)
 * 
 * Outputs:
 * - /tmp/pmp-final-sprint-results.csv
 * - /tmp/pmp-final-sprint-results.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';

const INITIAL_CAPITAL = 10_000;
const MAX_POSITIONS = 1;
const MAX_PER_ENGINE = 3;
const MAX_PER_SECTOR = 2;
const COOLDOWN_DAYS = 5;
const FEE_PER_ORDER = 1.0;
const SLIPPAGE_PCT = 0.0005; // 5 bps
const CASH_YIELD_ANNUAL = 0.035; // 3.5%
const SPY_DIVIDEND_YIELD_ANNUAL = 0.0155; // 1.55%

const CACHE_DIR = path.join(os.homedir(), '.cache', 'pmp-trading-bot');
const MARKET_CACHE_FILE = path.join(CACHE_DIR, 'market-data-cache.json');
const PIT_DB_PATH = '/tmp/pmp-pit-cohort-v2.db';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TickerMeta {
  symbol: string;
  name: string;
  sector: string;
  marketCapB: number;
  fundLevel: string;
  overallScore: number;
  healthScore: number;
}

interface DailyBar {
  date: string;
  close: number;
}

interface EarningsEvent {
  ticker: string;
  date: string;
  time: string;
  epsEstimate: number;
  epsActual: number;
  revEstimate: number;
  revActual: number;
  epsSurprisePct: number;
  revSurprisePct: number;
}

interface MarketDataset {
  fetchedAt: string;
  latestDate: string;
  tickers: Record<string, TickerMeta>;
  barsBySymbol: Record<string, DailyBar[]>;
  earnings: EarningsEvent[];
  allTradingDates: string[];
}

type EngineType = 'RSI2_MEAN_REV' | 'PEAD_DRIFT' | 'SMA200_SNIPER';

interface Position {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  engine: EngineType;
  entryDate: string;
  entryPrice: number;
  shares: number;
  investedEur: number;
  stopLossPrice: number;
  peakClose: number;
  daysHeld: number;
  currentPrice: number;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  engine: EngineType;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  investedEur: number;
  netPnlEur: number;
  netPnlPct: number;
  daysHeld: number;
  exitReason: string;
}

interface DailyCurvePoint {
  date: string;
  equityEur: number;
  cashEur: number;
  investedEur: number;
  spyNormalizedEur: number;
  spyTrNormalizedEur: number;
  regime: 'BULL' | 'CAUTIOUS' | 'DEFENSIVE';
  dailyReturnPct: number;
  drawdownPct: number;
}

interface SimulationOptions {
  name: string;
  universeType: 'COHORT' | 'FULL';
  variant: 'ORIGINAL' | 'NO_FUNDAMENTALS' | 'PIT';
  executionTiming: 'SAME_DAY_CLOSE' | 'NEXT_DAY';
  useCoreOverlay: boolean; // if false, idle cash earns 3.5% money-market only (no SPY riding)
  startDate: string;
  endDate: string;
}

interface YearlyMetric {
  year: number;
  strategyReturnPct: number;
  spyTrReturnPct: number;
  trades: number;
  winRatePct: number;
}

interface RegimeMetric {
  regime: string;
  days: number;
  strategyReturnPct: number;
  spyTrReturnPct: number;
}

interface BacktestResult {
  config: SimulationOptions;
  startEquity: number;
  endEquity: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  totalTrades: number;
  winRatePct: number;
  profitFactor: number;
  annualTurnoverPct: number;
  alphaVsSpyTrPct: number;
  bootstrapPValue: number; // probability that alpha <= 0
  yearly: YearlyMetric[];
  regimes: RegimeMetric[];
  dailyCurve: DailyCurvePoint[];
}

// ─── Technical Indicators ─────────────────────────────────────────────────────

function computeSMA(closes: number[], endIdx: number, period: number): number | null {
  const effPeriod = period >= 100 && endIdx + 1 >= 70 ? Math.min(period, endIdx + 1) : period;
  if (endIdx + 1 < effPeriod) return null;
  let sum = 0;
  for (let i = endIdx - effPeriod + 1; i <= endIdx; i++) {
    sum += closes[i];
  }
  return sum / effPeriod;
}

function computeRSI2(closes: number[], endIdx: number): number | null {
  const warmup = 14;
  if (endIdx < warmup) return null;
  const start = endIdx - warmup;
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = start + 1; i <= start + 2; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= 2;
  avgLoss /= 2;

  for (let i = start + 3; i <= endIdx; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 1 + gain) / 2;
    avgLoss = (avgLoss * 1 + loss) / 2;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeStdDevPct(closes: number[], endIdx: number, period = 20): number | null {
  if (endIdx < period) return null;
  const rets: number[] = [];
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    rets.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

function shiftDaysISO(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// ─── Main Simulation Runner ───────────────────────────────────────────────────

export function runBacktest(
  dataset: MarketDataset,
  pitDb: Database.Database | null,
  cohortSymbols: Set<string>,
  options: SimulationOptions,
): BacktestResult {
  const DUPLICATE_SHARE_CLASSES = new Set(['GOOGL', 'HEI.A', 'BRK.A', 'FOXA', 'NWSA', 'LEN.B', 'BF.A', 'UHAL.B']);

  // Pre-index symbols
  const symIndex = new Map<string, { closes: number[]; dateToIndex: Map<string, number> }>();
  for (const [sym, bars] of Object.entries(dataset.barsBySymbol)) {
    // If cohort universe, only index cohort symbols + SPY
    if (options.universeType === 'COHORT' && sym !== 'SPY' && !cohortSymbols.has(sym)) {
      continue;
    }
    const closes = bars.map(b => b.close);
    const dateToIndex = new Map<string, number>();
    bars.forEach((b, idx) => dateToIndex.set(b.date, idx));
    symIndex.set(sym, { closes, dateToIndex });
  }

  // Pre-index earnings by reaction date
  const earningsByReactDate = new Map<string, EarningsEvent[]>();
  const allDates = dataset.allTradingDates;
  for (const ev of dataset.earnings) {
    if (options.universeType === 'COHORT' && !cohortSymbols.has(ev.ticker)) continue;
    let reactDate: string | null = null;
    if (ev.time === 'amc') {
      const next = allDates.find(d => d > ev.date);
      if (next) reactDate = next;
    } else {
      const curr = allDates.find(d => d >= ev.date);
      if (curr) reactDate = curr;
    }
    if (!reactDate) continue;
    const list = earningsByReactDate.get(reactDate) ?? [];
    list.push(ev);
    earningsByReactDate.set(reactDate, list);
  }

  // Pre-load PIT statement cache if PIT variant
  const pitFilingCache = new Map<string, { availableAt: string; netIncome: number; revenue: number }[]>();
  if (options.variant === 'PIT' && pitDb) {
    const rows = pitDb.prepare(`
      SELECT symbol, availableAt, netIncome, revenue
      FROM FinancialFiling
      ORDER BY symbol, availableAt ASC
    `).all() as any[];
    for (const r of rows) {
      const list = pitFilingCache.get(r.symbol) ?? [];
      list.push(r);
      pitFilingCache.set(r.symbol, list);
    }
  }

  // State
  let cashEur = INITIAL_CAPITAL;
  let openPositions: Position[] = [];
  const closedTrades: ClosedTrade[] = [];
  const dailyCurve: DailyCurvePoint[] = [];
  let peakEquity = INITIAL_CAPITAL;

  // Pending next-day execution orders
  interface PendingOrder {
    symbol: string;
    name: string;
    sector: string;
    engine: EngineType;
    allocEur: number;
    stopLossPct: number;
    targetNote: string;
    reason: string;
  }
  let pendingOrders: PendingOrder[] = [];

  const startIndex = allDates.findIndex(d => d >= options.startDate);
  const endIndex = allDates.findIndex(d => d > options.endDate);
  const simDates = allDates.slice(
    startIndex >= 0 ? startIndex : 0,
    endIndex >= 0 ? endIndex : allDates.length,
  );

  const spyData = symIndex.get('SPY')!;
  const spyStartIdx = spyData.dateToIndex.get(simDates[0]) ?? 0;
  const spyStartClose = spyData.closes[spyStartIdx];
  let spyTrEquity = INITIAL_CAPITAL;

  for (let dIdx = 0; dIdx < simDates.length; dIdx++) {
    const date = simDates[dIdx];
    const nextDate = dIdx + 1 < simDates.length ? simDates[dIdx + 1] : null;

    const spyIdx = spyData.dateToIndex.get(date);
    if (spyIdx === undefined) continue;

    const spyClose = spyData.closes[spyIdx];
    const spyPrevClose = spyIdx > 0 ? spyData.closes[spyIdx - 1] : spyClose;
    const spyDayReturnPct = ((spyClose - spyPrevClose) / spyPrevClose) * 100;
    const spyDayTrReturnPct = spyDayReturnPct + (SPY_DIVIDEND_YIELD_ANNUAL / 252) * 100;
    spyTrEquity *= (1 + spyDayTrReturnPct / 100);

    const spySma20 = computeSMA(spyData.closes, spyIdx, 20);
    const spySma50 = computeSMA(spyData.closes, spyIdx, 50);
    const spySma200 = computeSMA(spyData.closes, spyIdx, 200);

    let regime: 'BULL' | 'CAUTIOUS' | 'DEFENSIVE' = 'DEFENSIVE';
    if (spySma200 !== null && spyClose > spySma200) {
      if (spySma50 !== null && spyClose > spySma50) {
        regime = 'BULL';
      } else {
        regime = 'CAUTIOUS';
      }
    }

    // ─── 0. Next-Day Execution of Pending Orders from Day T-1 ─────────────────
    if (options.executionTiming === 'NEXT_DAY' && pendingOrders.length > 0) {
      for (const order of pendingOrders) {
        if (openPositions.length >= MAX_POSITIONS) break;
        const sData = symIndex.get(order.symbol);
        const curIdx = sData?.dateToIndex.get(date);
        if (!sData || curIdx === undefined) continue;

        const entryPx = sData.closes[curIdx] * (1 + SLIPPAGE_PCT);
        const actualAlloc = Math.min(order.allocEur, cashEur - FEE_PER_ORDER);
        if (actualAlloc < 500) continue;

        const shares = (actualAlloc - FEE_PER_ORDER) / entryPx;
        const totalCostEur = shares * entryPx + FEE_PER_ORDER;
        cashEur -= totalCostEur;

        openPositions.push({
          id: `${date}-${order.symbol}`,
          symbol: order.symbol,
          name: order.name,
          sector: order.sector,
          engine: order.engine,
          entryDate: date,
          entryPrice: Number(entryPx.toFixed(2)),
          shares: Number(shares.toFixed(4)),
          investedEur: Number(totalCostEur.toFixed(2)),
          stopLossPrice: Number((entryPx * (1 - order.stopLossPct)).toFixed(2)),
          peakClose: sData.closes[curIdx],
          daysHeld: 0,
          currentPrice: sData.closes[curIdx],
        });
      }
      pendingOrders = [];
    }

    // ─── 1. Idle Cash Growth & Core Overlay ───────────────────────────────────
    const prevRegime = dailyCurve.length > 0 ? dailyCurve[dailyCurve.length - 1].regime : regime;
    const spySma100 = computeSMA(spyData.closes, spyIdx, 100);
    const isDeepCorrection = prevRegime === 'DEFENSIVE' || (spySma100 !== null && spyClose < spySma100 * 0.985);

    let idleReturnEur = 0;
    const mmDailyRate = CASH_YIELD_ANNUAL / 252;

    if (options.useCoreOverlay) {
      const spyCoreWeight = prevRegime === 'BULL' ? 1.0 : isDeepCorrection ? 0.0 : 0.65;
      idleReturnEur = cashEur * (spyCoreWeight * (spyDayReturnPct / 100) + (1 - spyCoreWeight) * mmDailyRate);
    } else {
      // Pure stock-picking: idle cash only gets risk-free rate (3.5% p.a.), NO riding SPY
      idleReturnEur = cashEur * mmDailyRate;
    }
    cashEur += idleReturnEur;

    // ─── 2. Evaluate Exits on Open Positions ──────────────────────────────────
    const upcomingEarningsNext2Days = new Set<string>();
    const nearEarningsWindow = new Set<string>();

    if (options.variant !== 'NO_FUNDAMENTALS') {
      const startWin = shiftDaysISO(date, -5);
      const endWin = shiftDaysISO(date, 10);
      const startNext2 = date;
      const endNext2 = shiftDaysISO(date, 2);

      for (const ev of dataset.earnings) {
        if (ev.date >= startWin && ev.date <= endWin) nearEarningsWindow.add(ev.ticker);
        if (ev.date >= startNext2 && ev.date <= endNext2) upcomingEarningsNext2Days.add(ev.ticker);
      }
    }

    const remainingPositions: Position[] = [];
    for (const pos of openPositions) {
      const sData = symIndex.get(pos.symbol);
      const idx = sData?.dateToIndex.get(date);
      if (!sData || idx === undefined) {
        remainingPositions.push(pos);
        continue;
      }

      const close = sData.closes[idx];
      pos.currentPrice = close;
      pos.daysHeld += 1;
      if (close > pos.peakClose) pos.peakClose = close;

      let exitReason: string | null = null;
      const returnPct = (close - pos.entryPrice) / pos.entryPrice;

      if (pos.engine === 'RSI2_MEAN_REV') {
        const sma5 = computeSMA(sData.closes, idx, 5);
        const sma50 = computeSMA(sData.closes, idx, 50);
        const rsi2Now = computeRSI2(sData.closes, idx);
        const healthyAboveSma50 = sma50 !== null && close >= sma50;

        if (upcomingEarningsNext2Days.has(pos.symbol)) {
          exitReason = 'Pre-Earnings Exit';
        } else if (close <= pos.stopLossPrice) {
          exitReason = 'Stop Loss (-5.5%)';
        } else if (sma5 !== null && close >= sma5 && returnPct >= 0.002) {
          exitReason = 'Take Profit (Close >= SMA5)';
        } else if (rsi2Now !== null && rsi2Now >= 65 && returnPct >= 0.0025) {
          exitReason = 'Take Profit (RSI2 >= 65)';
        } else if (pos.daysHeld >= 6 && returnPct >= 0.0015) {
          exitReason = 'Patient Profit Exit';
        } else if (!healthyAboveSma50 && pos.daysHeld >= 5 && sma5 !== null && close >= sma5) {
          exitReason = 'Connors SMA5 Exit';
        } else if (pos.daysHeld >= (healthyAboveSma50 ? 12 : 7)) {
          exitReason = 'Time Stop';
        }
      } else if (pos.engine === 'PEAD_DRIFT') {
        const sma20 = computeSMA(sData.closes, idx, 20);
        const sma50 = computeSMA(sData.closes, idx, 50);
        const drawdownFromPeak = (close - pos.peakClose) / pos.peakClose;

        if (pos.peakClose >= pos.entryPrice * 1.035) {
          const lockStop = Math.max(pos.stopLossPrice, pos.entryPrice * 1.006, pos.peakClose * 0.942);
          pos.stopLossPrice = Number(lockStop.toFixed(2));
        }

        if (close <= pos.stopLossPrice) {
          exitReason = pos.stopLossPrice > pos.entryPrice ? 'Trailing Profit Stop' : 'Stop Loss (-4.5%)';
        } else if (drawdownFromPeak <= -0.058 && pos.daysHeld >= 2) {
          exitReason = 'Trailing Stop (-5.8% from peak)';
        } else if (pos.daysHeld >= 5 && sma20 !== null && close < sma20 && (returnPct >= 0.003 || returnPct <= -0.018 || (sma50 !== null && close < sma50))) {
          exitReason = 'Trend Exit (Close < SMA20)';
        } else if (returnPct >= 0.18) {
          exitReason = 'Take Profit (+18%)';
        } else if (pos.daysHeld >= 20 && (returnPct >= 0.002 || returnPct <= -0.015)) {
          exitReason = 'Time Exit (20d)';
        } else if (pos.daysHeld >= 26) {
          exitReason = 'Max Hold Exit (26d)';
        }
      } else if (pos.engine === 'SMA200_SNIPER') {
        const sma5 = computeSMA(sData.closes, idx, 5);
        const sma10 = computeSMA(sData.closes, idx, 10);
        if (upcomingEarningsNext2Days.has(pos.symbol) && returnPct >= 0.002) {
          exitReason = 'Pre-Earnings Profit Lock';
        } else if (close <= pos.stopLossPrice) {
          exitReason = 'Stop Loss (-5.0%)';
        } else if (sma10 !== null && close >= sma10 && returnPct >= 0.012) {
          exitReason = 'Take Profit (> SMA10)';
        } else if (sma5 !== null && close >= sma5 && returnPct >= 0.005) {
          exitReason = 'Take Profit (> SMA5)';
        } else if (pos.daysHeld >= 14) {
          exitReason = 'Time Exit (14d)';
        }
      }

      if (exitReason) {
        const triggerPrice = exitReason.startsWith('Trailing Profit Stop') && close >= pos.stopLossPrice * 0.97
          ? pos.stopLossPrice
          : close;
        const effectiveExitPx = triggerPrice * (1 - SLIPPAGE_PCT);
        const grossProceeds = pos.shares * effectiveExitPx;
        const netProceeds = grossProceeds - FEE_PER_ORDER;
        const netPnlEur = netProceeds - pos.investedEur;
        const netPnlPct = (netPnlEur / pos.investedEur) * 100;

        cashEur += netProceeds;
        closedTrades.push({
          id: pos.id,
          symbol: pos.symbol,
          engine: pos.engine,
          entryDate: pos.entryDate,
          exitDate: date,
          entryPrice: pos.entryPrice,
          exitPrice: Number(effectiveExitPx.toFixed(2)),
          investedEur: pos.investedEur,
          netPnlEur: Number(netPnlEur.toFixed(2)),
          netPnlPct: Number(netPnlPct.toFixed(2)),
          daysHeld: pos.daysHeld,
          exitReason,
        });
      } else {
        remainingPositions.push(pos);
      }
    }
    openPositions = remainingPositions;

    // ─── 3. Scan for New Candidates ───────────────────────────────────────────
    const cooldownCutoff = shiftDaysISO(date, -COOLDOWN_DAYS);
    const cooldownSymbols = new Set<string>();
    for (const ct of closedTrades) {
      if (ct.exitDate >= cooldownCutoff) cooldownSymbols.add(ct.symbol);
    }
    const heldSymbols = new Set(openPositions.map(p => p.symbol));
    const todaysCandidates: {
      symbol: string;
      name: string;
      sector: string;
      engine: EngineType;
      closePrice: number;
      stopLossPct: number;
      score: number;
      reason: string;
    }[] = [];

    const isMacroSelloffDay = spyDayReturnPct <= -1.0;
    const spyAboveSma20 = spySma20 !== null && spyClose >= spySma20;

    // Engine 2A: PEAD (only active in Original and PIT variants)
    if (options.variant !== 'NO_FUNDAMENTALS' && regime === 'BULL' && spyAboveSma20 && !isMacroSelloffDay) {
      const prevDate1 = spyIdx >= 1 ? allDates[spyIdx - 1] : '';
      const prevDate2 = spyIdx >= 2 ? allDates[spyIdx - 2] : '';
      const seenPead = new Set<string>();

      for (const rDate of [date, prevDate1, prevDate2]) {
        if (!rDate) continue;
        for (const ev of earningsByReactDate.get(rDate) ?? []) {
          if (seenPead.has(ev.ticker) || cooldownSymbols.has(ev.ticker) || heldSymbols.has(ev.ticker)) continue;
          if (DUPLICATE_SHARE_CLASSES.has(ev.ticker)) continue;

          const meta = dataset.tickers[ev.ticker];
          const sData = symIndex.get(ev.ticker);
          const idx = sData?.dateToIndex.get(date);
          const rIdx = sData?.dateToIndex.get(rDate);
          if (!sData || idx === undefined || rIdx === undefined || rIdx < 75) continue;

          // Double beat check
          const epsBeat = ev.epsActual > ev.epsEstimate && (ev.epsSurprisePct >= 5.0 || (ev.epsEstimate < 0 && ev.epsActual > 0));
          const revBeat = ev.revActual > ev.revEstimate && ev.revSurprisePct >= 1.5;
          if (!epsBeat || !revBeat) continue;

          const reactClose = sData.closes[rIdx];
          const preEarnClose = sData.closes[rIdx - 1];
          const reactMovePct = ((reactClose - preEarnClose) / preEarnClose) * 100;
          if (reactMovePct < 3.5 || reactMovePct > 14.0) continue;

          const close = sData.closes[idx];
          if (idx > rIdx) {
            const followThroughPct = ((close - reactClose) / reactClose) * 100;
            if (followThroughPct < 0.2 || followThroughPct > 5.0) continue;
          }

          let high30 = 0;
          for (let k = idx - 30; k < idx; k++) {
            if (sData.closes[k] > high30) high30 = sData.closes[k];
          }
          if (close < high30) continue;

          const sma50 = computeSMA(sData.closes, idx, 50);
          const sma200 = computeSMA(sData.closes, idx, 200);
          if (sma50 === null || sma200 === null || close < sma50 || close < sma200 || sma50 < sma200) continue;

          // Fundamental verification:
          let fundScore = 50;
          if (options.variant === 'ORIGINAL') {
            if (!meta || meta.marketCapB < 12 || meta.fundLevel === 'weak') continue;
            fundScore = meta.overallScore;
          } else if (options.variant === 'PIT') {
            const filings = pitFilingCache.get(ev.ticker) ?? [];
            const asOfTime = `${date}T23:59:59Z`;
            const eligible = filings.filter(f => f.availableAt <= asOfTime);
            if (eligible.length === 0) continue; // No PIT filing available
            const latest = eligible[eligible.length - 1];
            if (latest.netIncome === null || latest.netIncome <= 0) continue; // Loss-making in PIT
            fundScore = 70;
          }

          seenPead.add(ev.ticker);
          const score = ev.epsSurprisePct * 0.4 + ev.revSurprisePct * 1.8 + reactMovePct * 1.5 + fundScore * 0.8;
          todaysCandidates.push({
            symbol: ev.ticker,
            name: meta?.name ?? ev.ticker,
            sector: meta?.sector ?? 'Unknown',
            engine: 'PEAD_DRIFT',
            closePrice: close,
            stopLossPct: 0.045,
            score,
            reason: `PEAD Double Beat (EPS +${ev.epsSurprisePct.toFixed(1)}%, Rev +${ev.revSurprisePct.toFixed(1)}%)`,
          });
        }
      }
    }

    // Engine 2B: 50-Day Catalyst Breakout (M2B)
    if (regime === 'BULL' && spyAboveSma20 && !isMacroSelloffDay) {
      for (const [symbol, sData] of symIndex.entries()) {
        if (symbol === 'SPY' || DUPLICATE_SHARE_CLASSES.has(symbol) || cooldownSymbols.has(symbol) || heldSymbols.has(symbol)) continue;
        if (upcomingEarningsNext2Days.has(symbol)) continue;

        const meta = dataset.tickers[symbol];

        // Fundamental filter for Original vs PIT vs No Fundamentals
        let fundScore = 50;
        if (options.variant === 'ORIGINAL') {
          if (!meta || meta.marketCapB < 25 || meta.fundLevel !== 'strong' || meta.overallScore < 75) continue;
          fundScore = meta.overallScore;
        } else if (options.variant === 'PIT') {
          const filings = pitFilingCache.get(symbol) ?? [];
          const asOfTime = `${date}T23:59:59Z`;
          const eligible = filings.filter(f => f.availableAt <= asOfTime);
          if (eligible.length === 0) continue;
          const latest = eligible[eligible.length - 1];
          if (latest.netIncome === null || latest.netIncome <= 0) continue;
          fundScore = 75;
        }
        // If NO_FUNDAMENTALS: no check!

        const idx = sData.dateToIndex.get(date);
        if (idx === undefined || idx < 75) continue;

        const close = sData.closes[idx];
        const prevClose = sData.closes[idx - 1];
        const dayGainPct = ((close - prevClose) / prevClose) * 100;
        if (dayGainPct < 3.0 || dayGainPct > 8.5) continue;

        let high50 = 0;
        for (let k = idx - 50; k < idx; k++) {
          if (sData.closes[k] > high50) high50 = sData.closes[k];
        }
        if (close <= high50 * 1.003 || prevClose >= high50) continue;

        let high15 = 0;
        let low15 = Infinity;
        for (let k = idx - 15; k < idx; k++) {
          if (sData.closes[k] > high15) high15 = sData.closes[k];
          if (sData.closes[k] < low15) low15 = sData.closes[k];
        }
        const boxRangePct = ((high15 - low15) / low15) * 100;
        if (boxRangePct > 8.0) continue;

        const sma50 = computeSMA(sData.closes, idx, 50);
        const sma200 = computeSMA(sData.closes, idx, 200);
        if (sma50 === null || sma200 === null || close < sma50 || sma50 < sma200) continue;

        const score = options.variant === 'NO_FUNDAMENTALS'
          ? dayGainPct * 10 + (9 - boxRangePct) * 8
          : dayGainPct * 6 + (9 - boxRangePct) * 5 + fundScore * 0.6;

        todaysCandidates.push({
          symbol,
          name: meta?.name ?? symbol,
          sector: meta?.sector ?? 'Unknown',
          engine: 'PEAD_DRIFT',
          closePrice: close,
          stopLossPct: 0.045,
          score,
          reason: `50d Breakout (+${dayGainPct.toFixed(1)}% z ${boxRangePct.toFixed(1)}% boxu)`,
        });
      }
    }

    // Engine 1: RSI(2) Mean Reversion
    const maxRsiThreshold = regime === 'BULL' ? 3.5 : 1.5;
    const minDipFromSma5 = regime === 'BULL' ? -2.6 : -4.0;

    for (const [symbol, sData] of symIndex.entries()) {
      if (symbol === 'SPY' || isMacroSelloffDay || regime === 'DEFENSIVE') continue;
      if (DUPLICATE_SHARE_CLASSES.has(symbol) || cooldownSymbols.has(symbol) || heldSymbols.has(symbol)) continue;
      if (nearEarningsWindow.has(symbol)) continue;

      const meta = dataset.tickers[symbol];
      let fundScore = 50;
      if (options.variant === 'ORIGINAL') {
        if (!meta || meta.marketCapB < 35 || meta.fundLevel !== 'strong' || meta.overallScore < 66) continue;
        fundScore = meta.overallScore;
      } else if (options.variant === 'PIT') {
        const filings = pitFilingCache.get(symbol) ?? [];
        const asOfTime = `${date}T23:59:59Z`;
        const eligible = filings.filter(f => f.availableAt <= asOfTime);
        if (eligible.length === 0) continue;
        const latest = eligible[eligible.length - 1];
        if (latest.netIncome === null || latest.netIncome <= 0) continue;
        fundScore = 70;
      }

      const idx = sData.dateToIndex.get(date);
      if (idx === undefined || idx < 75) continue;

      const vol20 = computeStdDevPct(sData.closes, idx, 20);
      if (vol20 === null || vol20 > 1.65) continue;

      const close = sData.closes[idx];
      const close60dAgo = sData.closes[idx - 60];
      const ret60d = (close - close60dAgo) / close60dAgo;
      if (ret60d < 0.0 || ret60d > 0.2) continue;

      const prev1 = sData.closes[idx - 1];
      const prev2 = sData.closes[idx - 2];
      const oneDayDropPct = ((close - prev1) / prev1) * 100;
      if (!(close < prev1 && prev1 < prev2) || oneDayDropPct < -3.2) continue;

      const sma200 = computeSMA(sData.closes, idx, 200);
      const sma50 = computeSMA(sData.closes, idx, 50);
      const sma5 = computeSMA(sData.closes, idx, 5);
      if (sma200 === null || sma50 === null || sma5 === null) continue;
      if (close <= sma200 * 1.03 || sma50 <= sma200 || close < sma50 * 0.99) continue;

      const distFromSma5Pct = ((close - sma5) / sma5) * 100;
      if (distFromSma5Pct > minDipFromSma5) continue;

      const rsi2 = computeRSI2(sData.closes, idx);
      if (rsi2 === null || rsi2 > maxRsiThreshold) continue;

      const score = options.variant === 'NO_FUNDAMENTALS'
        ? (10 - rsi2) * 15 + Math.abs(distFromSma5Pct) * 4 + (2.0 - vol20) * 20
        : (10 - rsi2) * 12 + Math.abs(distFromSma5Pct) * 2.5 + (2.0 - vol20) * 15 + fundScore * 0.5;

      todaysCandidates.push({
        symbol,
        name: meta?.name ?? symbol,
        sector: meta?.sector ?? 'Unknown',
        engine: 'RSI2_MEAN_REV',
        closePrice: close,
        stopLossPct: 0.055,
        score,
        reason: `RSI2 = ${rsi2.toFixed(1)}, Dip ${distFromSma5Pct.toFixed(1)}%`,
      });
    }

    // ─── 4. Allocate to Top Candidate ─────────────────────────────────────────
    todaysCandidates.sort((a, b) => b.score - a.score);

    const currentEquity = cashEur + openPositions.reduce((acc, p) => acc + p.shares * p.currentPrice, 0);
    const basePositionSize = regime === 'DEFENSIVE'
      ? (currentEquity / MAX_POSITIONS) * 0.5
      : regime === 'CAUTIOUS'
        ? (currentEquity / MAX_POSITIONS) * 0.75
        : currentEquity / MAX_POSITIONS;

    if (todaysCandidates.length > 0 && openPositions.length < MAX_POSITIONS) {
      const topCand = todaysCandidates[0];
      const allocEur = Math.min(basePositionSize, cashEur - FEE_PER_ORDER);

      if (allocEur >= 500) {
        if (options.executionTiming === 'SAME_DAY_CLOSE') {
          // Same-day Close Execution (Original bot flaw)
          const effectiveEntryPrice = topCand.closePrice * (1 + SLIPPAGE_PCT);
          const shares = (allocEur - FEE_PER_ORDER) / effectiveEntryPrice;
          const totalCostEur = shares * effectiveEntryPrice + FEE_PER_ORDER;

          cashEur -= totalCostEur;
          heldSymbols.add(topCand.symbol);

          openPositions.push({
            id: `${date}-${topCand.symbol}`,
            symbol: topCand.symbol,
            name: topCand.name,
            sector: topCand.sector,
            engine: topCand.engine,
            entryDate: date,
            entryPrice: Number(effectiveEntryPrice.toFixed(2)),
            shares: Number(shares.toFixed(4)),
            investedEur: Number(totalCostEur.toFixed(2)),
            stopLossPrice: Number((topCand.closePrice * (1 - topCand.stopLossPct)).toFixed(2)),
            peakClose: topCand.closePrice,
            daysHeld: 0,
            currentPrice: topCand.closePrice,
          });
        } else {
          // Next-Day Execution (Realistic, zero lookahead)
          pendingOrders.push({
            symbol: topCand.symbol,
            name: topCand.name,
            sector: topCand.sector,
            engine: topCand.engine,
            allocEur,
            stopLossPct: topCand.stopLossPct,
            targetNote: '',
            reason: topCand.reason,
          });
        }
      }
    }

    // ─── 5. Record Daily Snapshot ─────────────────────────────────────────────
    const investedMarketValue = openPositions.reduce((sum, p) => sum + p.shares * p.currentPrice, 0);
    const totalEquity = cashEur + investedMarketValue;
    if (totalEquity > peakEquity) peakEquity = totalEquity;
    const drawdownPct = peakEquity > 0 ? ((totalEquity - peakEquity) / peakEquity) * 100 : 0;
    const prevEquity = dailyCurve.length > 0 ? dailyCurve[dailyCurve.length - 1].equityEur : INITIAL_CAPITAL;
    const dailyReturnPct = ((totalEquity - prevEquity) / prevEquity) * 100;
    const spyNormalizedEur = INITIAL_CAPITAL * (spyClose / spyStartClose);

    dailyCurve.push({
      date,
      equityEur: Number(totalEquity.toFixed(2)),
      cashEur: Number(cashEur.toFixed(2)),
      investedEur: Number(investedMarketValue.toFixed(2)),
      spyNormalizedEur: Number(spyNormalizedEur.toFixed(2)),
      spyTrNormalizedEur: Number(spyTrEquity.toFixed(2)),
      regime,
      dailyReturnPct: Number(dailyReturnPct.toFixed(4)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
    });
  }

  // ─── Performance Statistics Calculation ─────────────────────────────────────
  const endEquity = dailyCurve[dailyCurve.length - 1]?.equityEur ?? INITIAL_CAPITAL;
  const totalReturnPct = ((endEquity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const years = simDates.length / 252;
  const cagrPct = (Math.pow(endEquity / INITIAL_CAPITAL, 1 / Math.max(0.1, years)) - 1) * 100;
  const maxDrawdownPct = Math.min(0, ...dailyCurve.map(d => d.drawdownPct));

  // Daily returns for Sharpe / Sortino
  const dailyReturns = dailyCurve.map(d => d.dailyReturnPct / 100);
  const meanDailyRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const dailyRf = CASH_YIELD_ANNUAL / 252;
  const excessDailyReturns = dailyReturns.map(r => r - dailyRf);

  const variance = dailyReturns.reduce((acc, r) => acc + (r - meanDailyRet) ** 2, 0) / dailyReturns.length;
  const stdDaily = Math.sqrt(variance);
  const annualizedVol = stdDaily * Math.sqrt(252);
  const sharpeRatio = annualizedVol > 0 ? ((meanDailyRet - dailyRf) * 252) / annualizedVol : 0;

  // Downside deviation for Sortino
  const downsideReturns = dailyReturns.map(r => Math.min(0, r - dailyRf));
  const downsideVariance = downsideReturns.reduce((acc, r) => acc + r ** 2, 0) / downsideReturns.length;
  const downsideStd = Math.sqrt(downsideVariance) * Math.sqrt(252);
  const sortinoRatio = downsideStd > 0 ? ((meanDailyRet - dailyRf) * 252) / downsideStd : 0;

  const calmarRatio = Math.abs(maxDrawdownPct) > 0 ? cagrPct / Math.abs(maxDrawdownPct) : 0;

  // Trade stats
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter(t => t.netPnlEur > 0).length;
  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const grossGains = closedTrades.filter(t => t.netPnlEur > 0).reduce((acc, t) => acc + t.netPnlEur, 0);
  const grossLosses = Math.abs(closedTrades.filter(t => t.netPnlEur < 0).reduce((acc, t) => acc + t.netPnlEur, 0));
  const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 99 : 0;
  const totalVolumeEur = closedTrades.reduce((acc, t) => acc + t.investedEur * 2, 0);
  const annualTurnoverPct = (totalVolumeEur / INITIAL_CAPITAL / Math.max(0.1, years)) * 100;

  // SPY TR return
  const spyTrEnd = dailyCurve[dailyCurve.length - 1]?.spyTrNormalizedEur ?? INITIAL_CAPITAL;
  const spyTrReturnPct = ((spyTrEnd - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const alphaVsSpyTrPct = totalReturnPct - spyTrReturnPct;

  // Yearly breakdown
  const yearlyMap = new Map<number, { startEq: number; endEq: number; startSpyTr: number; endSpyTr: number; trades: number; wins: number }>();
  for (let i = 0; i < dailyCurve.length; i++) {
    const pt = dailyCurve[i];
    const year = parseInt(pt.date.slice(0, 4), 10);
    if (!yearlyMap.has(year)) {
      yearlyMap.set(year, {
        startEq: i > 0 ? dailyCurve[i - 1].equityEur : INITIAL_CAPITAL,
        endEq: pt.equityEur,
        startSpyTr: i > 0 ? dailyCurve[i - 1].spyTrNormalizedEur : INITIAL_CAPITAL,
        endSpyTr: pt.spyTrNormalizedEur,
        trades: 0,
        wins: 0,
      });
    }
    const yRec = yearlyMap.get(year)!;
    yRec.endEq = pt.equityEur;
    yRec.endSpyTr = pt.spyTrNormalizedEur;
  }
  for (const tr of closedTrades) {
    const yr = parseInt(tr.exitDate.slice(0, 4), 10);
    if (yearlyMap.has(yr)) {
      const rec = yearlyMap.get(yr)!;
      rec.trades++;
      if (tr.netPnlEur > 0) rec.wins++;
    }
  }

  const yearly: YearlyMetric[] = Array.from(yearlyMap.entries()).map(([year, data]) => ({
    year,
    strategyReturnPct: Number((((data.endEq - data.startEq) / data.startEq) * 100).toFixed(2)),
    spyTrReturnPct: Number((((data.endSpyTr - data.startSpyTr) / data.startSpyTr) * 100).toFixed(2)),
    trades: data.trades,
    winRatePct: data.trades > 0 ? Number(((data.wins / data.trades) * 100).toFixed(1)) : 0,
  }));

  // Regime breakdown
  const regimeMap: Record<string, { days: number; startEq: number; endEq: number; startSpy: number; endSpy: number }> = {
    BULL: { days: 0, startEq: 0, endEq: 0, startSpy: 0, endSpy: 0 },
    CAUTIOUS: { days: 0, startEq: 0, endEq: 0, startSpy: 0, endSpy: 0 },
    DEFENSIVE: { days: 0, startEq: 0, endEq: 0, startSpy: 0, endSpy: 0 },
  };
  let curReg = dailyCurve[0]?.regime ?? 'DEFENSIVE';
  for (const pt of dailyCurve) {
    regimeMap[pt.regime].days++;
  }
  const regimes: RegimeMetric[] = Object.entries(regimeMap).map(([reg, data]) => ({
    regime: reg,
    days: data.days,
    strategyReturnPct: 0,
    spyTrReturnPct: 0,
  }));

  // Bootstrap p-value (10,000 resamples of active daily returns vs SPY TR)
  const activeDailyReturns: number[] = [];
  for (let i = 1; i < dailyCurve.length; i++) {
    const stratRet = (dailyCurve[i].equityEur - dailyCurve[i - 1].equityEur) / dailyCurve[i - 1].equityEur;
    const spyRet = (dailyCurve[i].spyTrNormalizedEur - dailyCurve[i - 1].spyTrNormalizedEur) / dailyCurve[i - 1].spyTrNormalizedEur;
    activeDailyReturns.push(stratRet - spyRet);
  }

  let bootstrapUnderCount = 0;
  const NUM_BOOTSTRAP = 10_000;
  const n = activeDailyReturns.length;
  if (n > 0) {
    for (let b = 0; b < NUM_BOOTSTRAP; b++) {
      let bSum = 0;
      for (let i = 0; i < n; i++) {
        const randIdx = Math.floor(Math.random() * n);
        bSum += activeDailyReturns[randIdx];
      }
      const bMean = bSum / n;
      if (bMean <= 0) {
        bootstrapUnderCount++;
      }
    }
  }
  const bootstrapPValue = Number((bootstrapUnderCount / NUM_BOOTSTRAP).toFixed(4));

  return {
    config: options,
    startEquity: INITIAL_CAPITAL,
    endEquity: Number(endEquity.toFixed(2)),
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    cagrPct: Number(cagrPct.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    sortinoRatio: Number(sortinoRatio.toFixed(2)),
    calmarRatio: Number(calmarRatio.toFixed(2)),
    totalTrades,
    winRatePct: Number(winRatePct.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    annualTurnoverPct: Number(annualTurnoverPct.toFixed(1)),
    alphaVsSpyTrPct: Number(alphaVsSpyTrPct.toFixed(2)),
    bootstrapPValue,
    yearly,
    regimes,
    dailyCurve,
  };
}

// ─── Main Execution Pipeline ──────────────────────────────────────────────────

async function main() {
  console.log('================================================================================');
  console.log(' PMP FINAL SPRINT: 3-WAY ABLATION EXPERIMENT & BENCHMARK SUITE');
  console.log('================================================================================\n');

  if (!fs.existsSync(MARKET_CACHE_FILE)) {
    throw new Error(`Market cache not found at: ${MARKET_CACHE_FILE}`);
  }
  const rawCache = JSON.parse(fs.readFileSync(MARKET_CACHE_FILE, 'utf8')) as MarketDataset;
  console.log(`✓ Loaded market dataset: ${Object.keys(rawCache.tickers).length} tickers, ${rawCache.allTradingDates.length} trading days (${rawCache.allTradingDates[0]} to ${rawCache.allTradingDates[rawCache.allTradingDates.length - 1]})`);

  let pitDb: Database.Database | null = null;
  const cohortSymbols = new Set<string>();
  if (fs.existsSync(PIT_DB_PATH)) {
    pitDb = new Database(PIT_DB_PATH, { readonly: true });
    const symRows = pitDb.prepare(`SELECT DISTINCT symbol FROM FinancialFiling ORDER BY symbol`).all() as any[];
    symRows.forEach(r => cohortSymbols.add(r.symbol));
    console.log(`✓ Connected to PIT V2 DB: ${cohortSymbols.size} cohort tickers (${Array.from(cohortSymbols).join(', ')})`);
  } else {
    console.warn(`⚠ PIT V2 DB not found at: ${PIT_DB_PATH}`);
  }

  const testConfigs: SimulationOptions[] = [
    // ─── 1. Controlled Cohort Ablation (27 Tickers - Ceteris Paribus) ───────────
    {
      name: 'Cohort: M2B Original (Close)',
      universeType: 'COHORT',
      variant: 'ORIGINAL',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },
    {
      name: 'Cohort: M2B PIT (Close)',
      universeType: 'COHORT',
      variant: 'PIT',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },
    {
      name: 'Cohort: M2B No Fundamentals (Close)',
      universeType: 'COHORT',
      variant: 'NO_FUNDAMENTALS',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },

    // ─── 2. Full Universe (648 Tickers) Ablation ──────────────────────────────
    {
      name: 'Full Universe: M2B Original (Bot Default)',
      universeType: 'FULL',
      variant: 'ORIGINAL',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },
    {
      name: 'Full Universe: M2B No Fundamentals (Pure Tech)',
      universeType: 'FULL',
      variant: 'NO_FUNDAMENTALS',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },

    // ─── 3. Bias Decomposition: Execution Timing & Core Overlay Attribution ───
    {
      name: 'Full Universe: Realistic Next-Day Execution',
      universeType: 'FULL',
      variant: 'ORIGINAL',
      executionTiming: 'NEXT_DAY',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },
    {
      name: 'Full Universe: Stock-Picking Only (No SPY Core)',
      universeType: 'FULL',
      variant: 'ORIGINAL',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: false,
      startDate: '2021-01-04',
      endDate: '2026-11-06',
    },

    // ─── 4. In-Sample (2021-2023) vs Out-Of-Sample (2024-2026) Validation ─────
    {
      name: 'IS (2021-2023): M2B Original',
      universeType: 'FULL',
      variant: 'ORIGINAL',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2021-01-04',
      endDate: '2023-12-29',
    },
    {
      name: 'OOS (2024-2026): M2B Original (Untouched)',
      universeType: 'FULL',
      variant: 'ORIGINAL',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2024-01-02',
      endDate: '2026-11-06',
    },
    {
      name: 'OOS (2024-2026): M2B No Fundamentals (Untouched)',
      universeType: 'FULL',
      variant: 'NO_FUNDAMENTALS',
      executionTiming: 'SAME_DAY_CLOSE',
      useCoreOverlay: true,
      startDate: '2024-01-02',
      endDate: '2026-11-06',
    },
  ];

  const results: BacktestResult[] = [];

  for (const cfg of testConfigs) {
    process.stdout.write(`Running backtest: ${cfg.name}... `);
    const t0 = Date.now();
    const res = runBacktest(rawCache, pitDb, cohortSymbols, cfg);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    results.push(res);
    console.log(`Done (${elapsed}s) -> Total Ret: ${res.totalReturnPct >= 0 ? '+' : ''}${res.totalReturnPct}%, CAGR: ${res.cagrPct}%, MaxDD: ${res.maxDrawdownPct}%, Sharpe: ${res.sharpeRatio}, Trades: ${res.totalTrades}`);
  }

  // ─── Export CSV & JSON ──────────────────────────────────────────────────────
  const csvHeaders = [
    'Scenario',
    'Universe',
    'Variant',
    'Execution',
    'CoreOverlay',
    'StartDate',
    'EndDate',
    'StartEquity',
    'EndEquity',
    'TotalReturnPct',
    'CAGR',
    'MaxDrawdown',
    'Sharpe',
    'Sortino',
    'Calmar',
    'Trades',
    'WinRate',
    'ProfitFactor',
    'AnnualTurnoverPct',
    'AlphaVsSpyTrPct',
    'BootstrapPValue',
  ];

  const csvRows = results.map(r => [
    `"${r.config.name}"`,
    r.config.universeType,
    r.config.variant,
    r.config.executionTiming,
    r.config.useCoreOverlay ? 'YES' : 'NO',
    r.config.startDate,
    r.config.endDate,
    r.startEquity,
    r.endEquity,
    r.totalReturnPct,
    r.cagrPct,
    r.maxDrawdownPct,
    r.sharpeRatio,
    r.sortinoRatio,
    r.calmarRatio,
    r.totalTrades,
    r.winRatePct,
    r.profitFactor,
    r.annualTurnoverPct,
    r.alphaVsSpyTrPct,
    r.bootstrapPValue,
  ].join(','));

  const CSV_FILE = '/tmp/pmp-final-sprint-results.csv';
  const JSON_FILE = '/tmp/pmp-final-sprint-results.json';

  fs.writeFileSync(CSV_FILE, [csvHeaders.join(','), ...csvRows].join('\n'));
  fs.writeFileSync(JSON_FILE, JSON.stringify(results.map(r => ({ ...r, dailyCurve: undefined })), null, 2));

  console.log(`\n✓ Results exported to: ${CSV_FILE}`);
  console.log(`✓ Results exported to: ${JSON_FILE}`);

  // Print Summary Table
  console.log('\n================================================================================');
  console.log(' PMP FINAL SPRINT SUMMARY TABLE');
  console.log('================================================================================');
  console.table(results.map(r => ({
    Scenario: r.config.name,
    Return: `${r.totalReturnPct >= 0 ? '+' : ''}${r.totalReturnPct}%`,
    CAGR: `${r.cagrPct}%`,
    MaxDD: `${r.maxDrawdownPct}%`,
    Sharpe: r.sharpeRatio,
    Calmar: r.calmarRatio,
    Trades: r.totalTrades,
    WinRate: `${r.winRatePct}%`,
    Alpha_SPY_TR: `${r.alphaVsSpyTrPct >= 0 ? '+' : ''}${r.alphaVsSpyTrPct}%`,
    P_Value: r.bootstrapPValue,
  })));
}

main().catch(err => {
  console.error('Fatal error running ablation:', err);
  process.exit(1);
});

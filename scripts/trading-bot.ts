/**
 * PMP Quantitative Paper-Trading Bot & Simulator (10,000 EUR)
 * ===========================================================
 *
 * Dual-Engine Daily Swing System:
 *   - Engine 1 (50% allocation): Short-Term Mean Reversion in Uptrend (Connors RSI(2) < 10 above SMA200)
 *   - Engine 2 (50% allocation): Post-Earnings Announcement Drift (PEAD Double-Beat + Momentum Breakout)
 *
 * Runs 100% locally on Mac — pulls read-only market & earnings data from VPS SQLite
 * (/var/www/premarketprice/prisma/data/premarket.db) over SSH, maintains a persistent
 * paper-trading ledger in ~/.cache/pmp-trading-bot/portfolio.json, automatically catches
 * up any missed trading days, and generates an interactive HTML dashboard.
 *
 * Usage:
 *   npx tsx scripts/trading-bot.ts                    # Catch up & print daily status + signals
 *   npx tsx scripts/trading-bot.ts --reset            # Reset & simulate from start date (default 2026-08-25)
 *   npx tsx scripts/trading-bot.ts --start 2026-01-02 --reset
 *   npx tsx scripts/trading-bot.ts --chart            # Generate & open HTML dashboard
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────

const INITIAL_CAPITAL = 10_000; // EUR
const MAX_POSITIONS = 1; // 1 concentrated conviction slot (100% into #1 highest-scoring signal)
const MAX_PER_ENGINE = 3; // Max 3 slots per engine
const MAX_PER_SECTOR = 2; // Max 2 positions in the same sector
const COOLDOWN_DAYS = 5; // Calendar days cooldown before re-entering the same ticker
const FEE_PER_ORDER = 1.0; // 1 EUR flat broker commission per buy/sell (IBKR tier)
const SLIPPAGE_PCT = 0.0005; // 5 bps (0.05%) realistic daily close execution slippage
const CASH_YIELD_ANNUAL = 0.035; // 3.5% p.a. yield on idle cash (XEON / SGOV money market)

const CACHE_DIR = path.join(os.homedir(), '.cache', 'pmp-trading-bot');
const MARKET_CACHE_FILE = path.join(CACHE_DIR, 'market-data-cache.json');
const LEDGER_FILE = path.join(CACHE_DIR, 'portfolio-ledger.json');
const HTML_REPORT_FILE = '/tmp/pmp-trading-bot.html';
const SSH_HOST = process.env.PMP_SSH ?? 'root@89.185.250.213';
const REMOTE_DB = '/var/www/premarketprice/prisma/data/premarket.db';

// ─── Types ────────────────────────────────────────────────────────────────────

type EngineType = 'RSI2_MEAN_REV' | 'PEAD_DRIFT' | 'SMA200_SNIPER';

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
  date: string; // YYYY-MM-DD
  close: number;
}

interface EarningsEvent {
  ticker: string;
  date: string; // YYYY-MM-DD
  time: string; // bmo | amc | tbd
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
  entryReason: string;
  currentPrice: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  engine: EngineType;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  investedEur: number;
  netPnlEur: number;
  netPnlPct: number;
  daysHeld: number;
  entryReason: string;
  exitReason: string;
}

interface DailySnapshot {
  date: string;
  equityEur: number;
  cashEur: number;
  investedEur: number;
  openPositionsCount: number;
  spyNormalizedEur: number;
  regime: 'BULL' | 'CAUTIOUS' | 'DEFENSIVE';
  drawdownPct: number;
}

interface CandidateSignal {
  symbol: string;
  name: string;
  sector: string;
  engine: EngineType;
  closePrice: number;
  stopLossPrice: number;
  targetNote: string;
  reason: string;
  score: number;
  action: 'OPENED' | 'WATCHLIST_SLOT_FULL' | 'SECTOR_CAP' | 'ALREADY_HELD';
}

interface PortfolioLedger {
  createdAt: string;
  startDate: string;
  lastProcessedDate: string;
  initialCapitalEur: number;
  cashEur: number;
  accruedInterestEur: number;
  openPositions: Position[];
  closedTrades: ClosedTrade[];
  dailyCurve: DailySnapshot[];
  latestSignals: CandidateSignal[];
}

// ─── CLI Args ─────────────────────────────────────────────────────────────────

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// ─── Data Fetching (Read-Only over SSH from VPS SQLite) ───────────────────────

function fetchMarketDataset(forceRefresh: boolean): MarketDataset {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  if (!forceRefresh && fs.existsSync(MARKET_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(MARKET_CACHE_FILE, 'utf8')) as MarketDataset;
      const ageMinutes = (Date.now() - new Date(cached.fetchedAt).getTime()) / 60_000;
      if (ageMinutes < 1440 && cached.allTradingDates.length > 100) {
        return cached;
      }
    } catch {
      // Ignore corrupt cache and refetch
    }
  }

  console.log(`📡 Sťahujem čerstvé trhové a earnings dáta z VPS (${SSH_HOST}) [read-only]...`);

  // Fetch from 2023-01-01 so SMA(200) is fully warmed up for 3Y and 1Y backtests
  const remoteScript = `
sqlite3 -readonly -separator "|" "${REMOTE_DB}" "
SELECT '===META===';
SELECT t.symbol,
       REPLACE(COALESCE(t.name, t.symbol), '|', ' '),
       COALESCE(t.sector, 'Unknown'),
       ROUND(COALESCE(t.lastMarketCap, 0), 2),
       COALESCE(a.fundLevel, 'unknown'),
       ROUND(COALESCE(a.overallScore, 50), 1),
       ROUND(COALESCE(a.healthScore, 50), 1)
FROM Ticker t
LEFT JOIN AnalysisCache a ON t.symbol = a.symbol
WHERE t.symbol = 'SPY'
   OR (
     t.isAdr = 0
     AND t.assetType = 'STOCK'
     AND t.lastMarketCap >= 12
     AND COALESCE(a.fundLevel, 'mixed') IN ('strong', 'mixed')
   );

SELECT '===EARNINGS===';
SELECT e.ticker,
       date(e.date / 1000, 'unixepoch'),
       LOWER(COALESCE(e.time, 'tbd')),
       ROUND(e.epsEstimate, 4),
       ROUND(e.epsActual, 4),
       ROUND(e.revenueEstimate, 0),
       ROUND(e.revenueActual, 0),
       ROUND(COALESCE(e.epsSurprisePercent, 0), 2),
       ROUND(COALESCE(e.revenueSurprisePercent, 0), 2)
FROM EarningsCalendar e
JOIN Ticker t ON e.ticker = t.symbol
WHERE e.epsActual IS NOT NULL
  AND e.epsEstimate IS NOT NULL
  AND e.revenueActual IS NOT NULL
  AND e.revenueEstimate IS NOT NULL
  AND t.isAdr = 0
  AND t.lastMarketCap >= 12
ORDER BY e.date ASC;

SELECT '===BARS===';
SELECT d.symbol,
       date(d.date / 1000, 'unixepoch') AS dt,
       ROUND(d.closePrice, 4)
FROM DailyValuationHistory d
WHERE d.date >= strftime('%s', '2021-01-01') * 1000
  AND d.closePrice IS NOT NULL
  AND d.closePrice > 1
  AND (
    d.symbol = 'SPY'
    OR d.symbol IN (
      SELECT t.symbol
      FROM Ticker t
      LEFT JOIN AnalysisCache a ON t.symbol = a.symbol
      WHERE t.isAdr = 0
        AND t.assetType = 'STOCK'
        AND t.lastMarketCap >= 12
        AND COALESCE(a.fundLevel, 'mixed') IN ('strong', 'mixed')
    )
  )
ORDER BY d.symbol ASC, d.date ASC;
" | gzip -c | base64
`;

  const b64 = execSync(`ssh ${SSH_HOST} '${remoteScript.replace(/'/g, "'\\''")}'`, {
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });

  const rawText = execSync(' gunzip -c', {
    input: Buffer.from(b64.replace(/\s+/g, ''), 'base64'),
    maxBuffer: 128 * 1024 * 1024,
  }).toString('utf8');

  const tickers: Record<string, TickerMeta> = {};
  const earnings: EarningsEvent[] = [];
  const barsBySymbol: Record<string, DailyBar[]> = {};

  let section: 'NONE' | 'META' | 'EARNINGS' | 'BARS' = 'NONE';
  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '===META===') {
      section = 'META';
      continue;
    }
    if (line === '===EARNINGS===') {
      section = 'EARNINGS';
      continue;
    }
    if (line === '===BARS===') {
      section = 'BARS';
      continue;
    }

    const parts = line.split('|');
    if (section === 'META' && parts.length >= 7) {
      const [symbol, name, sector, mc, fundLevel, overallScore, healthScore] = parts;
      tickers[symbol] = {
        symbol,
        name,
        sector,
        marketCapB: parseFloat(mc) || 0,
        fundLevel,
        overallScore: parseFloat(overallScore) || 50,
        healthScore: parseFloat(healthScore) || 50,
      };
    } else if (section === 'EARNINGS' && parts.length >= 9) {
      const [ticker, date, time, epsEst, epsAct, revEst, revAct, epsSurp, revSurp] = parts;
      const epsEstimate = parseFloat(epsEst);
      const epsActual = parseFloat(epsAct);
      const revEstimate = parseFloat(revEst);
      const revActual = parseFloat(revAct);
      if (Number.isFinite(epsEstimate) && Number.isFinite(epsActual)) {
        const computedEpsSurp =
          Math.abs(epsEstimate) > 0.01
            ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
            : parseFloat(epsSurp) || 0;
        const computedRevSurp =
          revEstimate > 0 ? ((revActual - revEstimate) / revEstimate) * 100 : parseFloat(revSurp) || 0;
        earnings.push({
          ticker,
          date,
          time,
          epsEstimate,
          epsActual,
          revEstimate,
          revActual,
          epsSurprisePct: computedEpsSurp,
          revSurprisePct: computedRevSurp,
        });
      }
    } else if (section === 'BARS' && parts.length >= 3) {
      const [symbol, date, closeStr] = parts;
      const close = parseFloat(closeStr);
      if (!Number.isFinite(close) || close <= 0) continue;
      if (!barsBySymbol[symbol]) barsBySymbol[symbol] = [];
      const arr = barsBySymbol[symbol];
      if (arr.length > 0 && arr[arr.length - 1].date === date) {
        arr[arr.length - 1].close = close;
      } else {
        arr.push({ date, close });
      }
    }
  }

  for (const sym of Object.keys(barsBySymbol)) {
    const bars = barsBySymbol[sym];
    let corrupt = false;
    for (let i = 1; i < bars.length; i++) {
      const ratio = bars[i].close / bars[i - 1].close;
      if (ratio > 1.85 || ratio < 0.45) {
        corrupt = true;
        break;
      }
    }
    if (corrupt && sym !== 'SPY') {
      delete barsBySymbol[sym];
    }
  }

  const spyBars = barsBySymbol['SPY'] ?? [];
  const allTradingDates = spyBars.map((b) => b.date);
  const latestDate = allTradingDates[allTradingDates.length - 1] ?? '';

  const dataset: MarketDataset = {
    fetchedAt: new Date().toISOString(),
    latestDate,
    tickers,
    barsBySymbol,
    earnings,
    allTradingDates,
  };

  fs.writeFileSync(MARKET_CACHE_FILE, JSON.stringify(dataset));
  return dataset;
}

// ─── Technical Indicators (Point-in-Time, Zero Look-Ahead) ────────────────────

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

// ─── Simulation & Daily Step Engine ───────────────────────────────────────────

interface IndexedSymbolData {
  closes: number[];
  dateToIndex: Map<string, number>;
}

function buildSymbolIndex(dataset: MarketDataset): Map<string, IndexedSymbolData> {
  const map = new Map<string, IndexedSymbolData>();
  for (const [sym, bars] of Object.entries(dataset.barsBySymbol)) {
    const closes = bars.map((b) => b.close);
    const dateToIndex = new Map<string, number>();
    bars.forEach((b, idx) => dateToIndex.set(b.date, idx));
    map.set(sym, { closes, dateToIndex });
  }
  return map;
}

function buildReactionDateEarningsMap(
  dataset: MarketDataset,
): Map<string, EarningsEvent[]> {
  const byReactionDate = new Map<string, EarningsEvent[]>();
  const dates = dataset.allTradingDates;

  for (const ev of dataset.earnings) {
    let reactDate: string | null = null;
    if (ev.time === 'amc') {
      const next = dates.find((d) => d > ev.date);
      if (next) reactDate = next;
    } else {
      const curr = dates.find((d) => d >= ev.date);
      if (curr) reactDate = curr;
    }
    if (!reactDate) continue;
    const list = byReactionDate.get(reactDate) ?? [];
    list.push(ev);
    byReactionDate.set(reactDate, list);
  }

  return byReactionDate;
}

function createInitialLedger(startDate: string): PortfolioLedger {
  return {
    createdAt: new Date().toISOString(),
    startDate,
    lastProcessedDate: '',
    initialCapitalEur: INITIAL_CAPITAL,
    cashEur: INITIAL_CAPITAL,
    accruedInterestEur: 0,
    openPositions: [],
    closedTrades: [],
    dailyCurve: [],
    latestSignals: [],
  };
}

const DUPLICATE_SHARE_CLASSES = new Set(['GOOGL', 'HEI.A', 'BRK.A', 'FOXA', 'NWSA', 'LEN.B', 'BF.A', 'UHAL.B']);

function stepTradingDay(
  ledger: PortfolioLedger,
  date: string,
  dataset: MarketDataset,
  symIndex: Map<string, IndexedSymbolData>,
  earningsByReactDate: Map<string, EarningsEvent[]>,
  spyStartClose: number,
  peakEquityRef: { peak: number },
): void {
  const spyData = symIndex.get('SPY');
  const spyIdx = spyData?.dateToIndex.get(date);
  if (!spyData || spyIdx === undefined) return;

  const spyClose = spyData.closes[spyIdx];
  const spyPrevClose = spyIdx > 0 ? spyData.closes[spyIdx - 1] : spyClose;
  const spyDayReturnPct = ((spyClose - spyPrevClose) / spyPrevClose) * 100;
  const spySma20 = computeSMA(spyData.closes, spyIdx, 20);
  const spySma50 = computeSMA(spyData.closes, spyIdx, 50);
  const spySma200 = computeSMA(spyData.closes, spyIdx, 200);

  let regime: 'BULL' | 'CAUTIOUS' | 'DEFENSIVE' = 'BULL';
  if (spySma200 !== null && spyClose < spySma200) {
    regime = 'DEFENSIVE';
  } else if (spySma50 !== null && spyClose < spySma50) {
    regime = 'CAUTIOUS';
  }

  const upcomingEarningsNext2Days = new Set<string>();
  const nearEarningsWindow = new Set<string>();
  const minEarnWindow = shiftDaysISO(date, -5);
  const maxEarnWindow = shiftDaysISO(date, 10);
  const next2DaysWindow = shiftDaysISO(date, 2);

  for (const ev of dataset.earnings) {
    if (ev.date >= minEarnWindow && ev.date <= maxEarnWindow) {
      nearEarningsWindow.add(ev.ticker);
    }
    if (ev.date >= date && ev.date <= next2DaysWindow) {
      upcomingEarningsNext2Days.add(ev.ticker);
    }
  }

  // 1. Two-Tier Core-Satellite Cash Overlay:
  //    - BULL (SPY > SMA50 & SMA200): 100% of unallocated capital works in SPY.
  //    - CAUTIOUS mild pullback (SPY < SMA50, but SPY >= SMA100 * 0.985 and SPY > SMA200):
  //      65% stays in SPY (avoiding 2024 V-bottom whipsaws) + 35% in 3.5% p.a. cash.
  //    - DEFENSIVE / Deep Correction (SPY < SMA200 or SPY < SMA100 * 0.985):
  //      100% shifts into protected 3.5% p.a. money-market cash (full crash protection).
  const spySma100 = computeSMA(spyData.closes, spyIdx, 100);
  const prevRegime =
    ledger.dailyCurve.length > 0
      ? ledger.dailyCurve[ledger.dailyCurve.length - 1].regime
      : regime;
  const isDeepCorrection =
    prevRegime === 'DEFENSIVE' ||
    (spySma100 !== null && spyClose < spySma100 * 0.985);
  const spyCoreWeight =
    prevRegime === 'BULL' ? 1.0 : isDeepCorrection ? 0.0 : 0.65;
  const mmDailyRate = CASH_YIELD_ANNUAL / 252;
  const idleReturnEur =
    ledger.cashEur *
    (spyCoreWeight * (spyDayReturnPct / 100) + (1 - spyCoreWeight) * mmDailyRate);
  ledger.cashEur += idleReturnEur;
  ledger.accruedInterestEur += idleReturnEur;

  // 2. Update & evaluate exits on existing open positions
  const remainingPositions: Position[] = [];
  for (const pos of ledger.openPositions) {
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

    if (pos.engine === 'RSI2_MEAN_REV') {
      const sma5 = computeSMA(sData.closes, idx, 5);
      const sma50 = computeSMA(sData.closes, idx, 50);
      const rsi2Now = computeRSI2(sData.closes, idx);
      const returnPct = (close - pos.entryPrice) / pos.entryPrice;

      // Intelligent Patient Exit for RSI(2):
      // If the stock is still healthy above SMA50, wait until the bounce reaches profit (>= +0.2%),
      // up to 12 trading days. If it broke below SMA50, exit as soon as it touches SMA5 or day 7.
      const healthyAboveSma50 = sma50 !== null && close >= sma50;
      if (upcomingEarningsNext2Days.has(pos.symbol)) {
        exitReason = `Pre-Earnings Exit (ochrana pred výsledkami)`;
      } else if (close <= pos.stopLossPrice) {
        exitReason = `Stop Loss (-5.5%)`;
      } else if (sma5 !== null && close >= sma5 && returnPct >= 0.002) {
        exitReason = `Take Profit (Close $${close.toFixed(2)} >= SMA5 $${sma5.toFixed(2)})`;
      } else if (rsi2Now !== null && rsi2Now >= 65 && returnPct >= 0.0025) {
        exitReason = `Take Profit (RSI2 snapback ${rsi2Now.toFixed(0)})`;
      } else if (pos.daysHeld >= 6 && returnPct >= 0.0015) {
        exitReason = `Patient Profit Exit (${pos.daysHeld}d v zisku)`;
      } else if (!healthyAboveSma50 && pos.daysHeld >= 5 && sma5 !== null && close >= sma5) {
        exitReason = `Connors SMA5 Exit (${pos.daysHeld}d)`;
      } else if (pos.daysHeld >= (healthyAboveSma50 ? 12 : 7)) {
        exitReason = `Time Stop (${pos.daysHeld} obchodných dní)`;
      }
    } else if (pos.engine === 'PEAD_DRIFT') {
      const sma20 = computeSMA(sData.closes, idx, 20);
      const sma50 = computeSMA(sData.closes, idx, 50);
      const returnPct = (close - pos.entryPrice) / pos.entryPrice;
      const drawdownFromPeak = (close - pos.peakClose) / pos.peakClose;

      if (pos.peakClose >= pos.entryPrice * 1.035) {
        const lockStop = Math.max(pos.stopLossPrice, pos.entryPrice * 1.006, pos.peakClose * 0.942);
        pos.stopLossPrice = Number(lockStop.toFixed(2));
      }

      if (close <= pos.stopLossPrice) {
        exitReason =
          pos.stopLossPrice > pos.entryPrice
            ? `Trailing Profit Stop ($${pos.stopLossPrice.toFixed(2)})`
            : `Stop Loss (-4.5%)`;
      } else if (drawdownFromPeak <= -0.058 && pos.daysHeld >= 2) {
        exitReason = `Trailing Stop (-5.8% z vrcholu $${pos.peakClose.toFixed(2)})`;
      } else if (
        pos.daysHeld >= 5 &&
        sma20 !== null &&
        close < sma20 &&
        (returnPct >= 0.003 || returnPct <= -0.018 || (sma50 !== null && close < sma50))
      ) {
        exitReason = `Trend Exit (Close pod SMA20 $${sma20.toFixed(2)})`;
      } else if (returnPct >= 0.18) {
        exitReason = `Take Profit (+18% cieľ dosiahnutý)`;
      } else if (pos.daysHeld >= 20 && (returnPct >= 0.002 || returnPct <= -0.015)) {
        exitReason = `Time Exit (20 obchodných dní)`;
      } else if (pos.daysHeld >= 21 && returnPct >= 0.002) {
        exitReason = `Patient Recovery Profit Exit (${pos.daysHeld}d)`;
      } else if (pos.daysHeld >= 26) {
        exitReason = `Max Hold Exit (26 obchodných dní)`;
      }
    } else if (pos.engine === 'SMA200_SNIPER') {
      const sma5 = computeSMA(sData.closes, idx, 5);
      const sma10 = computeSMA(sData.closes, idx, 10);
      const returnPct = (close - pos.entryPrice) / pos.entryPrice;

      if (upcomingEarningsNext2Days.has(pos.symbol) && returnPct >= 0.002) {
        exitReason = `Pre-Earnings Profit Lock`;
      } else if (close <= pos.stopLossPrice) {
        exitReason = `Stop Loss (-5.0% pod SMA200)`;
      } else if (sma10 !== null && close >= sma10 && returnPct >= 0.012) {
        exitReason = `Take Profit (Odraz od SMA200 nad SMA10 $${sma10.toFixed(2)})`;
      } else if (sma5 !== null && close >= sma5 && returnPct >= 0.005) {
        exitReason = `Take Profit (Odraz od SMA200 nad SMA5 $${sma5.toFixed(2)})`;
      } else if (pos.daysHeld >= 14) {
        exitReason = `Time Exit (14 obchodných dní)`;
      }
    }

    if (exitReason) {
      // If a Trailing Profit Stop triggered during normal trading (not a >3% overnight crash gap),
      // execute at the resting stop order price rather than end-of-day close.
      const triggerPrice =
        exitReason.startsWith('Trailing Profit Stop') && close >= pos.stopLossPrice * 0.97
          ? pos.stopLossPrice
          : close;
      const effectiveExitPrice = triggerPrice * (1 - SLIPPAGE_PCT);
      const grossProceeds = pos.shares * effectiveExitPrice;
      const netProceeds = grossProceeds - FEE_PER_ORDER;
      const netPnlEur = netProceeds - pos.investedEur;
      const netPnlPct = (netPnlEur / pos.investedEur) * 100;

      ledger.cashEur += netProceeds;
      ledger.closedTrades.push({
        id: pos.id,
        symbol: pos.symbol,
        name: pos.name,
        sector: pos.sector,
        engine: pos.engine,
        entryDate: pos.entryDate,
        exitDate: date,
        entryPrice: pos.entryPrice,
        exitPrice: Number(effectiveExitPrice.toFixed(2)),
        shares: Number(pos.shares.toFixed(4)),
        investedEur: Number(pos.investedEur.toFixed(2)),
        netPnlEur: Number(netPnlEur.toFixed(2)),
        netPnlPct: Number(netPnlPct.toFixed(2)),
        daysHeld: pos.daysHeld,
        entryReason: pos.entryReason,
        exitReason,
      });
    } else {
      const currentVal = pos.shares * close;
      pos.unrealizedPnlEur = Number((currentVal - pos.investedEur).toFixed(2));
      pos.unrealizedPnlPct = Number(((pos.unrealizedPnlEur / pos.investedEur) * 100).toFixed(2));
      remainingPositions.push(pos);
    }
  }

  ledger.openPositions = remainingPositions;

  // 3. Build cooldown set
  const cooldownCutoff = shiftDaysISO(date, -COOLDOWN_DAYS);
  const cooldownSymbols = new Set<string>();
  for (const ct of ledger.closedTrades) {
    if (ct.exitDate >= cooldownCutoff) {
      cooldownSymbols.add(ct.symbol);
    }
  }

  const heldSymbols = new Set(ledger.openPositions.map((p) => p.symbol));
  const todaysCandidates: CandidateSignal[] = [];

  const isMacroSelloffDay = spyDayReturnPct <= -1.0;
  const spyAboveSma20 = spySma20 !== null && spyClose >= spySma20;

  // --- Engine 2A: Verified Earnings Double-Beat (PEAD) ---
  const prevTradingDate1 = spyIdx >= 1 ? dataset.allTradingDates[spyIdx - 1] : '';
  const prevTradingDate2 = spyIdx >= 2 ? dataset.allTradingDates[spyIdx - 2] : '';
  const candidateEarningsEvents: { ev: EarningsEvent; reactDate: string }[] = [];

  if (regime === 'BULL' && spyAboveSma20 && !isMacroSelloffDay) {
    for (const rDate of [date, prevTradingDate1, prevTradingDate2]) {
      if (!rDate) continue;
      for (const ev of earningsByReactDate.get(rDate) ?? []) {
        candidateEarningsEvents.push({ ev, reactDate: rDate });
      }
    }
  }

  const seenPeadTickers = new Set<string>();
  for (const { ev, reactDate } of candidateEarningsEvents) {
    if (seenPeadTickers.has(ev.ticker) || cooldownSymbols.has(ev.ticker)) continue;
    if (DUPLICATE_SHARE_CLASSES.has(ev.ticker)) continue;
    const meta = dataset.tickers[ev.ticker];
    const sData = symIndex.get(ev.ticker);
    const idx = sData?.dateToIndex.get(date);
    const rIdx = sData?.dateToIndex.get(reactDate);
    if (!meta || !sData || idx === undefined || rIdx === undefined || rIdx < 75) continue;

    const epsBeat =
      ev.epsActual > ev.epsEstimate &&
      (ev.epsSurprisePct >= 5.0 || (ev.epsEstimate < 0 && ev.epsActual > 0));
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
    if (sma50 === null || sma200 === null) continue;
    if (close < sma50 || close < sma200 || sma50 < sma200) continue;

    seenPeadTickers.add(ev.ticker);
    const score =
      ev.epsSurprisePct * 0.4 +
      ev.revSurprisePct * 1.8 +
      reactMovePct * 1.5 +
      meta.overallScore * 0.8;

    todaysCandidates.push({
      symbol: ev.ticker,
      name: meta.name,
      sector: meta.sector,
      engine: 'PEAD_DRIFT',
      closePrice: close,
      stopLossPrice: Number((close * 0.955).toFixed(2)),
      targetNote: 'Breakeven pri +5.0% / SMA20 / +18%',
      reason: `Earnings Double-Beat (EPS +${ev.epsSurprisePct.toFixed(1)}%, Rev +${ev.revSurprisePct.toFixed(1)}%) + Breakout (+${reactMovePct.toFixed(1)}%)`,
      score,
      action: heldSymbols.has(ev.ticker) ? 'ALREADY_HELD' : 'WATCHLIST_SLOT_FULL',
    });
  }

  // --- Engine 2B: VCP / 50-Day Catalyst Breakout on Elite Compounders (Score >= 75) ---
  if (regime === 'BULL' && spyAboveSma20 && !isMacroSelloffDay) {
    for (const [symbol, sData] of symIndex.entries()) {
      if (symbol === 'SPY' || seenPeadTickers.has(symbol)) continue;
      if (DUPLICATE_SHARE_CLASSES.has(symbol) || cooldownSymbols.has(symbol)) continue;
      if (upcomingEarningsNext2Days.has(symbol)) continue;
      const meta = dataset.tickers[symbol];
      if (!meta || meta.marketCapB < 25 || meta.fundLevel !== 'strong' || meta.overallScore < 75) {
        continue;
      }

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

      const score = dayGainPct * 6 + (9 - boxRangePct) * 5 + meta.overallScore * 0.6;
      todaysCandidates.push({
        symbol,
        name: meta.name,
        sector: meta.sector,
        engine: 'PEAD_DRIFT',
        closePrice: close,
        stopLossPrice: Number((close * 0.955).toFixed(2)),
        targetNote: 'Breakeven pri +5.0% / SMA20 / +18%',
        reason: `50d Catalyst Breakout (+${dayGainPct.toFixed(1)}% z úzkej ${boxRangePct.toFixed(1)}% bázy, Score ${meta.overallScore})`,
        score,
        action: heldSymbols.has(symbol) ? 'ALREADY_HELD' : 'WATCHLIST_SLOT_FULL',
      });
    }
  }

  // --- Engine 3 (Rare Sniper): Relative-Strength Pullback on Elite Leaders (Score >= 78) ---
  // Fires only when the broader market is oversold (SPY RSI2 <= 12 in an uptrend),
  // buying elite compounders (Score >= 78) that refused to break their SMA50 support.
  const spyRsi2 = computeRSI2(spyData.closes, spyIdx);
  if (regime !== 'DEFENSIVE' && !isMacroSelloffDay && spyRsi2 !== null && spyRsi2 <= 12) {
    for (const [symbol, sData] of symIndex.entries()) {
      if (symbol === 'SPY' || DUPLICATE_SHARE_CLASSES.has(symbol)) continue;
      if (nearEarningsWindow.has(symbol) || cooldownSymbols.has(symbol)) continue;
      const meta = dataset.tickers[symbol];
      if (!meta || meta.marketCapB < 40 || meta.fundLevel !== 'strong' || meta.overallScore < 78) {
        continue;
      }

      const idx = sData.dateToIndex.get(date);
      if (idx === undefined || idx < 100) continue;

      const close = sData.closes[idx];
      const sma50 = computeSMA(sData.closes, idx, 50);
      const sma200 = computeSMA(sData.closes, idx, 200);
      const sma5 = computeSMA(sData.closes, idx, 5);
      if (sma50 === null || sma200 === null || sma5 === null) continue;
      if (close < sma50 * 1.005 || sma50 <= sma200) continue;

      const rsi2 = computeRSI2(sData.closes, idx);
      if (rsi2 === null || rsi2 > 6.0) continue;

      const distFromSma5Pct = ((close - sma5) / sma5) * 100;
      if (distFromSma5Pct > -1.8) continue;

      const score = 100 + (10 - rsi2) * 8 + meta.overallScore * 0.6;
      todaysCandidates.push({
        symbol,
        name: meta.name,
        sector: meta.sector,
        engine: 'SMA200_SNIPER',
        closePrice: close,
        stopLossPrice: Number((close * 0.95).toFixed(2)),
        targetNote: 'Odraz pri otočke trhu nad SMA5/SMA10',
        reason: `Market Pullback Sniper (SPY RSI2=${spyRsi2.toFixed(0)}, akcia drží SMA50, RSI2=${rsi2.toFixed(1)}, Score ${meta.overallScore})`,
        score,
        action: heldSymbols.has(symbol) ? 'ALREADY_HELD' : 'WATCHLIST_SLOT_FULL',
      });
    }
  }

  // --- Engine 1 Scan: Low-Volatility Blue-Chip RSI(2) Mean Reversion ---
  const maxRsiThreshold = regime === 'BULL' ? 3.5 : 1.5;
  const minDipFromSma5 = regime === 'BULL' ? -2.6 : -4.0;

  for (const [symbol, sData] of symIndex.entries()) {
    if (symbol === 'SPY' || isMacroSelloffDay || regime === 'DEFENSIVE') continue;
    if (DUPLICATE_SHARE_CLASSES.has(symbol)) continue;
    if (nearEarningsWindow.has(symbol) || cooldownSymbols.has(symbol)) continue;
    const meta = dataset.tickers[symbol];
    if (!meta || meta.marketCapB < 35) continue;
    if (meta.fundLevel !== 'strong' || meta.overallScore < 66) continue;

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

    // Must hold medium-term SMA50 support (not a broken falling knife -4% below SMA50)
    if (close <= sma200 * 1.03 || sma50 <= sma200 || close < sma50 * 0.99) continue;

    const distFromSma5Pct = ((close - sma5) / sma5) * 100;
    if (distFromSma5Pct > minDipFromSma5) continue;

    const rsi2 = computeRSI2(sData.closes, idx);
    if (rsi2 === null || rsi2 > maxRsiThreshold) continue;

    const score =
      (10 - rsi2) * 12 +
      Math.abs(distFromSma5Pct) * 2.5 +
      (2.0 - vol20) * 15 +
      meta.overallScore * 0.5;

    todaysCandidates.push({
      symbol,
      name: meta.name,
      sector: meta.sector,
      engine: 'RSI2_MEAN_REV',
      closePrice: close,
      stopLossPrice: Number((close * 0.945).toFixed(2)),
      targetNote: `Close >= SMA5 ($${sma5.toFixed(2)}) v zisku`,
      reason: `RSI(2) = ${rsi2.toFixed(1)}, ${distFromSma5Pct.toFixed(1)}% pod SMA5, nízka volatilita σ=${vol20.toFixed(1)}%`,
      score,
      action: heldSymbols.has(symbol) ? 'ALREADY_HELD' : 'WATCHLIST_SLOT_FULL',
    });
  }

  // Sort candidates by conviction score
  todaysCandidates.sort((a, b) => b.score - a.score);

  // 4. Execute entries within portfolio, engine, and sector limits
  const currentEquity =
    ledger.cashEur +
    ledger.openPositions.reduce((acc, p) => acc + p.shares * p.currentPrice, 0);

  const basePositionSize =
    regime === 'DEFENSIVE'
      ? (currentEquity / MAX_POSITIONS) * 0.5
      : regime === 'CAUTIOUS'
        ? (currentEquity / MAX_POSITIONS) * 0.75
        : currentEquity / MAX_POSITIONS;

  for (const cand of todaysCandidates) {
    if (cand.action === 'ALREADY_HELD') continue;
    if (ledger.openPositions.length >= MAX_POSITIONS) break;

    const engineCount = ledger.openPositions.filter((p) => p.engine === cand.engine).length;
    const maxForThisEngine = cand.engine === 'RSI2_MEAN_REV' ? 2 : MAX_PER_ENGINE;
    if (engineCount >= maxForThisEngine) continue;

    const sectorCount = ledger.openPositions.filter((p) => p.sector === cand.sector).length;
    if (sectorCount >= MAX_PER_SECTOR) {
      cand.action = 'SECTOR_CAP';
      continue;
    }

    const allocEur = Math.min(basePositionSize, ledger.cashEur - FEE_PER_ORDER);
    if (allocEur < 500) continue;

    const effectiveEntryPrice = cand.closePrice * (1 + SLIPPAGE_PCT);
    const shares = (allocEur - FEE_PER_ORDER) / effectiveEntryPrice;
    const totalCostEur = shares * effectiveEntryPrice + FEE_PER_ORDER;

    ledger.cashEur -= totalCostEur;
    heldSymbols.add(cand.symbol);
    cand.action = 'OPENED';

    ledger.openPositions.push({
      id: `${date}-${cand.symbol}`,
      symbol: cand.symbol,
      name: cand.name,
      sector: cand.sector,
      engine: cand.engine,
      entryDate: date,
      entryPrice: Number(effectiveEntryPrice.toFixed(2)),
      shares: Number(shares.toFixed(4)),
      investedEur: Number(totalCostEur.toFixed(2)),
      stopLossPrice: cand.stopLossPrice,
      peakClose: cand.closePrice,
      daysHeld: 0,
      entryReason: cand.reason,
      currentPrice: cand.closePrice,
      unrealizedPnlEur: Number((-FEE_PER_ORDER).toFixed(2)),
      unrealizedPnlPct: Number(((-FEE_PER_ORDER / totalCostEur) * 100).toFixed(2)),
    });
  }

  // 5. Record end-of-day snapshot
  const investedMarketValue = ledger.openPositions.reduce(
    (sum, p) => sum + p.shares * p.currentPrice,
    0,
  );
  const totalEquity = ledger.cashEur + investedMarketValue;
  if (totalEquity > peakEquityRef.peak) {
    peakEquityRef.peak = totalEquity;
  }
  const drawdownPct =
    peakEquityRef.peak > 0 ? ((totalEquity - peakEquityRef.peak) / peakEquityRef.peak) * 100 : 0;

  const spyNormalizedEur = INITIAL_CAPITAL * (spyClose / spyStartClose);

  ledger.dailyCurve.push({
    date,
    equityEur: Number(totalEquity.toFixed(2)),
    cashEur: Number(ledger.cashEur.toFixed(2)),
    investedEur: Number(investedMarketValue.toFixed(2)),
    openPositionsCount: ledger.openPositions.length,
    spyNormalizedEur: Number(spyNormalizedEur.toFixed(2)),
    regime,
    drawdownPct: Number(drawdownPct.toFixed(2)),
  });

  ledger.lastProcessedDate = date;
  ledger.latestSignals = todaysCandidates.slice(0, 12);
}

function shiftDaysISO(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// ─── Statistics & Reporting ───────────────────────────────────────────────────

interface EngineStats {
  trades: number;
  wins: number;
  winRatePct: number;
  netPnlEur: number;
  avgReturnPct: number;
  avgHoldDays: number;
}

function computeEngineStats(trades: ClosedTrade[], engine?: EngineType): EngineStats {
  const filtered = engine ? trades.filter((t) => t.engine === engine) : trades;
  if (filtered.length === 0) {
    return { trades: 0, wins: 0, winRatePct: 0, netPnlEur: 0, avgReturnPct: 0, avgHoldDays: 0 };
  }
  const wins = filtered.filter((t) => t.netPnlEur > 0).length;
  const netPnlEur = filtered.reduce((s, t) => s + t.netPnlEur, 0);
  const avgReturnPct = filtered.reduce((s, t) => s + t.netPnlPct, 0) / filtered.length;
  const avgHoldDays = filtered.reduce((s, t) => s + t.daysHeld, 0) / filtered.length;
  return {
    trades: filtered.length,
    wins,
    winRatePct: (wins / filtered.length) * 100,
    netPnlEur,
    avgReturnPct,
    avgHoldDays,
  };
}

function engineBadgeLabel(engine: EngineType): string {
  if (engine === 'RSI2_MEAN_REV') return 'RSI(2)';
  if (engine === 'SMA200_SNIPER') return 'SNIPER';
  return 'PEAD';
}

function engineBadgeClass(engine: EngineType): string {
  if (engine === 'RSI2_MEAN_REV') return 'b-rsi';
  if (engine === 'SMA200_SNIPER') return 'b-sniper';
  return 'b-pead';
}

function printConsoleReport(ledger: PortfolioLedger): void {
  const latest = ledger.dailyCurve[ledger.dailyCurve.length - 1];
  if (!latest) {
    console.log('Žiadne obchodné dni v simulácii.');
    return;
  }

  const totalReturnEur = latest.equityEur - ledger.initialCapitalEur;
  const totalReturnPct = (totalReturnEur / ledger.initialCapitalEur) * 100;
  const spyReturnEur = latest.spyNormalizedEur - ledger.initialCapitalEur;
  const spyReturnPct = (spyReturnEur / ledger.initialCapitalEur) * 100;
  const maxDdPct = Math.min(0, ...ledger.dailyCurve.map((d) => d.drawdownPct));

  const allStats = computeEngineStats(ledger.closedTrades);
  const rsiStats = computeEngineStats(ledger.closedTrades, 'RSI2_MEAN_REV');
  const peadStats = computeEngineStats(ledger.closedTrades, 'PEAD_DRIFT');
  const sniperStats = computeEngineStats(ledger.closedTrades, 'SMA200_SNIPER');
  const openPnlEur = totalReturnEur - ledger.accruedInterestEur - allStats.netPnlEur;

  const sign = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log(
    `🤖 PMP QUANT BOT — SIMULÁCIA & PAPER TRADING (${ledger.startDate} → ${ledger.lastProcessedDate})`,
  );
  console.log('══════════════════════════════════════════════════════════════════════════════');
  console.log(
    `💰 Hodnota účtu:       ${latest.equityEur.toFixed(2)} €  (${sign(totalReturnEur)} € / ${sign(totalReturnPct)} %)`,
  );
  console.log(
    `📈 Benchmark S&P 500:  ${latest.spyNormalizedEur.toFixed(2)} €  (${sign(spyReturnEur)} € / ${sign(spyReturnPct)} %)`,
  );
  console.log(
    `🛡️  Max Drawdown:       ${maxDdPct.toFixed(2)} %   | Režim trhu (SPY>SMA200): ${latest.regime}`,
  );
  console.log(
    `💵 Voľná hotovosť:     ${latest.cashEur.toFixed(2)} €   | V akciách: ${latest.investedEur.toFixed(2)} € (${latest.openPositionsCount}/${MAX_POSITIONS} pozícií, Open P&L: ${sign(openPnlEur)} €)`,
  );
  console.log(
    `🏦 Core SPY + Úrok:    ${sign(ledger.accruedInterestEur)} € (SPY v Bull režime + 3.5% p.a. v Cash režime)`,
  );
  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log('📊 ŠTATISTIKA UZAVRETÝCH OBCHODOV:');
  console.log(
    `   • Spolu:            ${allStats.trades} obchodov | Win-rate: ${allStats.winRatePct.toFixed(1)} % | Čistý zisk: ${sign(allStats.netPnlEur)} € | Priem. obchod: ${sign(allStats.avgReturnPct)} % (${allStats.avgHoldDays.toFixed(1)} d)`,
  );
  console.log(
    `   • Motor 1 (RSI2):   ${rsiStats.trades} obchodov | Win-rate: ${rsiStats.winRatePct.toFixed(1)} % | Čistý zisk: ${sign(rsiStats.netPnlEur)} € | Priem. obchod: ${sign(rsiStats.avgReturnPct)} % (${rsiStats.avgHoldDays.toFixed(1)} d)`,
  );
  console.log(
    `   • Motor 2 (PEAD):   ${peadStats.trades} obchodov | Win-rate: ${peadStats.winRatePct.toFixed(1)} % | Čistý zisk: ${sign(peadStats.netPnlEur)} € | Priem. obchod: ${sign(peadStats.avgReturnPct)} % (${peadStats.avgHoldDays.toFixed(1)} d)`,
  );
  console.log(
    `   • Motor 3 (SNIPER): ${sniperStats.trades} obchodov | Win-rate: ${sniperStats.winRatePct.toFixed(1)} % | Čistý zisk: ${sign(sniperStats.netPnlEur)} € | Priem. obchod: ${sign(sniperStats.avgReturnPct)} % (${sniperStats.avgHoldDays.toFixed(1)} d)`,
  );

  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log(`📂 AKTUÁLNE OTVORENÉ POZÍCIE (${ledger.openPositions.length}):`);
  if (ledger.openPositions.length === 0) {
    console.log('   (Žiadne otvorené pozície — 100 % v úročenej hotovosti)');
  } else {
    for (const p of ledger.openPositions) {
      const tag = engineBadgeLabel(p.engine);
      console.log(
        `   [${tag}] ${p.symbol.padEnd(5)} | Vstup ${p.entryDate} @ $${p.entryPrice.toFixed(2)} → Teraz $${p.currentPrice.toFixed(2)} | ${sign(p.unrealizedPnlEur)} € (${sign(p.unrealizedPnlPct)} %) | SL $${p.stopLossPrice.toFixed(2)} | ${p.daysHeld}d`,
      );
    }
  }

  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log(`🎯 POSLEDNÉ UZAVRETÉ OBCHODY (posledných 10 z ${ledger.closedTrades.length}):`);
  const recentClosed = ledger.closedTrades.slice(-10).reverse();
  for (const t of recentClosed) {
    const tag = engineBadgeLabel(t.engine);
    const icon = t.netPnlEur >= 0 ? '✅' : '❌';
    console.log(
      `   ${icon} [${tag}] ${t.symbol.padEnd(5)} | ${t.entryDate} → ${t.exitDate} (${t.daysHeld}d) | $${t.entryPrice.toFixed(2)} → $${t.exitPrice.toFixed(2)} | ${sign(t.netPnlEur)} € (${sign(t.netPnlPct)} %) | ${t.exitReason}`,
    );
  }

  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log(`📡 SIGNÁLY Z POSLEDNÉHO OBCHODNÉHO DŇA (${ledger.lastProcessedDate}):`);
  if (ledger.latestSignals.length === 0) {
    console.log('   Žiadna akcia dnes nesplnila prísne vstupné kritériá.');
  } else {
    for (const s of ledger.latestSignals) {
      const tag = engineBadgeLabel(s.engine);
      console.log(
        `   ⚡ [${tag}] ${s.symbol.padEnd(5)} @ $${s.closePrice.toFixed(2)} (SL $${s.stopLossPrice.toFixed(2)}) [${s.action}] — ${s.reason}`,
      );
    }
  }
  console.log('══════════════════════════════════════════════════════════════════════════════\n');
}

function generateHtmlReport(ledger: PortfolioLedger): void {
  const latest = ledger.dailyCurve[ledger.dailyCurve.length - 1];
  if (!latest) return;

  const totalReturnEur = latest.equityEur - ledger.initialCapitalEur;
  const totalReturnPct = (totalReturnEur / ledger.initialCapitalEur) * 100;
  const spyReturnPct =
    ((latest.spyNormalizedEur - ledger.initialCapitalEur) / ledger.initialCapitalEur) * 100;
  const maxDdPct = Math.min(0, ...ledger.dailyCurve.map((d) => d.drawdownPct));
  const allStats = computeEngineStats(ledger.closedTrades);
  const rsiStats = computeEngineStats(ledger.closedTrades, 'RSI2_MEAN_REV');
  const peadStats = computeEngineStats(ledger.closedTrades, 'PEAD_DRIFT');
  const sniperStats = computeEngineStats(ledger.closedTrades, 'SMA200_SNIPER');
  const coreReturnEur = ledger.accruedInterestEur;
  const openPnlEur = totalReturnEur - coreReturnEur - allStats.netPnlEur;

  const html = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="utf-8" />
  <title>PMP Quant Bot — 10,000 € Paper Trading</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #0b0f19;
      --panel: #131a2a;
      --border: #1f2942;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --green: #10b981;
      --red: #ef4444;
      --blue: #3b82f6;
      --purple: #8b5cf6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 32px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .card .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .card .val { font-size: 21px; font-weight: 700; margin-top: 6px; }
    .card .hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .pos { color: var(--green); }
    .neg { color: var(--red); }
    .chart-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
      margin-bottom: 22px;
      height: 340px;
    }
    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-bottom: 22px;
    }
    @media (max-width: 1000px) { .grid2 { grid-template-columns: 1fr; } }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 9px 10px;
      border-bottom: 1px solid var(--border);
    }
    th { color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .b-rsi { background: rgba(59,130,246,0.18); color: #60a5fa; }
    .b-pead { background: rgba(139,92,246,0.18); color: #c084fc; }
    .b-sniper { background: rgba(245,158,11,0.18); color: #fbbf24; }
  </style>
</head>
<body>
  <h1>🤖 PMP Quant Trading Bot — Simulácia & Paper-Trading (10 000 €)</h1>
  <div class="sub">Obdobie: <b>${ledger.startDate}</b> → <b>${ledger.lastProcessedDate}</b> (${ledger.dailyCurve.length} obchodných dní) • Rozpis zisku: <b>Core (${coreReturnEur >= 0 ? '+' : ''}${coreReturnEur.toFixed(2)} €) + M1 (${rsiStats.netPnlEur >= 0 ? '+' : ''}${rsiStats.netPnlEur.toFixed(2)} €) + M2 (${peadStats.netPnlEur >= 0 ? '+' : ''}${peadStats.netPnlEur.toFixed(2)} €) + M3 (${sniperStats.netPnlEur >= 0 ? '+' : ''}${sniperStats.netPnlEur.toFixed(2)} €) + Otvorené (${openPnlEur >= 0 ? '+' : ''}${openPnlEur.toFixed(2)} €) = ${totalReturnEur >= 0 ? '+' : ''}${totalReturnEur.toFixed(2)} €</b></div>

  <div class="kpis">
    <div class="card">
      <div class="label">Hodnota portfólia</div>
      <div class="val ${totalReturnEur >= 0 ? 'pos' : 'neg'}">${latest.equityEur.toFixed(2)} €</div>
      <div class="hint">${totalReturnEur >= 0 ? '+' : ''}${totalReturnEur.toFixed(2)} € (${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)} %)</div>
    </div>
    <div class="card">
      <div class="label">Benchmark S&P 500 (SPY)</div>
      <div class="val">${latest.spyNormalizedEur.toFixed(2)} €</div>
      <div class="hint">${spyReturnPct >= 0 ? '+' : ''}${spyReturnPct.toFixed(2)} % za rovnaké obdobie</div>
    </div>
    <div class="card">
      <div class="label">Max Drawdown & Win-Rate</div>
      <div class="val neg">${maxDdPct.toFixed(2)} % <span style="color:var(--text);font-size:16px;">| ${allStats.winRatePct.toFixed(1)} %</span></div>
      <div class="hint">${allStats.wins}/${allStats.trades} ziskových • Režim: ${latest.regime}</div>
    </div>
    <div class="card">
      <div class="label">Core: SPY + Cash Úrok</div>
      <div class="val ${coreReturnEur >= 0 ? 'pos' : 'neg'}">${coreReturnEur >= 0 ? '+' : ''}${coreReturnEur.toFixed(2)} €</div>
      <div class="hint">Voľný kapitál (SPY v Bull / 3.5% v Cash)</div>
    </div>
    <div class="card">
      <div class="label">Motor 1: RSI(2) Dip</div>
      <div class="val ${rsiStats.netPnlEur >= 0 ? 'pos' : 'neg'}">${rsiStats.netPnlEur >= 0 ? '+' : ''}${rsiStats.netPnlEur.toFixed(2)} €</div>
      <div class="hint">${rsiStats.trades} obch. • Win ${rsiStats.winRatePct.toFixed(0)} % • Ø ${rsiStats.avgHoldDays.toFixed(1)} d</div>
    </div>
    <div class="card">
      <div class="label">Motor 2: Earnings Drift</div>
      <div class="val ${peadStats.netPnlEur >= 0 ? 'pos' : 'neg'}">${peadStats.netPnlEur >= 0 ? '+' : ''}${peadStats.netPnlEur.toFixed(2)} €</div>
      <div class="hint">${peadStats.trades} obch. • Win ${peadStats.winRatePct.toFixed(0)} % • Ø ${peadStats.avgHoldDays.toFixed(1)} d</div>
    </div>
    <div class="card">
      <div class="label">Motor 3: Pullback Sniper</div>
      <div class="val ${sniperStats.netPnlEur >= 0 ? 'pos' : 'neg'}">${sniperStats.netPnlEur >= 0 ? '+' : ''}${sniperStats.netPnlEur.toFixed(2)} €</div>
      <div class="hint">${sniperStats.trades} obch. • Win ${sniperStats.winRatePct.toFixed(0)} % • Ø ${sniperStats.avgHoldDays.toFixed(1)} d (${openPnlEur >= 0 ? 'Open +' : 'Open '}${openPnlEur.toFixed(0)} €)</div>
    </div>
  </div>

  <div class="chart-box">
    <canvas id="eqChart"></canvas>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="label" style="margin-bottom:10px;">📂 Aktuálne otvorené pozície (${ledger.openPositions.length} / ${MAX_POSITIONS}) — Otvorený P&L: ${openPnlEur >= 0 ? '+' : ''}${openPnlEur.toFixed(2)} €</div>
      <table>
        <thead>
          <tr><th>Ticker</th><th>Motor</th><th>Vstup</th><th>Cena → Teraz</th><th>P&L (€)</th><th>Stop Loss</th></tr>
        </thead>
        <tbody>
          ${
            ledger.openPositions.length === 0
              ? '<tr><td colspan="6" style="color:var(--muted)">Žiadne otvorené pozície</td></tr>'
              : ledger.openPositions
                  .map(
                    (p) => `<tr>
              <td><b>${p.symbol}</b></td>
              <td><span class="badge ${engineBadgeClass(p.engine)}">${engineBadgeLabel(p.engine)}</span></td>
              <td>${p.entryDate} (${p.daysHeld}d)</td>
              <td>$${p.entryPrice.toFixed(2)} → $${p.currentPrice.toFixed(2)}</td>
              <td class="${p.unrealizedPnlEur >= 0 ? 'pos' : 'neg'}"><b>${p.unrealizedPnlEur >= 0 ? '+' : ''}${p.unrealizedPnlEur.toFixed(2)} €</b> (${p.unrealizedPnlPct >= 0 ? '+' : ''}${p.unrealizedPnlPct.toFixed(1)}%)</td>
              <td>$${p.stopLossPrice.toFixed(2)}</td>
            </tr>`,
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="label" style="margin-bottom:10px;">📡 Dnešné signály skenera (${ledger.lastProcessedDate})</div>
      <table>
        <thead>
          <tr><th>Ticker</th><th>Motor</th><th>Close</th><th>SL</th><th>Stav</th><th>Dôvod</th></tr>
        </thead>
        <tbody>
          ${
            ledger.latestSignals.length === 0
              ? '<tr><td colspan="6" style="color:var(--muted)">Dnes žiadny kandidát</td></tr>'
              : ledger.latestSignals
                  .map(
                    (s) => `<tr>
              <td><b>${s.symbol}</b></td>
              <td><span class="badge ${engineBadgeClass(s.engine)}">${engineBadgeLabel(s.engine)}</span></td>
              <td>$${s.closePrice.toFixed(2)}</td>
              <td>$${s.stopLossPrice.toFixed(2)}</td>
              <td>${s.action}</td>
              <td style="color:var(--muted);font-size:12px;">${s.reason}</td>
            </tr>`,
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="label" style="margin-bottom:10px;">📜 História uzavretých obchodov (${ledger.closedTrades.length})</div>
    <table>
      <thead>
        <tr><th>Ticker</th><th>Motor</th><th>Vstup → Výstup</th><th>Dní</th><th>Nákup → Predaj</th><th>Čistý P&L</th><th>Dôvod vstupu</th><th>Dôvod výstupu</th></tr>
      </thead>
      <tbody>
        ${ledger.closedTrades
          .slice()
          .reverse()
          .map(
            (t) => `<tr>
          <td><b>${t.symbol}</b> <span style="color:var(--muted);font-size:11px;">${t.name.slice(0, 18)}</span></td>
          <td><span class="badge ${engineBadgeClass(t.engine)}">${engineBadgeLabel(t.engine)}</span></td>
          <td>${t.entryDate} → ${t.exitDate}</td>
          <td>${t.daysHeld}</td>
          <td>$${t.entryPrice.toFixed(2)} → $${t.exitPrice.toFixed(2)}</td>
          <td class="${t.netPnlEur >= 0 ? 'pos' : 'neg'}"><b>${t.netPnlEur >= 0 ? '+' : ''}${t.netPnlEur.toFixed(2)} €</b> (${t.netPnlPct >= 0 ? '+' : ''}${t.netPnlPct.toFixed(1)}%)</td>
          <td style="color:var(--muted);font-size:12px;">${t.entryReason}</td>
          <td style="font-size:12px;">${t.exitReason}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <script>
    const labels = ${JSON.stringify(ledger.dailyCurve.map((d) => d.date))};
    const botEq = ${JSON.stringify(ledger.dailyCurve.map((d) => d.equityEur))};
    const spyEq = ${JSON.stringify(ledger.dailyCurve.map((d) => d.spyNormalizedEur))};
    new Chart(document.getElementById('eqChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'PMP Quant Bot (10 000 € štart)',
            data: botEq,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.2,
            pointRadius: 0
          },
          {
            label: 'S&P 500 (SPY Buy & Hold)',
            data: spyEq,
            borderColor: '#64748b',
            borderDash: [5, 5],
            borderWidth: 1.8,
            fill: false,
            tension: 0.2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#e2e8f0' } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#1f2942' } },
          y: { ticks: { color: '#94a3b8', callback: (v) => v + ' €' }, grid: { color: '#1f2942' } }
        }
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(HTML_REPORT_FILE, html, 'utf8');
  console.log(`📊 HTML dashboard uložený do: ${HTML_REPORT_FILE}`);
}

// ─── Main Entrypoint ──────────────────────────────────────────────────────────

function main(): void {
  const forceRefresh = hasFlag('--refresh');
  const reset = hasFlag('--reset');
  const openChart = hasFlag('--chart') && !hasFlag('--no-open');
  const defaultStart = '2026-08-03'; // 3-month historical simulation + live forward paper-trading
  const startArg = getArg('--start', defaultStart);
  const endArg = getArg('--end', '9999-12-31');

  const dataset = fetchMarketDataset(forceRefresh);
  const symIndex = buildSymbolIndex(dataset);
  const earningsByReactDate = buildReactionDateEarningsMap(dataset);

  let ledger: PortfolioLedger;
  if (!reset && fs.existsSync(LEDGER_FILE)) {
    ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) as PortfolioLedger;
  } else {
    ledger = createInitialLedger(startArg);
  }

  const spyData = symIndex.get('SPY');
  if (!spyData) {
    throw new Error('Chýbajú historické dáta pre SPY.');
  }

  const startDate = ledger.startDate;
  const firstTradingDate =
    dataset.allTradingDates.find((d) => d >= startDate) ?? dataset.allTradingDates[0];
  const spyStartIdx = spyData.dateToIndex.get(firstTradingDate) ?? 0;
  const spyStartClose = spyData.closes[spyStartIdx];

  const peakEquityRef = {
    peak: Math.max(
      INITIAL_CAPITAL,
      ...ledger.dailyCurve.map((d) => d.equityEur),
    ),
  };

  // Process all trading days strictly after lastProcessedDate up to endArg
  const pendingDates = dataset.allTradingDates.filter(
    (d) => d >= firstTradingDate && d > ledger.lastProcessedDate && d <= endArg,
  );

  if (pendingDates.length > 0) {
    console.log(
      `⚙️  Spracovávam ${pendingDates.length} obchodných dní (${pendingDates[0]} → ${pendingDates[pendingDates.length - 1]})...`,
    );
    for (const dt of pendingDates) {
      stepTradingDay(
        ledger,
        dt,
        dataset,
        symIndex,
        earningsByReactDate,
        spyStartClose,
        peakEquityRef,
      );
    }
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf8');
  } else {
    console.log(`✅ Portfólio je aktuálne k poslednému obchodnému dňu (${ledger.lastProcessedDate}).`);
  }

  printConsoleReport(ledger);
  generateHtmlReport(ledger);

  if (openChart) {
    try {
      execSync(`open "${HTML_REPORT_FILE}"`);
    } catch {
      // Ignore if headless
    }
  }
}

main();

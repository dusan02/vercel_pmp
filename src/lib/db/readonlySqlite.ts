import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { FinancialStatement } from '@prisma/client';

export interface ReadonlyValRow {
  date: Date;
  closePrice: number | null;
  peRatio: number | null;
  psRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  marketCap: number | null;
  peForward: number | null;
}

export interface ReadonlyStatementRow {
  endDate: Date;
  fiscalPeriod: string;
  fiscalYear: number;
  netIncome: number | null;
  sharesOutstanding: number | null;
}

export interface ReadonlyCandlesDbData {
  valRows: ReadonlyValRow[];
  bs: { totalDebt: number | null; cashAndEquivalents: number | null } | null;
  stmts: ReadonlyStatementRow[];
  fm: { forwardPe: number | null; fetchedAt: Date } | null;
  sector: string | null;
}

export interface ReadonlyHistoryValRow {
  date: Date;
  peRatio: number | null;
  psRatio: number | null;
  fcfYield: number | null;
  closePrice: number | null;
  marketCap: number | null;
}

export type SqliteReadResult<T> = { ok: true; data: T } | { ok: false };

export interface ReadonlyTickerPageData {
  symbol: string;
  name: string | null;
  assetType: string;
  sector: string | null;
  industry: string | null;
  lastPrice: number | null;
  lastChangePct: number | null;
  lastMarketCap: number | null;
  description: string | null;
  employees: number | null;
  websiteUrl: string | null;
  headquarters: string | null;
  latestPrevClose: number | null;
  moversReason: string | null;
  moversCategory: string | null;
  latestMoversZScore: number | null;
  latestMoversRVOL: number | null;
  aiConfidence: number | null;
  isSbcAlert: boolean;
  analysisCache: {
    overallScore: number | null;
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    growthScore: number | null;
    qualityScore: number | null;
    moatScore: number | null;
    verdictText: string | null;
    piotroskiScore: number | null;
    altmanZ: number | null;
    beneishScore: number | null;
    interestCoverage: number | null;
    negativeNiYears: number | null;
    revenueCagr: number | null;
    netIncomeCagr: number | null;
    fcfMargin: number | null;
    debtRepaymentYears: number | null;
    humanDebtInfo: string | null;
    humanPeInfo: string | null;
    pePercentile: number | null;
    fundLevel: string | null;
    valLevel: string | null;
    verdictKey: string | null;
  } | null;
  finnhubMetrics: {
    peRatio: number | null;
    forwardPe: number | null;
    dividendYield: number | null;
    roe: number | null;
    payoutRatio: number | null;
    revenueGrowth: number | null;
  } | null;
  finnhubPriceTarget: {
    targetHigh: number | null;
    targetLow: number | null;
    targetMean: number | null;
    targetMedian: number | null;
    numberOfAnalysts: number | null;
    currentPrice: number | null;
    fetchedAt: Date;
  } | null;
  finnhubRecommendation: {
    period: string | null;
    strongBuy: number | null;
    buy: number | null;
    hold: number | null;
    sell: number | null;
    strongSell: number | null;
    fetchedAt: Date;
  } | null;
  finnhubInsiderTransactions: Array<{
    name: string | null;
    change: number;
    filingDate: string;
    transactionDate: string;
    transactionCode: string;
  }>;
  ewScoreSnapshots: Array<{
    totalScore: number;
    maxPossible: number;
    fundamentalsScore: number | null;
    momentumScore: number | null;
    qualityScore: number | null;
    earningsScore: number | null;
    earningsBlocked: boolean;
    rank: number | null;
    asOfDate: Date;
    rationaleJson: string | null;
  }>;
  lastClosedRef: {
    previousClose: number;
    regularClose: number | null;
  } | null;
}

export interface ReadonlyMatchedScreensData {
  lastPrice: number | null;
  lastChangePct: number | null;
  lastMarketCap: number | null;
  latestMoversRVOL: number | null;
  analysisCache: {
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    growthScore: number | null;
    qualityScore: number | null;
    overallScore: number | null;
    altmanZ: number | null;
    fcfMargin: number | null;
    pePercentile: number | null;
    peVsMedian3yPct: number | null;
    peVsMedian1yPct: number | null;
    peVsMedian5yPct: number | null;
    peVsMedian10yPct: number | null;
    fundLevel: string | null;
    valLevel: string | null;
    verdictKey: string | null;
    rsi14: number | null;
    sma200Pct: number | null;
  } | null;
  finnhubMetrics: {
    peRatio: number | null;
    forwardPe: number | null;
    psRatio: number | null;
    pbRatio: number | null;
    pegRatio: number | null;
    evEbitda: number | null;
    evSales: number | null;
    priceFreeCashFlow: number | null;
    priceCashFlow: number | null;
    roe: number | null;
    roa: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    bookValueGrowth: number | null;
    dividendYield: number | null;
    payoutRatio: number | null;
    beta: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    debtEquityRatio: number | null;
    interestCoverage: number | null;
    week52Position: number | null;
  } | null;
  insiderAggregate: {
    netBuyValue90d: number | null;
    netBuyPct90d: number | null;
  } | null;
}

export interface ReadonlyHistoryDbData {
  valRows: ReadonlyHistoryValRow[];
  statements: FinancialStatement[];
  tickerInfo: { sharesOutstanding: number | null; sector: string | null } | null;
}

interface RawValRow {
  date: number | string;
  closePrice: number | null;
  peRatio: number | null;
  psRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  marketCap: number | null;
  peForward: number | null;
}

interface RawHistValRow {
  date: number | string;
  peRatio: number | null;
  psRatio: number | null;
  fcfYield: number | null;
  closePrice: number | null;
  marketCap: number | null;
}

interface RawStatementRow {
  endDate: number | string;
  fiscalPeriod: string;
  fiscalYear: number;
  netIncome: number | null;
  sharesOutstanding: number | null;
}

type RawFullStatementRow = Omit<FinancialStatement, 'endDate' | 'createdAt' | 'updatedAt'> & {
  endDate: number | string;
  createdAt: number | string;
  updatedAt: number | string;
};

interface RawFinnhubMetricsRow {
  forwardPe: number | null;
  fetchedAt: number | string;
}

interface RawTickerCoreRow extends Omit<ReadonlyTickerPageData, 'isSbcAlert' | 'analysisCache' | 'finnhubMetrics' | 'finnhubPriceTarget' | 'finnhubRecommendation' | 'finnhubInsiderTransactions' | 'ewScoreSnapshots' | 'lastClosedRef'> {
  isSbcAlert: number | boolean;
}

interface RawPriceTargetRow {
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  numberOfAnalysts: number | null;
  currentPrice: number | null;
  fetchedAt: number | string;
}

interface RawRecommendationRow {
  period: string | null;
  strongBuy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strongSell: number | null;
  fetchedAt: number | string;
}

interface RawEwSnapshotRow {
  totalScore: number;
  maxPossible: number;
  fundamentalsScore: number | null;
  momentumScore: number | null;
  qualityScore: number | null;
  earningsScore: number | null;
  earningsBlocked: number | boolean;
  rank: number | null;
  asOfDate: number | string;
  rationaleJson: string | null;
}

interface Raw52WeekRangeRow {
  minClose: number | null;
  maxClose: number | null;
  minDate: number | string | null;
  maxDate: number | string | null;
  cnt: number;
}

interface RawTodayPremarketRow {
  lastPrice: number;
  changePct: number;
  lastTs: number | string;
}

interface RawRecentMoveRow {
  date: number | string;
  session: string;
  changePct: number;
  zScore: number | null;
  lastPrice: number;
}

interface RawFinancialFlowRow {
  period: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  endDate: number | string;
  revenue: number | null;
  grossProfit: number | null;
  ebit: number | null;
  netIncome: number | null;
  netIncomeCommon: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  sbc: number | null;
  sharesOutstanding: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  retainedEarnings: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  cashAndEquivalents: number | null;
  netPPE: number | null;
}

export interface ReadonlySearchTickerRow {
  symbol: string;
  name: string | null;
  lastPrice: number | null;
  lastChangePct: number | null;
  assetType: string | null;
  lastMarketCap: number | null;
  tier: number | null;
}

export interface ReadonlyEarningsDayRow {
  ticker: string;
  companyName: string | null;
  marketCap: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
  percentChange: number | null;
  marketCapDiff: number | null;
  time: string | null;
  date: number | string;
}

interface PreparedReadonlyStmts {
  ping: Database.Statement<[], { ok: number }>;
  valRows: Database.Statement<[string, number], RawValRow>;
  bs: Database.Statement<[string], { totalDebt: number | null; cashAndEquivalents: number | null }>;
  stmts: Database.Statement<[string], RawStatementRow>;
  fm: Database.Statement<[string], RawFinnhubMetricsRow>;
  sector: Database.Statement<[string], { sector: string | null }>;
  histValRows: Database.Statement<[string, number], RawHistValRow>;
  histStmts: Database.Statement<[string, number], RawFullStatementRow>;
  histTickerInfo: Database.Statement<[string], { sharesOutstanding: number | null; sector: string | null }>;
  tickerPageCore: Database.Statement<[string], RawTickerCoreRow>;
  tickerAnalysisCache: Database.Statement<[string], NonNullable<ReadonlyTickerPageData['analysisCache']>>;
  tickerFinnhubMetrics: Database.Statement<[string], NonNullable<ReadonlyTickerPageData['finnhubMetrics']>>;
  tickerPriceTarget: Database.Statement<[string], RawPriceTargetRow>;
  tickerRecommendation: Database.Statement<[string], RawRecommendationRow>;
  tickerInsiderRecent: Database.Statement<[string], ReadonlyTickerPageData['finnhubInsiderTransactions'][number]>;
  tickerEwLatest: Database.Statement<[string], RawEwSnapshotRow>;
  tickerLastClosedRef: Database.Statement<[string], { previousClose: number; regularClose: number | null }>;
  range52Week: Database.Statement<[string, number, number], Raw52WeekRangeRow>;
  todayPremarket: Database.Statement<[string, number], RawTodayPremarketRow>;
  recentMoves: Database.Statement<[string, number], RawRecentMoveRow>;
  insiderActivity90d: Database.Statement<[string, string], { transactionCode: string; change: number; transactionPrice: number | null }>;
  financialFlows: Database.Statement<[string], RawFinancialFlowRow>;
  matchedTickerMarket: Database.Statement<[string], { lastPrice: number | null; lastChangePct: number | null; lastMarketCap: number | null; latestMoversRVOL: number | null }>;
  matchedAnalysisCache: Database.Statement<[string], NonNullable<ReadonlyMatchedScreensData['analysisCache']>>;
  matchedFinnhubMetrics: Database.Statement<[string], NonNullable<ReadonlyMatchedScreensData['finnhubMetrics']>>;
  matchedInsiderAgg: Database.Statement<[string], NonNullable<ReadonlyMatchedScreensData['insiderAggregate']>>;
  searchIndex: Database.Statement<[], ReadonlySearchTickerRow>;
  earningsDay: Database.Statement<[number, number], ReadonlyEarningsDayRow>;
  verdictMatrix: Database.Statement<[], { verdictKey: string; cnt: number }>;
  screenerIndustries: Database.Statement<[], { industry: string }>;
}

interface ReadonlySqliteState {
  db: Database.Database;
  prepared: PreparedReadonlyStmts;
}

const globalForSqlite = globalThis as unknown as {
  __pmpReadonlySqlite?: ReadonlySqliteState;
};

/** Resolve SQLite file path from DATABASE_URL, stripping file: and query string. */
export function resolveSqliteFilePath(rawUrl?: string): string | null {
  const url = (rawUrl ?? process.env.DATABASE_URL ?? 'file:./prisma/dev.db').trim();
  if (!url.startsWith('file:')) return null;
  const withoutScheme = url.slice(5);
  const pathPart = withoutScheme.split('?')[0]?.trim();
  if (!pathPart) return null;
  if (path.isAbsolute(pathPart)) return pathPart;
  const cwdCandidate = path.resolve(process.cwd(), pathPart);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  const prismaCandidate = path.resolve(process.cwd(), 'prisma', pathPart);
  if (fs.existsSync(prismaCandidate)) return prismaCandidate;
  return cwdCandidate;
}

/** Convert SQLite epoch-ms integer or ISO string timestamps into Date. */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^-?\d+$/.test(trimmed)) return new Date(Number(trimmed));
    return new Date(trimmed);
  }
  return new Date(NaN);
}

function getReadonlyState(): ReadonlySqliteState | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (globalForSqlite.__pmpReadonlySqlite) return globalForSqlite.__pmpReadonlySqlite;

  const dbPath = resolveSqliteFilePath();
  if (!dbPath || !fs.existsSync(dbPath)) return null;

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    db.pragma('cache_size = -16000');
    const prepared: PreparedReadonlyStmts = {
      ping: db.prepare('SELECT 1 AS ok'),
      valRows: db.prepare(
        'SELECT date, closePrice, peRatio, psRatio, pbRatio, evEbitda, fcfYield, marketCap, peForward ' +
        'FROM DailyValuationHistory WHERE symbol = ? AND date >= ? ORDER BY date ASC',
      ),
      bs: db.prepare(
        'SELECT totalDebt, cashAndEquivalents FROM FinancialStatement ' +
        'WHERE symbol = ? AND totalDebt IS NOT NULL AND cashAndEquivalents IS NOT NULL ' +
        'ORDER BY endDate DESC LIMIT 1',
      ),
      stmts: db.prepare(
        'SELECT endDate, fiscalPeriod, fiscalYear, netIncome, sharesOutstanding ' +
        'FROM FinancialStatement WHERE symbol = ?',
      ),
      fm: db.prepare(
        'SELECT forwardPe, fetchedAt FROM FinnhubMetrics WHERE symbol = ? LIMIT 1',
      ),
      sector: db.prepare(
        'SELECT sector FROM Ticker WHERE symbol = ? LIMIT 1',
      ),
      histValRows: db.prepare(
        'SELECT date, peRatio, psRatio, fcfYield, closePrice, marketCap ' +
        'FROM DailyValuationHistory WHERE symbol = ? AND date >= ? ORDER BY date ASC',
      ),
      histStmts: db.prepare(
        'SELECT id, symbol, period, endDate, fiscalYear, fiscalPeriod, revenue, netIncome, ' +
        'netIncomeCommon, ebit, grossProfit, operatingCashFlow, capex, totalAssets, totalLiabilities, ' +
        'currentAssets, currentLiabilities, retainedEarnings, totalEquity, sharesOutstanding, sbc, ' +
        'interestExpense, totalDebt, cashAndEquivalents, netPPE, createdAt, updatedAt ' +
        'FROM FinancialStatement WHERE symbol = ? AND endDate >= ? ORDER BY endDate ASC',
      ),
      histTickerInfo: db.prepare(
        'SELECT sharesOutstanding, sector FROM Ticker WHERE symbol = ? LIMIT 1',
      ),
      tickerPageCore: db.prepare(
        'SELECT symbol, name, assetType, sector, industry, lastPrice, lastChangePct, lastMarketCap, ' +
        'description, employees, websiteUrl, headquarters, latestPrevClose, moversReason, moversCategory, ' +
        'latestMoversZScore, latestMoversRVOL, aiConfidence, isSbcAlert FROM Ticker WHERE symbol = ? LIMIT 1',
      ),
      tickerAnalysisCache: db.prepare(
        'SELECT overallScore, healthScore, profitabilityScore, valuationScore, growthScore, qualityScore, moatScore, ' +
        'verdictText, piotroskiScore, altmanZ, beneishScore, interestCoverage, negativeNiYears, revenueCagr, netIncomeCagr, ' +
        'fcfMargin, debtRepaymentYears, humanDebtInfo, humanPeInfo, pePercentile, fundLevel, valLevel, verdictKey ' +
        'FROM AnalysisCache WHERE symbol = ? LIMIT 1',
      ),
      tickerFinnhubMetrics: db.prepare(
        'SELECT peRatio, forwardPe, dividendYield, roe, payoutRatio, revenueGrowth FROM FinnhubMetrics WHERE symbol = ? LIMIT 1',
      ),
      tickerPriceTarget: db.prepare(
        'SELECT targetHigh, targetLow, targetMean, targetMedian, numberOfAnalysts, currentPrice, fetchedAt ' +
        'FROM FinnhubPriceTarget WHERE symbol = ? LIMIT 1',
      ),
      tickerRecommendation: db.prepare(
        'SELECT period, strongBuy, buy, hold, sell, strongSell, fetchedAt ' +
        'FROM FinnhubRecommendation WHERE symbol = ? LIMIT 1',
      ),
      tickerInsiderRecent: db.prepare(
        'SELECT name, change, filingDate, transactionDate, transactionCode ' +
        'FROM FinnhubInsiderTransaction WHERE symbol = ? ORDER BY transactionDate DESC LIMIT 8',
      ),
      tickerEwLatest: db.prepare(
        'SELECT totalScore, maxPossible, fundamentalsScore, momentumScore, qualityScore, earningsScore, ' +
        'earningsBlocked, rank, asOfDate, rationaleJson ' +
        'FROM EwScoreSnapshot WHERE symbol = ? ORDER BY asOfDate DESC LIMIT 1',
      ),
      tickerLastClosedRef: db.prepare(
        'SELECT previousClose, regularClose FROM DailyRef ' +
        'WHERE symbol = ? AND regularClose IS NOT NULL AND regularClose > 0 ORDER BY date DESC LIMIT 1',
      ),
      range52Week: db.prepare(
        'SELECT MIN(closePrice) AS minClose, MAX(closePrice) AS maxClose, ' +
        'MIN(date) AS minDate, MAX(date) AS maxDate, COUNT(closePrice) AS cnt ' +
        'FROM DailyValuationHistory WHERE symbol = ? AND closePrice > 0 AND date >= ? AND date <= ?',
      ),
      todayPremarket: db.prepare(
        "SELECT lastPrice, changePct, lastTs FROM SessionPrice WHERE symbol = ? AND date = ? AND session = 'pre' LIMIT 1",
      ),
      recentMoves: db.prepare(
        'SELECT date, session, changePct, zScore, lastPrice FROM SessionPrice ' +
        'WHERE symbol = ? AND date >= ? AND (zScore >= 2.0 OR zScore <= -2.0) ORDER BY date DESC LIMIT 5',
      ),
      insiderActivity90d: db.prepare(
        'SELECT transactionCode, change, transactionPrice FROM FinnhubInsiderTransaction ' +
        'WHERE symbol = ? AND transactionDate >= ?',
      ),
      financialFlows: db.prepare(
        'SELECT period, fiscalYear, fiscalPeriod, endDate, revenue, grossProfit, ebit, netIncome, ' +
        'netIncomeCommon, operatingCashFlow, capex, sbc, sharesOutstanding, totalAssets, totalLiabilities, ' +
        'currentAssets, currentLiabilities, retainedEarnings, totalEquity, totalDebt, cashAndEquivalents, netPPE ' +
        'FROM FinancialStatement WHERE symbol = ? AND revenue > 0 ORDER BY endDate DESC LIMIT 16',
      ),
      matchedTickerMarket: db.prepare(
        'SELECT lastPrice, lastChangePct, lastMarketCap, latestMoversRVOL FROM Ticker WHERE symbol = ? LIMIT 1',
      ),
      matchedAnalysisCache: db.prepare(
        'SELECT healthScore, profitabilityScore, valuationScore, growthScore, qualityScore, overallScore, ' +
        'altmanZ, fcfMargin, pePercentile, peVsMedian3yPct, peVsMedian1yPct, peVsMedian5yPct, ' +
        'peVsMedian10yPct, fundLevel, valLevel, verdictKey, rsi14, sma200Pct ' +
        'FROM AnalysisCache WHERE symbol = ? LIMIT 1',
      ),
      matchedFinnhubMetrics: db.prepare(
        'SELECT peRatio, forwardPe, psRatio, pbRatio, pegRatio, evEbitda, evSales, priceFreeCashFlow, ' +
        'priceCashFlow, roe, roa, grossMargin, operatingMargin, netMargin, revenueGrowth, earningsGrowth, ' +
        'bookValueGrowth, dividendYield, payoutRatio, beta, currentRatio, quickRatio, debtEquityRatio, ' +
        'interestCoverage, week52Position FROM FinnhubMetrics WHERE symbol = ? LIMIT 1',
      ),
      matchedInsiderAgg: db.prepare(
        'SELECT netBuyValue90d, netBuyPct90d FROM InsiderAggregate WHERE symbol = ? LIMIT 1',
      ),
      searchIndex: db.prepare(
        'SELECT symbol, name, lastPrice, lastChangePct, assetType, lastMarketCap, tier FROM Ticker',
      ),
      earningsDay: db.prepare(
        'SELECT ticker, companyName, marketCap, epsEstimate, epsActual, revenueEstimate, revenueActual, ' +
        'epsSurprisePercent, revenueSurprisePercent, percentChange, marketCapDiff, time, date ' +
        'FROM EarningsCalendar WHERE date >= ? AND date < ? ORDER BY time ASC, ticker ASC',
      ),
      verdictMatrix: db.prepare(
        'SELECT ac.verdictKey AS verdictKey, COUNT(*) AS cnt ' +
        'FROM AnalysisCache ac INNER JOIN Ticker t ON t.symbol = ac.symbol ' +
        'WHERE t.lastPrice > 0 AND t.lastMarketCap > 0 AND ac.verdictKey IS NOT NULL ' +
        'GROUP BY ac.verdictKey',
      ),
      screenerIndustries: db.prepare(
        'SELECT DISTINCT industry FROM Ticker WHERE lastPrice > 0 AND industry IS NOT NULL ORDER BY industry ASC',
      ),
    };
    globalForSqlite.__pmpReadonlySqlite = { db, prepared };
    return globalForSqlite.__pmpReadonlySqlite;
  } catch {
    return null;
  }
}

/** Fast in-process SQLite health ping bypassing Prisma connection serialization. */
export function pingReadonlySqlite(): boolean {
  const state = getReadonlyState();
  if (!state) return false;
  try {
    const row = state.prepared.ping.get();
    return row?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Read valuation history, statement/BS inputs, Finnhub metrics and sector for
 * /api/analysis/[ticker]/candles directly via WAL read-only SQLite, bypassing
 * Prisma's single-connection queue under concurrent load. Returns null when
 * unavailable so callers can fall back to Prisma cleanly.
 */
export function readCandlesSqliteData(
  symbol: string,
  fromDate: Date,
): ReadonlyCandlesDbData | null {
  const state = getReadonlyState();
  if (!state) return null;

  try {
    const rawValRows = state.prepared.valRows.all(symbol, fromDate.getTime());
    const valRows: ReadonlyValRow[] = rawValRows.map((r) => ({
      date: toDate(r.date),
      closePrice: r.closePrice ?? null,
      peRatio: r.peRatio ?? null,
      psRatio: r.psRatio ?? null,
      pbRatio: r.pbRatio ?? null,
      evEbitda: r.evEbitda ?? null,
      fcfYield: r.fcfYield ?? null,
      marketCap: r.marketCap ?? null,
      peForward: r.peForward ?? null,
    }));

    const bsRow = state.prepared.bs.get(symbol);
    const bs = bsRow
      ? {
          totalDebt: bsRow.totalDebt ?? null,
          cashAndEquivalents: bsRow.cashAndEquivalents ?? null,
        }
      : null;

    const rawStmts = state.prepared.stmts.all(symbol);
    const stmts: ReadonlyStatementRow[] = rawStmts.map((s) => ({
      endDate: toDate(s.endDate),
      fiscalPeriod: s.fiscalPeriod,
      fiscalYear: s.fiscalYear,
      netIncome: s.netIncome ?? null,
      sharesOutstanding: s.sharesOutstanding ?? null,
    }));

    const fmRow = state.prepared.fm.get(symbol);
    const fm = fmRow
      ? {
          forwardPe: fmRow.forwardPe ?? null,
          fetchedAt: toDate(fmRow.fetchedAt),
        }
      : null;

    const sectorRow = state.prepared.sector.get(symbol);
    const sector = sectorRow?.sector ?? null;

    return { valRows, bs, stmts, fm, sector };
  } catch {
    return null;
  }
}

/**
 * Read 10Y daily valuation history, full financial statements, and ticker
 * share count/sector for /api/analysis/[ticker]/history and SSR prefetch
 * directly via WAL read-only SQLite, bypassing Prisma's single-connection queue.
 */
export function readHistorySqliteData(
  symbol: string,
  valFromDate: Date,
  stmtFromDate: Date,
): ReadonlyHistoryDbData | null {
  const state = getReadonlyState();
  if (!state || !('histValRows' in state.prepared)) return null;

  try {
    const rawValRows = state.prepared.histValRows.all(symbol, valFromDate.getTime());
    const valRows: ReadonlyHistoryValRow[] = rawValRows.map((r) => ({
      date: toDate(r.date),
      peRatio: r.peRatio ?? null,
      psRatio: r.psRatio ?? null,
      fcfYield: r.fcfYield ?? null,
      closePrice: r.closePrice ?? null,
      marketCap: r.marketCap ?? null,
    }));

    const rawStmts = state.prepared.histStmts.all(symbol, stmtFromDate.getTime());
    const statements: FinancialStatement[] = rawStmts.map((s) => ({
      ...s,
      endDate: toDate(s.endDate),
      createdAt: toDate(s.createdAt),
      updatedAt: toDate(s.updatedAt),
    }));

    const tickerRow = state.prepared.histTickerInfo.get(symbol);
    const tickerInfo = tickerRow
      ? {
          sharesOutstanding: tickerRow.sharesOutstanding ?? null,
          sector: tickerRow.sector ?? null,
        }
      : null;

    return { valRows, statements, tickerInfo };
  } catch {
    return null;
  }
}

/**
 * Read core AnalysisPage / generateMetadata ticker record + 8 relations directly
 * via WAL read-only SQLite, bypassing Prisma's connection_limit=1 queue.
 */
export function readTickerPageSqliteData(symbol: string): SqliteReadResult<ReadonlyTickerPageData | null> {
  const state = getReadonlyState();
  if (!state || !('tickerPageCore' in state.prepared)) return { ok: false };

  try {
    const core = state.prepared.tickerPageCore.get(symbol);
    if (!core) return { ok: true, data: null };

    const analysisCache = state.prepared.tickerAnalysisCache.get(symbol) ?? null;
    const finnhubMetrics = state.prepared.tickerFinnhubMetrics.get(symbol) ?? null;
    const rawPt = state.prepared.tickerPriceTarget.get(symbol);
    const finnhubPriceTarget = rawPt ? { ...rawPt, fetchedAt: toDate(rawPt.fetchedAt) } : null;
    const rawRec = state.prepared.tickerRecommendation.get(symbol);
    const finnhubRecommendation = rawRec ? { ...rawRec, fetchedAt: toDate(rawRec.fetchedAt) } : null;
    const finnhubInsiderTransactions = state.prepared.tickerInsiderRecent.all(symbol);
    const rawEw = state.prepared.tickerEwLatest.get(symbol);
    const ewScoreSnapshots = rawEw
      ? [{ ...rawEw, earningsBlocked: Boolean(rawEw.earningsBlocked), asOfDate: toDate(rawEw.asOfDate) }]
      : [];
    const lastClosedRef = state.prepared.tickerLastClosedRef.get(symbol) ?? null;

    return {
      ok: true,
      data: {
        ...core,
        isSbcAlert: Boolean(core.isSbcAlert),
        analysisCache,
        finnhubMetrics,
        finnhubPriceTarget,
        finnhubRecommendation,
        finnhubInsiderTransactions,
        ewScoreSnapshots,
        lastClosedRef,
      },
    };
  } catch {
    return { ok: false };
  }
}

/** Read 52-week closing range directly from DailyValuationHistory via SQLite. */
export function read52WeekRangeSqlite(
  symbol: string,
): SqliteReadResult<{ low: number | null; high: number | null } | null> {
  const state = getReadonlyState();
  if (!state || !('range52Week' in state.prepared)) return { ok: false };

  try {
    const now = Date.now();
    const day = 86_400_000;
    const cutoffMs = now - 365 * day;
    const r = state.prepared.range52Week.get(symbol, cutoffMs, now);
    if (!r || r.cnt < 200 || r.minDate == null || r.maxDate == null) {
      return { ok: true, data: null };
    }
    const minMs = toDate(r.minDate).getTime();
    const maxMs = toDate(r.maxDate).getTime();
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs > cutoffMs + 10 * day || maxMs < now - 10 * day) {
      return { ok: true, data: null };
    }
    return { ok: true, data: { low: r.minClose ?? null, high: r.maxClose ?? null } };
  } catch {
    return { ok: false };
  }
}

/** Read today's pre-market SessionPrice row via SQLite. */
export function readTodayPremarketSqlite(
  symbol: string,
  etDate: Date,
): SqliteReadResult<{ lastPrice: number; changePct: number; lastTs: Date } | null> {
  const state = getReadonlyState();
  if (!state || !('todayPremarket' in state.prepared)) return { ok: false };

  try {
    const row = state.prepared.todayPremarket.get(symbol, etDate.getTime());
    if (!row) return { ok: true, data: null };
    return { ok: true, data: { lastPrice: row.lastPrice, changePct: row.changePct, lastTs: toDate(row.lastTs) } };
  } catch {
    return { ok: false };
  }
}

/** Read recent |zScore| >= 2.0 session moves via SQLite. */
export function readRecentMovesSqlite(
  symbol: string,
  since: Date,
): SqliteReadResult<Array<{ date: Date; session: string; changePct: number; zScore: number | null; lastPrice: number }>> {
  const state = getReadonlyState();
  if (!state || !('recentMoves' in state.prepared)) return { ok: false };

  try {
    const rows = state.prepared.recentMoves.all(symbol, since.getTime());
    return { ok: true, data: rows.map((r) => ({ ...r, date: toDate(r.date) })) };
  } catch {
    return { ok: false };
  }
}

/** Read 90-day insider filing rows via SQLite. */
export function readInsiderActivity90dSqlite(
  symbol: string,
  sinceIso: string,
): SqliteReadResult<Array<{ transactionCode: string; change: number; transactionPrice: number | null }>> {
  const state = getReadonlyState();
  if (!state || !('insiderActivity90d' in state.prepared)) return { ok: false };

  try {
    const rows = state.prepared.insiderActivity90d.all(symbol, sinceIso);
    return { ok: true, data: rows };
  } catch {
    return { ok: false };
  }
}

/** Read latest 16 revenue-positive financial statements for Sankey flows via SQLite. */
export function readFinancialFlowsSqlite(symbol: string) {
  const state = getReadonlyState();
  if (!state || !('financialFlows' in state.prepared)) return { ok: false as const };

  try {
    const rows = state.prepared.financialFlows.all(symbol);
    return {
      ok: true as const,
      data: rows.map((r) => ({ ...r, endDate: toDate(r.endDate) })),
    };
  } catch {
    return { ok: false as const };
  }
}

/** Read quick-screen matching inputs directly via WAL read-only SQLite. */
export function readMatchedScreensSqlite(symbol: string): SqliteReadResult<ReadonlyMatchedScreensData | null> {
  const state = getReadonlyState();
  if (!state || !('matchedTickerMarket' in state.prepared)) return { ok: false };

  try {
    const market = state.prepared.matchedTickerMarket.get(symbol);
    if (!market) return { ok: true, data: null };
    const analysisCache = state.prepared.matchedAnalysisCache.get(symbol) ?? null;
    const finnhubMetrics = state.prepared.matchedFinnhubMetrics.get(symbol) ?? null;
    const insiderAggregate = state.prepared.matchedInsiderAgg.get(symbol) ?? null;
    return {
      ok: true,
      data: { ...market, analysisCache, finnhubMetrics, insiderAggregate },
    };
  } catch {
    return { ok: false };
  }
}

/** Read full slim ticker list for in-memory autocomplete search (bypasses Prisma queue). */
export function readSearchIndexSqlite(): SqliteReadResult<ReadonlySearchTickerRow[]> {
  const state = getReadonlyState();
  if (!state || !('searchIndex' in state.prepared)) return { ok: false };
  try {
    return { ok: true, data: state.prepared.searchIndex.all() };
  } catch {
    return { ok: false };
  }
}

/** Read single-day EarningsCalendar rows directly via WAL read-only SQLite. */
export function readEarningsDaySqlite(
  startDate: Date,
  endDate: Date,
): SqliteReadResult<Array<Omit<ReadonlyEarningsDayRow, 'date'> & { date: Date }>> {
  const state = getReadonlyState();
  if (!state || !('earningsDay' in state.prepared)) return { ok: false };
  try {
    const rows = state.prepared.earningsDay.all(startDate.getTime(), endDate.getTime());
    return { ok: true, data: rows.map((r) => ({ ...r, date: toDate(r.date) })) };
  } catch {
    return { ok: false };
  }
}

/** Read verdictKey counts directly via WAL read-only SQLite. */
export function readVerdictMatrixSqlite(): SqliteReadResult<Record<string, number>> {
  const state = getReadonlyState();
  if (!state || !('verdictMatrix' in state.prepared)) return { ok: false };
  try {
    const rows = state.prepared.verdictMatrix.all();
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.verdictKey) counts[r.verdictKey] = r.cnt;
    return { ok: true, data: counts };
  } catch {
    return { ok: false };
  }
}

/** Read distinct active industries directly via WAL read-only SQLite. */
export function readScreenerIndustriesSqlite(): SqliteReadResult<string[]> {
  const state = getReadonlyState();
  if (!state || !('screenerIndustries' in state.prepared)) return { ok: false };
  try {
    const rows = state.prepared.screenerIndustries.all();
    return { ok: true, data: rows.map((r) => r.industry).filter(Boolean) };
  } catch {
    return { ok: false };
  }
}

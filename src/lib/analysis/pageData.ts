import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { dedupeShareClasses } from '@/lib/companyNames';
import type { StatementRow } from '@/components/company/analysis/sections/FinancialFlowsSection';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET } from '@/lib/utils/dateET';

export const getAnalysisQuote = cache((data: {
  lastPrice: number | null;
  lastChangePct: number | null;
  lastClosedRef?: { regularClose: number | null; previousClose: number | null } | null;
} | null, marketSession = detectSession(nowET())) => {
  const positive = (v: number | null | undefined) => v != null && Number.isFinite(v) && v > 0 ? v : null;
  const price = positive(marketSession === 'closed' ? data?.lastClosedRef?.regularClose : data?.lastPrice);
  const previousClose = positive(data?.lastClosedRef?.previousClose);
  const changePct = marketSession === 'closed'
    ? price != null && previousClose != null ? (price / previousClose - 1) * 100 : null
    : price != null && data?.lastChangePct != null && Number.isFinite(data.lastChangePct) ? data.lastChangePct : null;
  return { price, changePct, marketSession };
});

const API_BASE = `http://127.0.0.1:${process.env.PORT || 3001}`;

// React cache() dedupes this ~15-relation query between generateMetadata and
// the page render — it used to run twice per request.
export const getTickerData = cache(async function getTickerData(symbol: string) {
  try {
    // lastClosedRef = the latest DailyRef row that actually closed. Ticker.
    // latestPrevClose is the NEXT session's reference (== the last close
    // itself), so price/prevClose degenerates to 0.00% on weekends — the
    // closed-session move needs the row that carried the real close.
    const [ticker, lastClosedRef] = await Promise.all([
      prisma.ticker.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        description: true,
        employees: true,
        websiteUrl: true,
        headquarters: true,
        latestPrevClose: true,
        moversReason: true,
        moversCategory: true,
        aiConfidence: true,
        isSbcAlert: true,
        analysisCache: {
          select: {
            healthScore: true,
            valuationScore: true,
            verdictText: true,
            piotroskiScore: true,
            altmanZ: true,
            beneishScore: true,
            interestCoverage: true,
            negativeNiYears: true,
            revenueCagr: true,
            netIncomeCagr: true,
            fcfMargin: true,
            debtRepaymentYears: true,
            humanDebtInfo: true,
            humanPeInfo: true,
          },
        },
        finnhubMetrics: {
          select: {
            peRatio: true,
            dividendYield: true,
            roe: true,
          },
        },
        finnhubPriceTarget: {
          select: {
            targetHigh: true,
            targetLow: true,
            targetMean: true,
            targetMedian: true,
            numberOfAnalysts: true,
            currentPrice: true,
            fetchedAt: true,
          },
        },
        finnhubRecommendation: {
          select: {
            period: true,
            strongBuy: true,
            buy: true,
            hold: true,
            sell: true,
            strongSell: true,
            fetchedAt: true,
          },
        },
        finnhubInsiderTransactions: {
          orderBy: { transactionDate: 'desc' },
          take: 8,
          select: {
            name: true,
            change: true,
            filingDate: true,
            transactionDate: true,
            transactionCode: true,
          },
        },
        ewScoreSnapshots: {
          orderBy: { asOfDate: 'desc' },
          take: 1,
          select: {
            totalScore: true,
            maxPossible: true,
            fundamentalsScore: true,
            momentumScore: true,
            qualityScore: true,
            earningsScore: true,
            earningsBlocked: true,
            rank: true,
            asOfDate: true,
            rationaleJson: true,
          },
        },
      },
      }),
      prisma.dailyRef.findFirst({
        where: { symbol, regularClose: { not: null, gt: 0 } },
        orderBy: { date: 'desc' },
        select: { previousClose: true, regularClose: true },
      }),
    ]);
    return ticker ? { ...ticker, lastClosedRef } : ticker;
  } catch (e) {
    // CI build prerenders without a real DB — treat as missing rather than
    // failing the build. At runtime a DB error must surface as 500, not be
    // masked as a cacheable 404 (ISR caches notFound results).
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;
    throw e;
  }
});

/**
 * Fetch recent significant moves from SessionPrice for the "Recent Market Moves"
 * section. Same logic as /movers/[symbol] — |zScore| >= 2.0, last 30 days.
 */
export async function getRecentSignificantMoves(symbol: string) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    return await prisma.sessionPrice.findMany({
      where: {
        symbol,
        date: { gte: since },
        OR: [{ zScore: { gte: 2.0 } }, { zScore: { lte: -2.0 } }],
      },
      orderBy: { date: 'desc' },
      take: 5,
      select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
    });
  } catch {
    return [];
  }
}

/**
 * Latest financial statements for the Financial Flows sankey section.
 * Section-level data — degrades gracefully (section hidden) on error.
 */
export async function getFinancialFlowsData(symbol: string): Promise<StatementRow[]> {
  try {
    return await prisma.financialStatement.findMany({
      where: { symbol, revenue: { gt: 0 } },
      orderBy: { endDate: 'desc' },
      take: 16,
      select: {
        period: true,
        fiscalYear: true,
        fiscalPeriod: true,
        endDate: true,
        revenue: true,
        grossProfit: true,
        ebit: true,
        netIncome: true,
        operatingCashFlow: true,
        capex: true,
        sbc: true,
        sharesOutstanding: true,
        totalAssets: true,
        totalLiabilities: true,
        currentAssets: true,
        currentLiabilities: true,
        retainedEarnings: true,
        totalEquity: true,
        totalDebt: true,
        cashAndEquivalents: true,
        netPPE: true,
      },
    });
  } catch {
    return [];
  }
}

/**
 * Fetch sector peers for the "Related Stocks" section.
 * Returns up to 10 tickers in the same sector, sorted by market cap (desc),
 * excluding the current ticker. Falls back to an empty array on error.
 */
export async function getSectorPeers(sector: string | null | undefined, excludeSymbol: string) {
  if (!sector) return [];
  try {
    const peers = await prisma.ticker.findMany({
      where: {
        sector,
        symbol: { not: excludeSymbol },
        lastMarketCap: { gt: 0 },
        analysisCache: { isNot: null },
      },
      orderBy: { lastMarketCap: 'desc' },
      // Over-fetch — share classes (GOOG/GOOGL) collapse to one company below
      take: 16,
      select: { symbol: true, name: true, lastChangePct: true },
    });
    return dedupeShareClasses(peers, 10);
  } catch {
    return [];
  }
}

/**
 * 52-week closing range — use daily price history, not short-lived DailyRef.
 * Hide incomplete or stale history rather than label a partial range 52WK.
 */
export async function get52WeekRange(symbol: string) {
  try {
    const now = Date.now();
    const day = 86_400_000;
    const cutoff = new Date(now - 365 * day);
    const range = await prisma.dailyValuationHistory.aggregate({
      where: { symbol, closePrice: { gt: 0 }, date: { gte: cutoff, lte: new Date(now) } },
      _max: { closePrice: true, date: true },
      _min: { closePrice: true, date: true },
      _count: { closePrice: true },
    });
    if (range._count.closePrice < 200 || !range._min.date || !range._max.date
      || range._min.date.getTime() > cutoff.getTime() + 10 * day
      || range._max.date.getTime() < now - 10 * day) return null;
    return { low: range._min.closePrice, high: range._max.closePrice };
  } catch {
    return null;
  }
}

/** Shared localhost self-fetch — SSR prefetch of our own API routes. */
async function fetchApiJson(path: string, revalidate: number) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** SSR pre-fetch analysis API — eliminates client-side fetch waterfall. */
export function prefetchAnalysisData(symbol: string) {
  return fetchApiJson(`/api/analysis/${symbol}`, 60);
}

/** SSR pre-fetch history API — chart data for valuation, price, per-share. */
export function prefetchHistoryData(symbol: string) {
  return fetchApiJson(`/api/analysis/${symbol}/history`, 60);
}

export interface TopNewsItem {
  headline: string;
  source: string | null;
  datetime: number | null;
  url: string | null;
}

/**
 * SSR pre-fetch top news headline — feeds the "what's happening" context
 * strip when there is no AI mover insight.
 */
export async function prefetchTopNews(symbol: string): Promise<TopNewsItem | null> {
  const json = await fetchApiJson(`/api/analysis/${symbol}/news`, 300);
  const first = Array.isArray(json?.news) ? json.news[0] : null;
  return first && first.headline
    ? {
        headline: String(first.headline),
        source: first.source ? String(first.source) : null,
        datetime: typeof first.datetime === 'number' ? first.datetime : null,
        url: first.url ? String(first.url) : null,
      }
    : null;
}

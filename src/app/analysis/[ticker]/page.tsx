import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cache } from 'react';
import dynamic from 'next/dynamic';
import { prisma } from '@/lib/db/prisma';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getCompanyName, dedupeShareClasses } from '@/lib/companyNames';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';
import { getEarningsForTicker } from '@/lib/seo/earningsSSR';
import ShareButtons from '@/components/ShareButtons';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET } from '@/lib/utils/dateET';
import { AnalysisHero } from '@/components/company/analysis/sections/AnalysisHero';
import { CompanyOverviewSection } from '@/components/company/analysis/sections/CompanyOverviewSection';

import { KeyInsightsSection } from '@/components/company/analysis/sections/KeyInsightsSection';
import { MoverInsightSection } from '@/components/company/analysis/sections/MoverInsightSection';
import { AnalystConsensusSection } from '@/components/company/analysis/sections/AnalystConsensusSection';
import { EarningsSection } from '@/components/company/analysis/sections/EarningsSection';
import { RecentMovesSection } from '@/components/company/analysis/sections/RecentMovesSection';
import { RelatedStocksSection } from '@/components/company/analysis/sections/RelatedStocksSection';
import { PmpScoreSection } from '@/components/company/analysis/sections/PmpScoreSection';
import { VerdictStrip } from '@/components/company/analysis/sections/VerdictStrip';
import { buildFlowPeriods, type StatementRow } from '@/components/company/analysis/sections/FinancialFlowsSection';
import { PriceHistorySection } from '@/components/company/analysis/sections/PriceHistorySection';
import { KeyMetricsTable } from '@/components/company/analysis/KeyMetricsTable';
import { AnalysisFaqSection, buildAnalysisFaq } from '@/components/company/analysis/sections/AnalysisFaqSection';

import { SeoTextSection } from '@/components/company/SeoTextSection';

// Lazy client chunks — keeps recharts/finnhub-fetch code out of the initial bundle
const IntradayChart = dynamic(() => import('@/components/company/IntradayChart').then((m) => m.IntradayChart));
const NewsSection = dynamic(() => import('@/components/company/analysis/NewsSection').then((m) => m.NewsSection));

export const revalidate = 60;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

// React cache() dedupes this ~15-relation query between generateMetadata and
// the page render — it used to run twice per request.
const getTickerData = cache(async function getTickerData(symbol: string) {
  try {
    return await prisma.ticker.findUnique({
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
        logoUrl: true,
        latestPrevClose: true,
        moversReason: true,
        moversCategory: true,
        aiConfidence: true,
        isSbcAlert: true,
        socialCopy: true,
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
            forwardPe: true,
            pbRatio: true,
            psRatio: true,
            evEbitda: true,
            pegRatio: true,
            roe: true,
            roa: true,
            grossMargin: true,
            operatingMargin: true,
            netMargin: true,
            revenueGrowth: true,
            earningsGrowth: true,
            currentRatio: true,
            debtEquityRatio: true,
            dividendYield: true,
            beta: true,
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
    });
  } catch (e) {
    // CI build prerenders without a real DB — treat as missing rather than
    // failing the build. At runtime a DB error must surface as 500, not be
    // masked as a cacheable 404 (ISR caches notFound results).
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;
    throw e;
  }
});

/**
 * NOTE: deliberately NO generateStaticParams here. This is the heaviest page
 * (6 parallel data fetches incl. 2 HTTP self-calls); prerendering ~200 tickers
 * at build time made the build fragile — one slow DB window during export
 * (Next retries 3× at 60 s per page) failed the whole build and took
 * production down. With ISR (revalidate = 60) pages render on demand and are
 * cached — same SEO output, no build-time export risk.
 */

/**
 * Fetch recent significant moves from SessionPrice for the "Recent Market Moves"
 * section. Same logic as /movers/[symbol] — |zScore| >= 2.0, last 30 days.
 */
async function getRecentSignificantMoves(symbol: string) {
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
async function getFinancialFlowsData(symbol: string): Promise<StatementRow[]> {
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
async function getSectorPeers(sector: string | null | undefined, excludeSymbol: string) {
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  const metadata = generateCompanyMetadata({
    ticker: tickerUpper,
    companyName,
    ...(data?.lastPrice != null ? { price: data.lastPrice } : {}),
    ...(data?.lastChangePct != null ? { percentChange: data.lastChangePct } : {}),
    ...(data?.lastMarketCap != null ? { marketCap: data.lastMarketCap } : {}),
    ...(data?.sector ? { sector: data.sector } : {}),
    ...(data?.industry ? { industry: data.industry } : {}),
  });

  // Thin-content guard: tickers without AnalysisCache have no fundamental
  // analysis data. The analysis tab is client-rendered (ssr:false), so without
  // AnalysisCache the server-rendered HTML is minimal. → noindex to avoid
  // wasting crawl budget on empty pages.
  // Use the data already fetched above instead of a redundant DB query.
  const hasCache = data?.analysisCache != null;
  if (!hasCache) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }

  return metadata;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);

  if (!data) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;

  // Fetch everything in parallel (independent queries)
  // Includes SSR pre-fetch of analysis API + history for instant client hydration
  const [earningsData, recentMoves, sectorPeers, analysisData, historyData, flowStatements, week52, topNews] = await Promise.all([
    getEarningsForTicker(tickerUpper),
    getRecentSignificantMoves(tickerUpper),
    getSectorPeers(data?.sector, tickerUpper),
    // SSR pre-fetch analysis API — eliminates client-side fetch waterfall
    (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/analysis/${tickerUpper}`, {
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 60 },
        });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    })(),
    // SSR pre-fetch history API — chart data for valuation, price, per-share
    (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/analysis/${tickerUpper}/history`, {
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 60 },
        });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    })(),
    getFinancialFlowsData(tickerUpper),
    // 52-week closing range — DailyRef has no intraday H/L, so the honest
    // range is over daily regular closes (labeled as such in the hero).
    prisma.dailyRef.aggregate({
      where: {
        symbol: tickerUpper,
        regularClose: { not: null },
        date: { gte: new Date(Date.now() - 366 * 24 * 60 * 60 * 1000) },
      },
      _max: { regularClose: true },
      _min: { regularClose: true },
    }).catch(() => null),
    // SSR pre-fetch top news headline — feeds the "what's happening" context
    // strip when there is no AI mover insight.
    (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/analysis/${tickerUpper}/news`, {
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        const json = await res.json();
        const first = Array.isArray(json?.news) ? json.news[0] : null;
        return first && first.headline
          ? { headline: String(first.headline), source: first.source ? String(first.source) : null, datetime: typeof first.datetime === 'number' ? first.datetime : null, url: first.url ? String(first.url) : null }
          : null;
      } catch { return null; }
    })(),
  ]);

  const marketSession = detectSession(nowET());

  // One price truth: the headline % shown next to the live price must match
  // the hero. When the market is closed lastChangePct freezes at 0.00, so the
  // hero derives the % from lastPrice vs prevClose — mirror that here.
  const displayChangePct =
    marketSession === 'closed' && data?.lastPrice != null && data.lastPrice > 0 && data?.latestPrevClose != null && data.latestPrevClose > 0
      ? (data.lastPrice / data.latestPrevClose - 1) * 100
      : (data?.lastChangePct ?? null);

  // JSON-LD must escape "</" so a company name/description containing
  // "</script>" cannot break out of the script tag (XSS vector).
  const toJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, '\\u003c');

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/stocks` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper})`, item: `${baseUrl}/analysis/${tickerUpper}` },
    ],
  };

  const stockSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: tickerUpper,
    description: data?.description || `Real-time pre-market stock data and analysis for ${companyName} (${tickerUpper}). Track price, % change, market cap, earnings and more.`,
    ...(data?.sector ? { category: data.sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };

  // Earnings countdown — next scheduled report within 14 days
  const nextEarnings = earningsData.upcoming.length > 0
    ? earningsData.upcoming[earningsData.upcoming.length - 1]
    : null;
  const earningsDays = nextEarnings
    ? Math.ceil((new Date(nextEarnings.date + 'T12:00:00Z').getTime() - Date.now()) / 86_400_000)
    : null;
  const earningsTimeLabel = nextEarnings?.time === 'bmo' ? 'before market open' : nextEarnings?.time === 'amc' ? 'after market close' : '';

  // FAQ items — shared between the visible section and the FAQPage JSON-LD
  const faqItems = buildAnalysisFaq({
    ticker: tickerUpper,
    companyName,
    price: data?.lastPrice ?? null,
    changePct: displayChangePct,
    marketSession,
    healthScore: data?.analysisCache?.healthScore ?? null,
    verdictText: data?.analysisCache?.verdictText ?? null,
    peRatio: data?.finnhubMetrics?.peRatio ?? null,
    valuationScore: data?.analysisCache?.valuationScore ?? null,
    sector: data?.sector ?? null,
    industry: data?.industry ?? null,
    description: data?.description ?? null,
    earningsDate: nextEarnings?.date ?? null,
    earningsDays,
  });

  const faqSchema = faqItems.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      }
    : null;

  // Sankey/flow periods are needed by both the SSR metrics table and the
  // client analysis tab — build once.
  const flowPeriods = buildFlowPeriods(flowStatements);

  // Right rail has content only when at least one rail card can render —
  // mirrors the null conditions inside AnalystConsensusSection/PmpScoreSection.
  const pt = data?.finnhubPriceTarget;
  const rec = data?.finnhubRecommendation;
  const hasConsensus =
    (pt != null && (pt.targetMean != null || pt.targetMedian != null)) ||
    (rec != null && (rec.strongBuy != null || rec.buy != null || rec.hold != null));
  const hasRail = hasConsensus || (data?.ewScoreSnapshots?.[0] != null);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(stockSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" aria-label="Breadcrumb">
          <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-500" aria-hidden="true">/</li>
              <li><Link href="/stocks" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Stocks</Link></li>
              <li className="text-gray-500" aria-hidden="true">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium" aria-current="page">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {nextEarnings && earningsDays != null && earningsDays <= 14 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-sm">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200">
                Earnings
              </span>
              <span className="text-gray-700 dark:text-gray-300">
                {companyName} ({tickerUpper}) reports{' '}
                <strong className="font-semibold">
                  {earningsDays === 0 ? 'today' : earningsDays === 1 ? 'tomorrow' : `in ${earningsDays} days`}
                </strong>{' '}
                ({nextEarnings.date}{earningsTimeLabel ? `, ${earningsTimeLabel}` : ''}).
              </span>
              <Link href="/earnings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Full calendar →
              </Link>
            </div>
          )}

          {/* Hero + mover insight + today's intraday side by side — the "now"
              context stays together, no dead space under the title */}
          <div className="mb-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6 lg:items-start">
            <div className="min-w-0">
              <AnalysisHero
                ticker={tickerUpper}
                companyName={companyName}
                price={data?.lastPrice ?? null}
                changePct={data?.lastChangePct ?? null}
                marketCap={data?.lastMarketCap ?? null}
                sector={data?.sector ?? null}
                industry={data?.industry ?? null}
                marketSession={marketSession}
                prevClose={data?.latestPrevClose ?? null}
                peRatio={data?.finnhubMetrics?.peRatio ?? null}
                dividendYield={data?.finnhubMetrics?.dividendYield ?? null}
                roe={data?.finnhubMetrics?.roe ?? null}
                week52Low={week52?._min?.regularClose ?? null}
                week52High={week52?._max?.regularClose ?? null}
                earningsDate={nextEarnings?.date ?? null}
                earningsDays={earningsDays}
              />
              <VerdictStrip
                verdictText={data?.analysisCache?.verdictText ?? null}
                healthScore={data?.analysisCache?.healthScore ?? null}
                ewScore={data?.ewScoreSnapshots?.[0] ?? null}
                priceTarget={data?.finnhubPriceTarget ?? null}
                currentPrice={data?.lastPrice ?? null}
              />
              <MoverInsightSection
                ticker={tickerUpper}
                moversReason={data?.moversReason ?? null}
                moversCategory={data?.moversCategory ?? null}
                aiConfidence={data?.aiConfidence ?? null}
                isSbcAlert={data?.isSbcAlert ?? null}
                changePct={data?.lastChangePct ?? null}
                topNews={topNews}
                earningsDate={nextEarnings?.date ?? null}
                earningsDays={earningsDays}
                lastMove={recentMoves[0] ?? null}
              />
              {/* Company intro fills the leftover space under the hero —
                  first sentence visible, rest behind a native expander */}
              <CompanyOverviewSection
                companyName={companyName}
                description={data?.description}
                headquarters={data?.headquarters}
                employees={data?.employees}
                websiteUrl={data?.websiteUrl}
              />
            </div>
            <IntradayChart ticker={tickerUpper} />
          </div>

          {/* Main column + right rail (consensus, scores, related) — collapses
              to a single column when the rail has nothing to show */}
          <div className={hasRail ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8' : ''}>
            <div className="min-w-0">

          {/* Main price chart first — the biggest visual on the page */}
          <PriceHistorySection
            ticker={tickerUpper}
            currentPrice={data?.lastPrice ?? null}
            currentChangePct={displayChangePct}
          />

            </div>{/* /main column */}

            {/* Right rail — compact reference cards alongside the main flow */}
            {hasRail && (
              <aside className="mt-6 lg:mt-0">
                <AnalystConsensusSection
                  priceTarget={data?.finnhubPriceTarget ?? null}
                  recommendation={data?.finnhubRecommendation ?? null}
                  fallbackPrice={data?.lastPrice ?? null}
                />

                <PmpScoreSection snapshot={data?.ewScoreSnapshots?.[0] ?? null} />
              </aside>
            )}
          </div>

          {/* Key metrics — rendered at page level (not inside the ssr:false
              tab) so the numbers land in SSR HTML for crawlers AND sit
              directly under the Price History chart. When the SSR prefetch
              failed, the client tab renders its own copy after fetching. */}
          {analysisData && (
            <div className="mb-6">
              <KeyMetricsTable data={analysisData} flowPeriods={flowPeriods} />
            </div>
          )}

          {/* Full interactive analysis — financial statement pairs
              (history bar + structure sankey), valuation, health table */}
          <AnalysisTabClient
            key={tickerUpper}
            ticker={tickerUpper}
            initialAnalysisData={analysisData}
            initialHistoryData={historyData}
            flowPeriods={flowPeriods}
          />

          <p className="-mt-2 mb-6 text-xs text-gray-500 dark:text-gray-500">
            See how {tickerUpper} ranks on the{' '}
            <Link href="/capex-tracker" className="underline hover:text-gray-600 dark:hover:text-gray-300">Capex Tracker</Link>
            {' '}— top 50 capital spenders compared.
          </p>

          {/* Data-driven prose unique per ticker — the differentiator that gets
              pages out of "Crawled – currently not indexed" */}
          <KeyInsightsSection
            ticker={tickerUpper}
            companyName={companyName}
            changePct={data?.lastChangePct ?? null}
            marketSession={marketSession}
            cache={data?.analysisCache ?? null}
            peRatio={data?.finnhubMetrics?.peRatio ?? null}
            roe={data?.finnhubMetrics?.roe ?? null}
            dividendYield={data?.finnhubMetrics?.dividendYield ?? null}
            earningsDays={earningsDays}
            moversReason={data?.moversReason ?? null}
            moversCategory={data?.moversCategory ?? null}
          />

          <EarningsSection upcoming={earningsData.upcoming} recent={earningsData.recent} />

          <RecentMovesSection ticker={tickerUpper} moves={recentMoves} />

          {/* FAQ — visible Q&As mirrored by the FAQPage JSON-LD above */}
          <AnalysisFaqSection items={faqItems} ticker={tickerUpper} />

          {/* SEO text section — unique keyword-rich content for Google indexing */}
          <SeoTextSection
            ticker={tickerUpper}
            companyName={companyName}
            price={data?.lastPrice ?? null}
            changePct={data?.lastChangePct ?? null}
            marketCap={data?.lastMarketCap ?? null}
            sector={data?.sector ?? null}
            industry={data?.industry ?? null}
            healthScore={data?.analysisCache?.healthScore ?? null}
            hasEarnings={earningsData.upcoming.length > 0 || earningsData.recent.length > 0}
            hasValuation={!!data?.analysisCache}
            hasFinancials={!!data?.analysisCache}
            peersCount={sectorPeers.length}
          />

          {/* Cross-links to related report pages + share — grouped with the
              discovery section at the bottom */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-sm flex flex-col gap-3">
            <Link
              href={`/premarket/${tickerUpper}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {companyName} ({tickerUpper}) Premarket Movers →
            </Link>
            <Link
              href={`/valuation/${tickerUpper}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {companyName} ({tickerUpper}) Valuation & P/E History →
            </Link>
            <Link
              href={`/financials/${tickerUpper}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {companyName} ({tickerUpper}) Financial Statements →
            </Link>
            <ShareButtons
              url={`${baseUrl}/analysis/${tickerUpper}`}
              title={`${companyName} (${tickerUpper}) Stock Analysis | PreMarketPrice`}
              description={data?.description?.slice(0, 100)}
            />
          </div>

          {/* Sector peers — discovery/internal links at the bottom, after the
              analysis content */}
          <RelatedStocksSection ticker={tickerUpper} sector={data?.sector} peers={sectorPeers} />

          {/* Latest news — at the very bottom, client-side fetch from Finnhub, cached 30min */}
          <NewsSection ticker={tickerUpper} />
        </main>
      </div>
    </>
  );
}

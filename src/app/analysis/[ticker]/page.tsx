import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { generateCompanyMetadata, generateBreadcrumbSchema } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';
import { getEarningsForTicker } from '@/lib/seo/earningsSSR';
import { summarizeLossYears } from '@/lib/utils/analysisMath';
import {
  getTickerData,
  getAnalysisQuote,
  getRecentSignificantMoves,
  getFinancialFlowsData,
  getSectorPeers,
  get52WeekRange,
  prefetchAnalysisData,
  prefetchHistoryData,
  prefetchTopNews,
} from '@/lib/analysis/pageData';
import { buildStockSchema } from '@/lib/seo/analysisSchemas';
import { buildFlowPeriods } from '@/components/company/analysis/sections/FinancialFlowsSection';
import { AnalysisHero } from '@/components/company/analysis/sections/AnalysisHero';
import { TrackPageEvent } from '@/components/analytics/TrackPageEvent';
import { CompanyOverviewSection } from '@/components/company/analysis/sections/CompanyOverviewSection';
import { KeyInsightsSection } from '@/components/company/analysis/sections/KeyInsightsSection';
import { MoverInsightSection } from '@/components/company/analysis/sections/MoverInsightSection';
import { InsiderTransactionsSection } from '@/components/company/analysis/sections/InsiderTransactionsSection';
import PillarsRadar, { PillarChips } from '@/components/company/analysis/PillarsRadar';
import { EarningsSection } from '@/components/company/analysis/sections/EarningsSection';
import { EarningsBanner } from '@/components/company/analysis/sections/EarningsBanner';
import { RecentMovesSection } from '@/components/company/analysis/sections/RecentMovesSection';
import { RelatedStocksSection } from '@/components/company/analysis/sections/RelatedStocksSection';
import { PriceHistorySection } from '@/components/company/analysis/sections/PriceHistorySection';
import { KeyMetricsTable } from '@/components/company/analysis/KeyMetricsTable';
import { AnalysisFaqSection, buildAnalysisFaq, buildFaqSchema } from '@/components/company/analysis/sections/AnalysisFaqSection';
import { AnalysisCrossLinks } from '@/components/company/analysis/sections/AnalysisCrossLinks';
import { SeoTextSection } from '@/components/company/SeoTextSection';

// Lazy client chunks — keeps recharts/finnhub-fetch code out of the initial bundle
const IntradayChart = dynamic(() => import('@/components/company/IntradayChart').then((m) => m.IntradayChart));
const NewsSection = dynamic(() => import('@/components/company/analysis/NewsSection').then((m) => m.NewsSection));

export const revalidate = 60;

/**
 * An EMPTY generateStaticParams is what actually makes this dynamic route
 * ISR-eligible in Next 15/16: without it, [ticker] renders via streaming SSR
 * on EVERY request (no-store, absent from the ISR manifest). Returning []
 * prerenders nothing at build time — all params render on demand against the
 * live DB and are then ISR-cached for `revalidate` seconds.
 * The list stays empty deliberately: this is the heaviest page (6 parallel
 * data fetches incl. 2 HTTP self-calls); prerendering ~200 tickers at build
 * time made the build fragile (Next retries 3× at 60 s per page).
 */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

// JSON-LD must escape "</" so a company name/description containing
// "</script>" cannot break out of the script tag (XSS vector).
const toJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, '\\u003c');

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);
  const quote = getAnalysisQuote(data);

  const metadata = generateCompanyMetadata({
    ticker: tickerUpper,
    companyName,
    ...(quote.price != null ? { price: quote.price } : {}),
    ...(quote.changePct != null ? { percentChange: quote.changePct } : {}),
    ...(data?.lastMarketCap != null ? { marketCap: data.lastMarketCap } : {}),
    ...(data?.sector ? { sector: data.sector } : {}),
    ...(data?.industry ? { industry: data.industry } : {}),
  });

  // Thin-content guard: tickers without AnalysisCache have no fundamental
  // analysis data. The analysis tab is client-rendered (ssr:false), so without
  // AnalysisCache the server-rendered HTML is minimal. → noindex to avoid
  // wasting crawl budget on empty pages.
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

  // Fetch everything in parallel (independent queries).
  // Includes SSR pre-fetch of analysis API + history for instant client hydration.
  const [earningsData, recentMoves, sectorPeers, analysisData, historyData, flowStatements, week52, topNews] = await Promise.all([
    getEarningsForTicker(tickerUpper),
    getRecentSignificantMoves(tickerUpper),
    getSectorPeers(data?.sector, tickerUpper),
    prefetchAnalysisData(tickerUpper),
    prefetchHistoryData(tickerUpper),
    getFinancialFlowsData(tickerUpper),
    get52WeekRange(tickerUpper),
    prefetchTopNews(tickerUpper),
  ]);

  const { price: displayPrice, changePct: displayChangePct, marketSession } = getAnalysisQuote(data);

  // One price truth: the headline % shown next to the live price must match
  // the hero. When the market is closed, Ticker.latestPrevClose is the NEXT
  // session's reference (== the last close itself → 0.00% lie), so derive the
  // last-session move from the DailyRef row that actually closed.
  const lastClosedRef = data?.lastClosedRef ?? null;
  const lastSessionPrevClose = lastClosedRef?.previousClose ?? null;

  // Unified P/E: price / own TTM EPS (via /api/analysis compute). Finnhub's
  // peRatio only fills in when the analysis pipeline has no data at all.
  const displayPeRatio = analysisData
    ? (analysisData.metrics?.currentPe ?? null)
    : (data?.finnhubMetrics?.peRatio ?? null);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Stocks', url: `${baseUrl}/stocks` },
    { name: `${companyName} (${tickerUpper})`, url: `${baseUrl}/analysis/${tickerUpper}` },
  ]);
  const stockSchema = buildStockSchema({
    ticker: tickerUpper,
    companyName,
    description: data?.description,
    sector: data?.sector,
  });

  // Earnings countdown — next scheduled report within 14 days
  const nextEarnings = earningsData.upcoming.length > 0
    ? earningsData.upcoming[earningsData.upcoming.length - 1]
    : null;
  const earningsDays = nextEarnings
    ? Math.ceil((new Date(nextEarnings.date + 'T12:00:00Z').getTime() - Date.now()) / 86_400_000)
    : null;

  // Pillar-derived values — one consistent source feeding hero, verdict,
  // FAQ, insights and the radar. Stored AnalysisCache scores are the
  // fallback while the cache refresh converges to the new definitions.
  const pillarVals = analysisData?.pillars ?? null;
  const pillarHealth = pillarVals?.health.score ?? null;
  const pillarValuation = pillarVals?.valuation.score ?? null;
  const pillarRoeVal = pillarVals?.profitability.legs.find((l: { key: string }) => l.key === 'roe')?.value;
  const pillarRoePct = pillarRoeVal != null ? pillarRoeVal * 100 : null;
  // Negative shareholder equity makes ROE meaningless — Finnhub still reports
  // a number (PM: 575.4%), so the fallback must be suppressed, not filled.
  const negEquity = analysisData?.balanceSheet?.totalEquity != null
    && analysisData.balanceSheet.totalEquity <= 0;
  const roeStat = negEquity ? null : (pillarRoePct ?? data?.finnhubMetrics?.roe ?? null);
  // KeyInsights reads valuationScore off the cache object — override with
  // the fresh pillar value so prose and radar can't disagree.
  const insightsCache = data?.analysisCache
    ? { ...data.analysisCache, valuationScore: pillarValuation ?? data.analysisCache.valuationScore }
    : null;

  // FAQ items — shared between the visible section and the FAQPage JSON-LD
  const faqItems = buildAnalysisFaq({
    ticker: tickerUpper,
    companyName,
    price: displayPrice,
    changePct: displayChangePct,
    marketSession,
    healthScore: pillarHealth ?? data?.analysisCache?.healthScore ?? null,
    verdictText: data?.analysisCache?.verdictText ?? null,
    peRatio: displayPeRatio,
    valuationScore: pillarValuation ?? data?.analysisCache?.valuationScore ?? null,
    sector: data?.sector ?? null,
    industry: data?.industry ?? null,
    description: data?.description ?? null,
    earningsDate: nextEarnings?.date ?? null,
    earningsDays,
  });
  const faqSchema = buildFaqSchema(faqItems);

  // Sankey/flow periods are needed by both the SSR metrics table and the
  // client analysis tab — build once.
  const flowPeriods = buildFlowPeriods(flowStatements);

  // Right rail = pillar profile radar (always present once analysis data
  // loads). Analyst consensus renders as a compact strip in the hero.
  // The EW score stays a Key Metrics cell — it is a quant timing signal,
  // not a fundamental pillar.
  const hasPillars = analysisData?.pillars != null
    && (analysisData.statements?.length ?? 0) > 0;
  const ewScore = data?.ewScoreSnapshots?.[0] ?? null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(stockSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      )}
      <TrackPageEvent name="view_item" params={{ item_id: tickerUpper, item_type: 'analysis' }} />

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
            <EarningsBanner
              companyName={companyName}
              ticker={tickerUpper}
              date={nextEarnings.date}
              time={nextEarnings.time}
              earningsDays={earningsDays}
            />
          )}

          {/* Two independent columns — no row coupling, so neither column's
              height can leave dead space under the other. Left: hero → news →
              price history. Rail: radar (top-right anchor) → intraday → about
              → consensus. Mobile stacks in DOM order: left stack, then rail. */}
          <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
            <div className="min-w-0 space-y-6">
              <AnalysisHero
                ticker={tickerUpper}
                companyName={companyName}
                price={displayPrice}
                changePct={displayChangePct}
                marketCap={data?.lastMarketCap ?? null}
                sector={data?.sector ?? null}
                industry={data?.industry ?? null}
                marketSession={marketSession}
                prevClose={lastSessionPrevClose}
                peRatio={displayPeRatio}
                dividendYield={data?.finnhubMetrics?.dividendYield ?? null}
                roe={roeStat}
                week52Low={week52?.low ?? null}
                week52High={week52?.high ?? null}
                earningsDate={nextEarnings?.date ?? null}
                earningsDays={earningsDays}
                verdict={data?.analysisCache?.verdictText ?? null}
                ewScore={ewScore}
                priceTarget={data?.finnhubPriceTarget ?? null}
                recommendation={data?.finnhubRecommendation ?? null}
              />
              {/* Mobile-only profile chips — the radar card sits deep in the
                  scroll stack on small screens, so the five scores surface
                  right under the hero instead. Hidden on lg+ (radar covers). */}
              {hasPillars && (
                <div className="lg:hidden">
                  <PillarChips pillars={analysisData!.pillars!} />
                </div>
              )}
              <MoverInsightSection
                ticker={tickerUpper}
                moversReason={data?.moversReason ?? null}
                moversCategory={data?.moversCategory ?? null}
                aiConfidence={data?.aiConfidence ?? null}
                isSbcAlert={data?.isSbcAlert ?? null}
                changePct={displayChangePct}
                topNews={topNews}
                earningsDate={nextEarnings?.date ?? null}
                earningsDays={earningsDays}
                lastMove={recentMoves[0] ?? null}
              />
              <PriceHistorySection
                ticker={tickerUpper}
                currentPrice={displayPrice}
                currentChangePct={displayChangePct}
                changeLabel={marketSession === 'closed' ? 'at last close' : marketSession === 'pre' ? 'pre-market' : marketSession === 'after' ? 'after-hours' : 'day'}
              />
            </div>
            <div className="min-w-0 space-y-6">
              {hasPillars
                ? <PillarsRadar pillars={analysisData!.pillars!} />
                : <IntradayChart ticker={tickerUpper} />}
              {hasPillars && <IntradayChart ticker={tickerUpper} />}
              <CompanyOverviewSection
                companyName={companyName}
                description={data?.description}
                headquarters={data?.headquarters}
                employees={data?.employees}
                websiteUrl={data?.websiteUrl}
              />
            </div>
          </div>

          {/* Insider transactions get a full-width row — the filing list is
              the tallest card, so pairing it with anything leaves dead space
              under the shorter neighbour. */}
          <div className="mb-6">
            <InsiderTransactionsSection
              transactions={data?.finnhubInsiderTransactions ?? []}
            />
          </div>

          {/* Key metrics — rendered at page level (not inside the ssr:false
              tab) so the numbers land in SSR HTML for crawlers AND sit
              directly under the Price History chart. When the SSR prefetch
              failed, the client tab renders its own copy after fetching. */}
          {analysisData && (
            <div className="mb-6">
              <KeyMetricsTable data={analysisData} />
            </div>
          )}

          {/* Data-driven prose unique per ticker — sits directly under Key
              Metrics so mobile readers hit "why it matters" before the long
              interactive deep-dive (charts push it ~10k px down otherwise). */}
          <KeyInsightsSection
            ticker={tickerUpper}
            companyName={companyName}
            changePct={displayChangePct}
            marketSession={marketSession}
            cache={insightsCache}
            lossHistory={summarizeLossYears(analysisData?.statements ?? [])}
            peRatio={displayPeRatio}
            roe={roeStat}
            dividendYield={data?.finnhubMetrics?.dividendYield ?? null}
            earningsDays={earningsDays}
            moversReason={data?.moversReason ?? null}
            moversCategory={data?.moversCategory ?? null}
          />

          {/* Full interactive analysis — financial statement pairs
              (history bar + structure sankey), valuation, health table */}
          <AnalysisTabClient
            key={tickerUpper}
            ticker={tickerUpper}
            initialAnalysisData={analysisData}
            initialHistoryData={historyData}
            flowPeriods={flowPeriods}
            ewScore={ewScore}
          />

          <p className="-mt-2 mb-6 text-xs text-gray-500 dark:text-gray-500">
            See how {tickerUpper} ranks on the{' '}
            <Link href="/capex-tracker" className="underline hover:text-gray-600 dark:hover:text-gray-300">Capex Tracker</Link>
            {' '}— top 50 capital spenders compared.
          </p>

          <EarningsSection upcoming={earningsData.upcoming} recent={earningsData.recent} />

          <RecentMovesSection ticker={tickerUpper} moves={recentMoves} />

          {/* FAQ — visible Q&As mirrored by the FAQPage JSON-LD above */}
          <AnalysisFaqSection items={faqItems} ticker={tickerUpper} />

          {/* SEO text section — unique keyword-rich content for Google indexing */}
          <SeoTextSection
            ticker={tickerUpper}
            companyName={companyName}
            price={displayPrice}
            changePct={displayChangePct}
            marketCap={data?.lastMarketCap ?? null}
            sector={data?.sector ?? null}
            industry={data?.industry ?? null}
            healthScore={pillarHealth ?? data?.analysisCache?.healthScore ?? null}
            hasEarnings={earningsData.upcoming.length > 0 || earningsData.recent.length > 0}
            hasValuation={!!data?.analysisCache}
            hasFinancials={!!data?.analysisCache}
            peersCount={sectorPeers.length}
          />

          {/* Cross-links to related report pages + share — grouped with the
              discovery section at the bottom */}
          <AnalysisCrossLinks
            ticker={tickerUpper}
            companyName={companyName}
            description={data?.description}
          />

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

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
  get52WeekRange,
  getInsiderActivity90d,
  getTodayPremarket,
  prefetchAnalysisData,
  prefetchHistoryData,
  prefetchTopNews,
  prefetchDipData,
  prefetchMarketProfile,
} from '@/lib/analysis/pageData';
import { buildStockSchema } from '@/lib/seo/analysisSchemas';
import { buildFlowPeriods, type StatementRow } from '@/components/company/analysis/sections/FinancialFlowsSection';
import { AnalysisHero } from '@/components/company/analysis/sections/AnalysisHero';
import { TickerNavigator } from '@/components/company/analysis/TickerNavigator';
import { getTickerNav, getSimilarTickers } from '@/lib/analysis/tickerNav';
import { TrackPageEvent } from '@/components/analytics/TrackPageEvent';
import { CompanyOverviewSection } from '@/components/company/analysis/sections/CompanyOverviewSection';
import { KeyInsightsSection } from '@/components/company/analysis/sections/KeyInsightsSection';
import { MoverInsightSection } from '@/components/company/analysis/sections/MoverInsightSection';
import PillarsRadar, { PillarChips } from '@/components/company/analysis/PillarsRadar';
import { getPeerPillars } from '@/lib/analysis/peerPillars';
import { EarningsSection } from '@/components/company/analysis/sections/EarningsSection';
import { EarningsBanner } from '@/components/company/analysis/sections/EarningsBanner';
import { RecentMovesSection } from '@/components/company/analysis/sections/RecentMovesSection';
import { RelatedOpportunities } from '@/components/company/analysis/sections/RelatedOpportunities';
import { getRelatedOpportunities } from '@/lib/analysis/relatedOpportunities';
import { PriceHistorySection } from '@/components/company/analysis/sections/PriceHistorySection';
import { KeyMetricsTable } from '@/components/company/analysis/KeyMetricsTable';
import { AnalysisFaqSection, buildAnalysisFaq, buildFaqSchema } from '@/components/company/analysis/sections/AnalysisFaqSection';
import { AnalysisCrossLinks } from '@/components/company/analysis/sections/AnalysisCrossLinks';
import { SeoTextSection } from '@/components/company/SeoTextSection';
import { AnalysisStockSearch } from '@/components/AnalysisStockSearch';
import { ThesisCard } from '@/components/company/analysis/sections/ThesisCard';
import { PmpVerdict } from '@/components/company/analysis/sections/PmpVerdict';
import { getMatchedScreens } from '@/lib/analysis/matchedScreens';
import { renderPresetIcon } from '@/lib/utils/screenerIcons';
import { TechnicalDipSection } from '@/components/company/analysis/sections/TechnicalDipSection';
import { EtfBasketSection } from '@/components/company/analysis/sections/EtfBasketSection';
import { getEtfBasket } from '@/lib/analysis/etfBaskets';
import { MarketProfileSection } from '@/components/company/analysis/sections/MarketProfileSection';

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
  const isEtf = data?.assetType === 'ETF' || data?.assetType === 'LEVERAGED_ETF';

  // Fetch everything in parallel (independent queries).
  // Includes SSR pre-fetch of analysis API + history + dipData for instant hydration.
  const [earningsData, recentMoves, relatedOpps, analysisData, historyData, week52, topNews, matchedScreens, tickerNav, similarTickers, insiderActivity, premarketData, dipData, etfBasket, peerPillars, marketProfile] = await Promise.all([
    isEtf ? Promise.resolve({ upcoming: [], recent: [] }) : getEarningsForTicker(tickerUpper),
    getRecentSignificantMoves(tickerUpper),
    getRelatedOpportunities(tickerUpper),
    isEtf ? Promise.resolve(null) : prefetchAnalysisData(tickerUpper),
    isEtf ? Promise.resolve(null) : prefetchHistoryData(tickerUpper),
    get52WeekRange(tickerUpper),
    prefetchTopNews(tickerUpper, companyName),
    getMatchedScreens(tickerUpper),
    getTickerNav(tickerUpper),
    getSimilarTickers(tickerUpper),
    isEtf ? Promise.resolve([]) : getInsiderActivity90d(tickerUpper),
    getTodayPremarket(tickerUpper),
    prefetchDipData(tickerUpper),
    isEtf ? getEtfBasket(tickerUpper) : Promise.resolve(null),
    isEtf ? Promise.resolve(null) : getPeerPillars(data?.sector ?? null, data?.industry ?? null),
    prefetchMarketProfile(tickerUpper),
  ]);

  // Reuse statements already loaded by prefetchAnalysisData; only hit the DB
  // when analysisData is absent (e.g. unanalyzed ticker).
  const flowStatements: StatementRow[] = isEtf
    ? []
    : analysisData?.statements?.length
      ? (analysisData.statements as StatementRow[]).filter((s) => (s.revenue ?? 0) > 0).slice(0, 16)
      : await getFinancialFlowsData(tickerUpper);

  const peersCount = relatedOpps.groups.reduce((n, g) => n + g.items.length, 0)
    || (analysisData?.peers?.length ?? 0);

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

  // Middle crumb = sector landing (a real navigational parent that links
  // into the sector funnel); falls back to the flat stock index.
  const breadcrumbMid = data?.sector
    ? { name: data.sector, url: `${baseUrl}/sectors/${encodeURIComponent(data.sector)}` }
    : { name: 'Stocks', url: `${baseUrl}/stocks` };
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    breadcrumbMid,
    { name: `${companyName} (${tickerUpper})`, url: `${baseUrl}/analysis/${tickerUpper}` },
  ]);
  const stockSchema = buildStockSchema({
    ticker: tickerUpper,
    companyName,
    description: data?.description,
    sector: data?.sector,
    price: displayPrice,
    marketCapB: data?.lastMarketCap,
    peRatio: displayPeRatio,
    healthScore: analysisData?.pillars?.health.score ?? data?.analysisCache?.healthScore ?? null,
    valuationScore: analysisData?.pillars?.valuation.score ?? data?.analysisCache?.valuationScore ?? null,
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

  // Latest balance-sheet snapshot for the hero "Cash vs debt" bar —
  // first row with both fields (flowStatements come newest-first).
  const bsRow = flowStatements.find((s) => s.totalDebt != null && s.cashAndEquivalents != null);
  const cashVsDebt = bsRow
    ? {
        cash: bsRow.cashAndEquivalents!,
        debt: bsRow.totalDebt!,
        label: `${bsRow.fiscalPeriod ?? ''} ${bsRow.fiscalYear ?? ''}`.trim(),
      }
    : null;

  // Right rail = pillar profile radar (always present once analysis data
  // loads). Analyst consensus renders as a compact strip in the hero.
  // The EW score stays a Key Metrics cell — it is a quant timing signal,
  // not a fundamental pillar.
  // 0-statement tickers (ADRs Finnhub doesn't cover) get zero pillars —
  // hide the radar/chips rather than show garbage scores, and let the
  // verdict say "insufficient data" instead.
  const hasPillars = analysisData?.pillars != null && !analysisData?.insufficientData
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
          <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <ol className="flex items-center space-x-2 text-sm min-w-0 overflow-hidden">
              <li className="shrink-0"><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-500 shrink-0" aria-hidden="true">/</li>
              <li className="min-w-0"><Link href={breadcrumbMid.url.replace(baseUrl, '')} className="block text-gray-500 hover:text-blue-600 dark:text-gray-400 truncate max-w-[12rem] sm:max-w-none">{breadcrumbMid.name}</Link></li>
              <li className="text-gray-500 shrink-0" aria-hidden="true">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium shrink-0" aria-current="page">{tickerUpper}</li>
            </ol>
            <div className="w-full sm:max-w-xs sm:ml-auto shrink-0">
              <AnalysisStockSearch placeholder="Analyze another stock…" />
            </div>
          </div>
        </nav>

        <main className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {tickerNav && (
            <div className="mb-4">
              <TickerNavigator symbol={tickerUpper} nav={tickerNav} />
            </div>
          )}

          {nextEarnings && earningsDays != null && earningsDays <= 14 && (
            <EarningsBanner
              companyName={companyName}
              ticker={tickerUpper}
              date={nextEarnings.date}
              time={nextEarnings.time}
              earningsDays={earningsDays}
            />
          )}

          {/* Screen badges — which quick screens this stock currently passes.
              SSR chips double as internal links to the filtered screener. */}
          {matchedScreens.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="screen-badges">
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">In screens:</span>
              {matchedScreens.map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  title={s.tip}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 transition-colors"
                >
                  <span className="inline-flex items-center gap-1">{renderPresetIcon(s.icon)}{s.label}</span>
                </Link>
              ))}
            </div>
          )}

          {/* ROW 1: Hero Card (with integrated About & Report Pills) + 6-Axis Profile Radar */}
          <div className={`mb-4 grid gap-4 ${hasPillars ? 'lg:grid-cols-[minmax(0,1fr)_23.5rem]' : 'grid-cols-1'} lg:items-stretch`}>
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
              premarket={premarketData}
              peRatio={displayPeRatio}
              peHistory={analysisData?.valuationHistoryStats?.pe ?? null}
              dividendYield={data?.finnhubMetrics?.dividendYield ?? null}
              roe={roeStat}
              week52Low={week52?.low ?? null}
              week52High={week52?.high ?? null}
              cashVsDebt={cashVsDebt}
              earningsDate={nextEarnings?.date ?? null}
              earningsDays={earningsDays}
              ewScore={ewScore}
              priceTarget={data?.finnhubPriceTarget ?? null}
              recommendation={data?.finnhubRecommendation ?? null}
              description={data?.description ?? null}
              headquarters={data?.headquarters ?? null}
              employees={data?.employees ?? null}
              websiteUrl={data?.websiteUrl ?? null}
            />
            {hasPillars && <PillarsRadar pillars={analysisData!.pillars!} previous={analysisData?.pillarsPrev ?? null} peer={peerPillars} />}
          </div>

          {/* Mobile-only profile chips — quick score strip right under the hero on phones */}
          {hasPillars && (
            <div className="mb-4 lg:hidden">
              <PillarChips pillars={analysisData!.pillars!} />
            </div>
          )}

          {/* ROW 2: 3-Column Decision, Intraday & Statistical Dip Grid
              Col 1: Unified PMP Verdict & Thesis (Strengths + Bull Case + Risk Flags)
              Col 2: Live Intraday 5-min Chart + What's Happening Catalyst
              Col 3: Gaussian RSI & Dip Curve + 3-Tranche Plan */}
          <div className="mb-6 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_23.5rem] lg:items-stretch">
            <PmpVerdict
              pillars={analysisData?.pillars ?? null}
              insufficientData={analysisData?.insufficientData ?? null}
              pePercentile={analysisData?.valuationHistoryStats?.pe?.percentile ?? null}
              peCurrent={displayPeRatio}
              peMedian={analysisData?.valuationHistoryStats?.pe?.median ?? null}
              peYears={analysisData?.valuationHistoryStats?.pe?.years ?? null}
              psPercentile={analysisData?.valuationHistoryStats?.ps?.percentile ?? null}
              forwardPe={analysisData?.finnhubMetrics?.forwardPe ?? null}
              revenueGrowthYoY={analysisData?.finnhubMetrics?.revenueGrowth ?? null}
              revenueCagr={analysisData?.revenueCagr ?? null}
              changePct={displayChangePct}
              moversReason={data?.moversReason ?? null}
              moversCategory={data?.moversCategory ?? null}
              moversZScore={data?.latestMoversZScore ?? null}
              moversRvol={data?.latestMoversRVOL ?? null}
              analysisData={analysisData}
              cache={data?.analysisCache ?? null}
              roe={roeStat}
              assetType={data?.assetType ?? null}
              dipItem={dipData}
            />
            <div className="flex min-w-0 flex-col gap-3.5 h-full">
              <IntradayChart ticker={tickerUpper} />
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
            </div>
            <TechnicalDipSection ticker={tickerUpper} initialItem={dipData} />
          </div>

          {/* Price history — full-width section */}
          <div id="price-chart" className="scroll-mt-16">
            <PriceHistorySection
              ticker={tickerUpper}
              companyName={companyName}
              nav={tickerNav}
              similar={similarTickers}
              currentPrice={displayPrice}
              currentChangePct={displayChangePct}
              changeLabel={marketSession === 'closed' ? 'at last close' : marketSession === 'pre' ? 'pre-market' : marketSession === 'after' ? 'after-hours' : 'day'}
            />
          </div>

          {/* S&P 500 Alpha Matrix, 1Y Risk, Industry Peers & Split-Adjusted Dividends */}
          <MarketProfileSection
            ticker={tickerUpper}
            companyName={companyName}
            initialData={marketProfile}
            isEtf={isEtf}
          />

          {/* ETF related basket — constituents / sector leaders / underlying (ETFs only) */}
          {isEtf && etfBasket && <EtfBasketSection ticker={tickerUpper} basket={etfBasket} />}

          {/* Key metrics — SSR table directly under Price History (stocks only) */}
          {!isEtf && analysisData && (
            <div id="key-metrics" className="mb-6 scroll-mt-16">
              <KeyMetricsTable data={analysisData} insiderTransactions={data.finnhubInsiderTransactions} insiderActivity={insiderActivity} />
            </div>
          )}

          {/* Full interactive analysis — financial statement pairs (history bar + structure sankey), valuation, health charts (stocks only) */}
          {!isEtf && (
            <>
              <div id="financial-charts" className="scroll-mt-16">
                <AnalysisTabClient
                  key={tickerUpper}
                  ticker={tickerUpper}
                  initialAnalysisData={analysisData}
                  initialHistoryData={historyData}
                  flowPeriods={flowPeriods}
                  ewScore={ewScore}
                />
              </div>

              <p className="-mt-2 mb-6 text-xs text-gray-500 dark:text-gray-500">
                See how {tickerUpper} ranks on the{' '}
                <Link href="/capex-tracker" className="underline hover:text-gray-600 dark:hover:text-gray-300">Capex Tracker</Link>
                {' '}— top 50 capital spenders compared.
              </p>
            </>
          )}

          {/* Earnings & Recent Unusual Moves side-by-side */}
          <div id="earnings-moves" className="grid gap-6 grid-cols-1 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] items-start scroll-mt-16">
            {!isEtf && <EarningsSection upcoming={earningsData.upcoming} recent={earningsData.recent} />}
            <RecentMovesSection ticker={tickerUpper} moves={recentMoves} />
          </div>

          {/* Cross-links to related report pages + share in a compact 4-column bar */}
          <AnalysisCrossLinks
            ticker={tickerUpper}
            companyName={companyName}
            description={data?.description}
          />

          {/* Related opportunities — grouped discovery links (same-industry, sector movers, cheaper/similar alternatives) */}
          <RelatedOpportunities ticker={tickerUpper} related={relatedOpps} />

          {/* FAQ — 2-column compact accordion mirrored by FAQPage JSON-LD */}
          <AnalysisFaqSection items={faqItems} ticker={tickerUpper} />

          {/* Latest news — client-side fetch from Finnhub, cached 30min */}
          <NewsSection ticker={tickerUpper} />

          {/* Collapsible Quantitative Summary & SEO text sections — full SSR HTML for Google indexing with zero visual clutter */}
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
            wide
          />

          {!isEtf && (
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
              peersCount={peersCount}
            />
          )}
        </main>
      </div>
    </>
  );
}

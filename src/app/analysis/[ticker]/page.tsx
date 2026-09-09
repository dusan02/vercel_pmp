import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';
import { NewsSection } from '@/components/company/analysis/NewsSection';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { getEarningsForTicker } from '@/lib/seo/earningsSSR';
import ShareButtons from '@/components/ShareButtons';
import { detectSession } from '@/lib/utils/timeUtils';
import { nowET } from '@/lib/utils/dateET';
import { AnalysisHero } from '@/components/company/analysis/sections/AnalysisHero';
import { CompanyOverviewSection } from '@/components/company/analysis/sections/CompanyOverviewSection';
import { HealthScoresSection } from '@/components/company/analysis/sections/HealthScoresSection';
import { MoverInsightSection } from '@/components/company/analysis/sections/MoverInsightSection';
import { AnalystConsensusSection } from '@/components/company/analysis/sections/AnalystConsensusSection';
import { EarningsSection } from '@/components/company/analysis/sections/EarningsSection';
import { RecentMovesSection } from '@/components/company/analysis/sections/RecentMovesSection';
import { RelatedStocksSection } from '@/components/company/analysis/sections/RelatedStocksSection';
import { PmpScoreSection } from '@/components/company/analysis/sections/PmpScoreSection';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

async function getTickerData(symbol: string) {
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
            profitabilityScore: true,
            valuationScore: true,
            verdictText: true,
            piotroskiScore: true,
            altmanZ: true,
            revenueCagr: true,
            netIncomeCagr: true,
            fcfMargin: true,
            debtRepaymentYears: true,
            humanDebtInfo: true,
            humanPeInfo: true,
            marginStability: true,
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
      },
    });
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const tickers = await getEligibleAnalysisTickers();
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

/**
 * Fetch recent significant moves from SessionPrice for the "Recent Market Moves"
 * section. Same logic as /movers/[symbol] — |zScore| >= 2.0, last 30 days.
 */
async function getRecentSignificantMoves(symbol: string) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [positive, negative] = await Promise.all([
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { gte: 2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { lte: -2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
    ]);

    const all = [...positive, ...negative].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
    return all.slice(0, 5);
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
      take: 10,
      select: { symbol: true, name: true },
    });
    return peers;
  } catch {
    return [];
  }
}

/**
 * Last ~30 regular-session closes for the hero sparkline.
 * Light query — only date + lastPrice, no joins.
 */
async function getSparklineCloses(symbol: string): Promise<number[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 45); // buffer so weekends/holidays still yield ~30 points
    const rows = await prisma.sessionPrice.findMany({
      where: { symbol, session: 'live', date: { gte: since }, lastPrice: { gt: 0 } },
      orderBy: { date: 'asc' },
      select: { lastPrice: true },
    });
    return rows.map((r) => r.lastPrice).filter((p): p is number => p != null && p > 0).slice(-30);
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
  const [earningsData, recentMoves, sectorPeers, sparkline] = await Promise.all([
    getEarningsForTicker(tickerUpper),
    getRecentSignificantMoves(tickerUpper),
    getSectorPeers(data?.sector, tickerUpper),
    getSparklineCloses(tickerUpper),
  ]);

  const marketSession = detectSession(nowET());

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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(stockSchema) }} />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" aria-label="Breadcrumb">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-400" aria-hidden="true">/</li>
              <li><Link href="/stocks" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Stocks</Link></li>
              <li className="text-gray-400" aria-hidden="true">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium" aria-current="page">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
            sparkline={sparkline}
          />

          <CompanyOverviewSection
            description={data?.description}
            headquarters={data?.headquarters}
            employees={data?.employees}
            websiteUrl={data?.websiteUrl}
          />

          <HealthScoresSection cache={data?.analysisCache ?? null} />

          {/* Fundamental metrics render client-side in FinancialHealthTable
              (interpreted cards with thresholds + compare column) — the raw SSR
              grid was removed to avoid showing the same numbers twice. */}

          <MoverInsightSection
            ticker={tickerUpper}
            moversReason={data?.moversReason ?? null}
            moversCategory={data?.moversCategory ?? null}
            aiConfidence={data?.aiConfidence ?? null}
            isSbcAlert={data?.isSbcAlert ?? null}
            changePct={data?.lastChangePct ?? null}
          />

          {/* Full interactive analysis — SSR sections above cover the header,
              overview and score summary; this renders controls, compare,
              price chart, interpreted Key Financial Metrics and the chart grid */}
          <AnalysisTabClient ticker={tickerUpper} />

          <AnalystConsensusSection
            priceTarget={data?.finnhubPriceTarget ?? null}
            recommendation={data?.finnhubRecommendation ?? null}
            fallbackPrice={data?.lastPrice ?? null}
          />

          <EarningsSection upcoming={earningsData.upcoming} recent={earningsData.recent} />

          <RecentMovesSection ticker={tickerUpper} moves={recentMoves} />

          {/* Cross-link to valuation and financials pages + share */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 text-sm flex flex-wrap items-center gap-4">
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

          <PmpScoreSection />

          <RelatedStocksSection ticker={tickerUpper} sector={data?.sector} peers={sectorPeers} />

          {/* Latest news — at the very bottom, client-side fetch from Finnhub, cached 30min */}
          <NewsSection ticker={tickerUpper} />
        </main>
      </div>
    </>
  );
}

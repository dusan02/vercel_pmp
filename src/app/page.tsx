import { Suspense } from 'react';
import { Metadata } from 'next';
import HomePage from './HomePage';
import { getStocksData } from '@/services/stockService';
import { getEarningsWeekMap, type EarningsWeekDay } from '@/lib/seo/earningsSSR';
import { getProjectTickers } from '@/data/defaultTickers';
import { getCompanyName } from '@/lib/companyNames';
import { logger } from '@/lib/utils/logger';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import Link from 'next/link';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { prisma } from '@/lib/db/prisma';

const baseUrl = 'https://premarketprice.com';


// NOTE: no searchParams in generateMetadata — reading it makes the route
// dynamic and kills ISR (revalidate=30). High-value tab variants
// (?tab=analysis&ticker=X, ?tab=allStocks) are 301-redirected by middleware
// to canonical URLs, so per-tab metadata here added little SEO value anyway.
export const metadata: Metadata = {
  title: 'Premarket Movers Today — Live Pre-Market Prices | PreMarketPrice',
  description: 'Track live pre-market stock prices, market movers, earnings calendar, and interactive heatmap for 1,000+ US stocks on NYSE and NASDAQ.',
  alternates: { canonical: baseUrl },
  openGraph: {
    title: 'PreMarketPrice — Live Pre-Market Stock Prices & Market Data',
    description: 'Track live pre-market stock prices, market movers, earnings calendar, and interactive heatmap for 1,000+ US stocks on NYSE and NASDAQ.',
    url: baseUrl,
    siteName: 'PreMarketPrice',
    images: [{ url: `${baseUrl}/og-image.png`, width: 1200, height: 630 }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PreMarketPrice — Live Pre-Market Stock Prices',
    description: 'Track live pre-market stock prices for 1,000+ US stocks.',
    images: [`${baseUrl}/og-image.png`],
  },
  robots: { index: true, follow: true },
};

// Enable ISR (Incremental Static Regeneration) for better performance
// Page is cached and regenerated every 30 seconds (was 10s — too aggressive, causes frequent cold SSR)
export const revalidate = 30;

/** Race a promise against a timeout. Returns fallback on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function Page() {
  // Server-side data fetching for initial render (SSR)
  // OPTIMIZATION: Prefetch len top 20 pre mobile (rýchlejšie načítanie)
  // Heatmap má vlastné API, takže stocks API môže byť menší
  const project = 'pmp'; // Default project, could be dynamic based on headers/host
  const topTickers = getProjectTickers(project, 20); // Reduced from 30 to 20 for faster mobile load

  let initialData: any[] = [];
  let initialMoversData: any[] = [];
  let initialBlogSnapshots: any[] = [];
  let initialHeatmapData: any[] = [];
  let weeklyEarningsData: Record<string, EarningsWeekDay> = {};

  // ET dates computed unconditionally — deterministic SSR props for the calendar
  const todayET = getDateET(new Date());
  const todayNoonUTC = new Date(todayET + 'T12:00:00Z');
  const dow = todayNoonUTC.getUTCDay(); // 0=Sun..6=Sat
  const weekStartDate = new Date(todayNoonUTC);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const earningsTodayStr = todayET;
  const earningsWeekStartStr = weekStartDate.toISOString().split('T')[0] ?? todayET;

  try {
    logger.ssr('Fetching initial data for Top 20 tickers, Earnings, Movers, Blog, Heatmap...');

    // Parallel fetch with 3-second timeout — prevents blocking HTML for 10+ seconds
    // when DB is slow (cold connection, revalidation after ISR expiry).
    // Client-side hooks will fetch the data anyway, so empty initial data is safe.
    const SSR_TIMEOUT_MS = 3000;

    const [stocksResult, moversResult, blogResult, heatmapResult, weeklyEarningsResult] = await Promise.allSettled([
      withTimeout(getStocksData(topTickers, project), SSR_TIMEOUT_MS, { data: [], errors: ['SSR timeout'] }),
      // SSR fetch for movers — used by HomeMovers as SWR fallbackData
      withTimeout(
        (async () => {
          const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/stocks/movers?limit=50`, { next: { revalidate: 30 } });
          if (!res.ok) return [];
          const data = await res.json();
          return data.movers || data.rows || data || [];
        })(),
        SSR_TIMEOUT_MS,
        []
      ),
      // SSR fetch for blog snapshots — used by HomeBlog
      withTimeout(
        (async () => {
          const snapshots = await prisma.dailyBlogSnapshot.findMany({
            orderBy: { date: 'desc' },
            take: 10,
          });
          return snapshots;
        })(),
        SSR_TIMEOUT_MS,
        []
      ),
      // SSR fetch for heatmap — eliminates client-side fetch waterfall
      // Fetches compact rows format (same as API) for instant hydration
      withTimeout(
        (async () => {
          const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/heatmap`, { next: { revalidate: 30 } });
          if (!res.ok) return [];
          const data = await res.json();
          return data.rows || data.data || [];
        })(),
        SSR_TIMEOUT_MS,
        []
      ),
      // SSR fetch for weekly earnings — full Mon-Sun week map with EPS/revenue details
      withTimeout(getEarningsWeekMap(earningsWeekStartStr), SSR_TIMEOUT_MS, {}),
    ]);

    if (stocksResult.status === 'fulfilled' && stocksResult.value) {
      const res = stocksResult.value as { data: any[]; errors?: string[] };
      initialData = res.data;
      if (initialData.length > 0) {
        logger.ssr(`Loaded ${initialData.length} stocks`);
      } else {
        logger.ssr('SSR stocks: timeout or empty — client will fetch');
      }
    } else {
      logger.error('SSR Error fetching stocks', stocksResult.status === 'rejected' ? stocksResult.reason : 'unknown');
    }

    if (moversResult.status === 'fulfilled') {
      initialMoversData = moversResult.value as any[];
      if (initialMoversData.length > 0) {
        logger.ssr(`Loaded ${initialMoversData.length} movers`);
      }
    } else {
      logger.error('SSR Error fetching movers', moversResult.reason);
    }

    if (blogResult.status === 'fulfilled') {
      initialBlogSnapshots = blogResult.value as any[];
      if (initialBlogSnapshots.length > 0) {
        logger.ssr(`Loaded ${initialBlogSnapshots.length} blog snapshots`);
      }
    } else {
      logger.error('SSR Error fetching blog snapshots', blogResult.reason);
    }

    if (heatmapResult.status === 'fulfilled') {
      initialHeatmapData = heatmapResult.value as any[];
      if (initialHeatmapData.length > 0) {
        logger.ssr(`Loaded ${initialHeatmapData.length} heatmap rows`);
      }
    } else {
      logger.error('SSR Error fetching heatmap', heatmapResult.reason);
    }

    if (weeklyEarningsResult.status === 'fulfilled') {
      weeklyEarningsData = weeklyEarningsResult.value as Record<string, EarningsWeekDay>;
      const total = Object.values(weeklyEarningsData).reduce((s, d) => s + d.preMarket.length + d.afterMarket.length + d.timeTbd.length, 0);
      if (total > 0) {
        logger.ssr(`Loaded ${total} weekly earnings across ${Object.keys(weeklyEarningsData).length} days`);
      }
    }

  } catch (error) {
    logger.error('SSR Error fetching initial data', error, { project, tickerCount: topTickers.length });
    // Continue with empty initialData - client side will handle fallback
  }

  // All eligible tickers for crawlable internal links (SEO discovery)
  const allTickersForNav = await getEligibleAnalysisTickers();
  // Only include top 50 by hardcoded priority in sr-only nav.
  // Full discovery is handled by /stocks hub page (server-rendered, 700 tickers).
  const topTickersForNav = allTickersForNav.slice(0, 50);
  const eligibleSet = new Set(allTickersForNav);

  return (
    <>
      {/* Server-rendered internal links (helps crawl/discovery even if the main UI is client-heavy) */}
      <nav className="sr-only" aria-label="Primary navigation">
        <Link href="/premarket-movers">Premarket Movers</Link>
        <Link href="/gainers">Top Gainers</Link>
        <Link href="/losers">Top Losers</Link>
        <Link href="/sectors">Sectors</Link>
        <Link href="/screener">All Stocks</Link>
        <Link href="/heatmap">Market Heatmap</Link>
        <Link href="/earnings">Earnings Calendar</Link>
        {/* Top 50 tickers for crawl priority. Remaining 650 are discoverable via /stocks hub. */}
        {topTickersForNav.map((ticker) => (
          <span key={ticker}>
            <Link href={`/analysis/${ticker}`}>
              {getCompanyName(ticker)} ({ticker}) Analysis
            </Link>
          </span>
        ))}
      </nav>
      {/* Hero positioning text — compact, one line */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              Track US Stocks Before the Market Opens
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Real-time pre-market prices, earnings, analysis for 1,000+ NYSE & NASDAQ stocks — no sign-up needed
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/premarket-movers" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Movers →
            </Link>
            <Link href="/heatmap" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Heatmap →
            </Link>
            <Link href="/earnings" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Earnings →
            </Link>
            <Link href="/screener" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Screener →
            </Link>
          </div>
        </div>
      </section>
      <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-950"></div>}>
        <HomePage
          initialData={initialData}
          initialMoversData={initialMoversData}
          initialBlogSnapshots={initialBlogSnapshots}
          initialHeatmapData={initialHeatmapData}
          weeklyEarningsData={weeklyEarningsData}
          earningsTodayStr={earningsTodayStr}
          earningsWeekStartStr={earningsWeekStartStr}
          eligibleTickers={eligibleSet}
        />
      </Suspense>
    </>
  );
}


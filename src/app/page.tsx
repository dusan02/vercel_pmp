import { Suspense } from 'react';
import { Metadata } from 'next';
import HomePage from './HomePage';
import { getStocksData } from '@/services/stockService';
import { getEarningsForDate } from '@/services/earningsService';
import { getEarningsRange } from '@/lib/seo/earningsSSR';
import { getProjectTickers } from '@/data/defaultTickers';
import { getCompanyName } from '@/lib/companyNames';
import { logger } from '@/lib/utils/logger';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import Link from 'next/link';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { WhatMovedToday } from '@/components/home/WhatMovedToday';
import { prisma } from '@/lib/db/prisma';

const baseUrl = 'https://premarketprice.com';

// ─── Per-tab metadata for SEO ──────────────────────────────────────────────
const TAB_META: Record<string, { title: string; description: string; canonical: string }> = {
  movers: {
    title: 'Premarket Movers Today: Top Gainers & Losers (Live) | PreMarketPrice',
    description: 'See which stocks are moving the most in pre-market trading today. Top gainers and losers ranked by % change across NYSE and NASDAQ, updated live before the market opens.',
    canonical: `${baseUrl}/premarket-movers`,
  },
  heatmap: {
    title: 'Stock Market Heatmap — Live Pre-Market % Change by Sector | PreMarketPrice',
    description: 'Interactive market heatmap showing real-time pre-market % change and market cap shifts for 700+ US stocks, organized by sector. Spot trends at a glance.',
    canonical: `${baseUrl}/heatmap`,
  },
  earnings: {
    title: 'Earnings Calendar — Upcoming & Past US Stock Earnings | PreMarketPrice',
    description: 'Track upcoming earnings reports for US companies on NYSE and NASDAQ. Filter by date to see EPS estimates, revenue forecasts, and past earnings results.',
    canonical: `${baseUrl}/earnings`,
  },
  allStocks: {
    title: 'All US Stocks — Real-Time Pre-Market Prices & Market Cap | PreMarketPrice',
    description: 'Browse 700+ US stocks with real-time pre-market prices, % change, market cap, and sector data. Sort and filter by any metric.',
    canonical: `${baseUrl}/stocks`,
  },
  screener: {
    title: 'Stock Screener — Filter by Financial Health & Valuation | PreMarketPrice',
    description: 'Screen 700+ US stocks by financial health score, profitability, valuation, Altman Z-score, and sector. Sort and filter to find the best investment opportunities.',
    canonical: `${baseUrl}/screener`,
  },
  analysis: {
    title: 'Stock Analysis — Technical & Fundamental Data | PreMarketPrice',
    description: 'Deep-dive stock analysis including pre-market price, technical indicators, earnings history, valuation scores, and financial health metrics.',
    canonical: `${baseUrl}/stocks`,
  },
  portfolio: {
    title: 'My Portfolio — Track Your Pre-Market Holdings | PreMarketPrice',
    description: 'Track your personalized portfolio with real-time pre-market prices, % change, and market cap data for your favorite US stocks.',
    canonical: `${baseUrl}/?tab=portfolio`,
  },
  favorites: {
    title: 'My Favorites — Track Your Watchlist | PreMarketPrice',
    description: 'Track your favorite US stocks with real-time pre-market prices and % change.',
    canonical: baseUrl,
  },
  blog: {
    title: 'Daily Market Blog — Pre-Market Analysis & Insights | PreMarketPrice',
    description: 'Daily pre-market analysis, stock movers, earnings recaps, and market insights.',
    canonical: `${baseUrl}/blog`,
  },
};

interface PageProps {
  searchParams: Promise<{ tab?: string; ticker?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const tab = params?.tab;
  const ticker = params?.ticker?.toUpperCase();

  // /?tab=analysis&ticker=MSFT — highest-value SEO pages
  if (tab === 'analysis' && ticker) {
    const companyName = getCompanyName(ticker);
    const title = `${ticker} Stock Price & Analysis — ${companyName} | PreMarketPrice`;
    const description = `${companyName} (${ticker}) stock price, pre-market data, earnings, financial health score, valuation metrics, and analyst estimates. Free real-time stock analysis.`;
    return {
      title,
      description,
      alternates: { canonical: `${baseUrl}/analysis/${ticker}` },
      openGraph: {
        title,
        description,
        url: `${baseUrl}/analysis/${ticker}`,
        siteName: 'PreMarketPrice',
        images: [{ url: `${baseUrl}/og-image.png`, width: 1200, height: 630 }],
        locale: 'en_US',
        type: 'website',
      },
      twitter: { card: 'summary_large_image', title, description, images: [`${baseUrl}/og-image.png`] },
      robots: { index: true, follow: true },
    };
  }

  // Other tabs
  if (tab && TAB_META[tab]) {
    const { title, description, canonical } = TAB_META[tab];
    const isNoIndex = tab === 'portfolio' || tab === 'favorites'; // User-specific content — don't index
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: 'PreMarketPrice',
        images: [{ url: `${baseUrl}/og-image.png`, width: 1200, height: 630 }],
        locale: 'en_US',
        type: 'website',
      },
      twitter: { card: 'summary_large_image', title, description, images: [`${baseUrl}/og-image.png`] },
      robots: isNoIndex ? { index: false, follow: true } : { index: true, follow: true },
    };
  }

  // Default homepage metadata (no tab param)
  return {
    title: 'PreMarketPrice — Real-Time Pre-Market Stock Prices & Market Data',
    description: 'Track real-time pre-market stock prices, market movers, earnings calendar, and interactive heatmap for 300+ US stocks on NYSE and NASDAQ.',
    alternates: { canonical: baseUrl },
    openGraph: {
      title: 'PreMarketPrice — Real-Time Pre-Market Stock Prices & Market Data',
      description: 'Track real-time pre-market stock prices, market movers, earnings calendar, and interactive heatmap for 300+ US stocks on NYSE and NASDAQ.',
      url: baseUrl,
      siteName: 'PreMarketPrice',
      images: [{ url: `${baseUrl}/og-image.png`, width: 1200, height: 630 }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'PreMarketPrice — Real-Time Pre-Market Stock Prices',
      description: 'Track real-time pre-market stock prices for 300+ US stocks.',
      images: [`${baseUrl}/og-image.png`],
    },
    robots: { index: true, follow: true },
  };
}

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
  let initialEarningsData = null;
  let initialMoversData: any[] = [];
  let initialBlogSnapshots: any[] = [];
  let initialHeatmapData: any[] = [];
  let upcomingEarnings: any[] = [];

  try {
    const todayET = getDateET(new Date());

    logger.ssr('Fetching initial data for Top 20 tickers, Earnings, Movers, Blog, Heatmap...');

    // Parallel fetch with 3-second timeout — prevents blocking HTML for 10+ seconds
    // when DB is slow (cold connection, revalidation after ISR expiry).
    // Client-side hooks will fetch the data anyway, so empty initial data is safe.
    const SSR_TIMEOUT_MS = 3000;

    const [stocksResult, earningsResult, moversResult, blogResult, heatmapResult, upcomingEarningsResult] = await Promise.allSettled([
      withTimeout(getStocksData(topTickers, project), SSR_TIMEOUT_MS, { data: [], errors: ['SSR timeout'] }),
      withTimeout(getEarningsForDate(todayET), SSR_TIMEOUT_MS, null),
      // SSR fetch for movers — used by HomeMovers as SWR fallbackData
      withTimeout(
        (async () => {
          const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/stocks/movers?limit=50`);
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
          const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/heatmap`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.rows || data.data || [];
        })(),
        SSR_TIMEOUT_MS,
        []
      ),
      // SSR fetch for upcoming earnings (today + tomorrow) — Next Earnings widget
      withTimeout(
        (async () => {
          const tomorrow = new Date(todayET + 'T12:00:00Z');
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0] ?? '';
          const groups = await getEarningsRange(todayET, tomorrowStr);
          return groups.flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd]).slice(0, 20);
        })(),
        SSR_TIMEOUT_MS,
        []
      ),
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

    if (earningsResult.status === 'fulfilled') {
      initialEarningsData = earningsResult.value;
      if (initialEarningsData) {
        logger.ssr(`Loaded Earnings for ${todayET}`);
      }
    } else {
      logger.error('SSR Error fetching earnings', earningsResult.reason);
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

    if (upcomingEarningsResult.status === 'fulfilled') {
      upcomingEarnings = upcomingEarningsResult.value as any[];
      if (upcomingEarnings.length > 0) {
        logger.ssr(`Loaded ${upcomingEarnings.length} upcoming earnings`);
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
        <Link href="/?tab=movers">Top Gainers</Link>
        <Link href="/?tab=movers">Top Losers</Link>
        <Link href="/sectors">Sectors</Link>
        <Link href="/stocks">All Stocks</Link>
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
      {/* Hero positioning text — visible immediately, improves dwell time + SEO */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Track US Stocks Before the Market Opens
          </h1>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Real-time pre-market prices, earnings calendar, financial health scores, and valuation
            analysis for 700+ NYSE and NASDAQ stocks. See what moved today, track your watchlist,
            and make data-driven decisions — no sign-up needed.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
            <Link href="/premarket-movers" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Premarket Movers →
            </Link>
            <Link href="/heatmap" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Market Heatmap →
            </Link>
            <Link href="/earnings" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Earnings Calendar →
            </Link>
            <Link href="/screener" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Stock Screener →
            </Link>
          </div>
        </div>
      </section>
      {/* Server-rendered "What moved today" — visible immediately, improves dwell time */}
      <WhatMovedToday movers={initialMoversData} eligibleTickers={eligibleSet} />
      <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-950"></div>}>
        <HomePage
          initialData={initialData}
          initialEarningsData={initialEarningsData}
          initialMoversData={initialMoversData}
          initialBlogSnapshots={initialBlogSnapshots}
          initialHeatmapData={initialHeatmapData}
          upcomingEarnings={upcomingEarnings}
        />
      </Suspense>
    </>
  );
}


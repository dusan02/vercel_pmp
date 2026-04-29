import { Suspense } from 'react';
import { Metadata } from 'next';
import HomePage from './HomePage';
import { getStocksData } from '@/lib/server/stockService';
import { getEarningsForDate } from '@/lib/server/earningsService';
import { getProjectTickers } from '@/data/defaultTickers';
import { getCompanyName } from '@/lib/companyNames';
import { logger } from '@/lib/utils/logger';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import Link from 'next/link';

const baseUrl = 'https://premarketprice.com';

// ─── Per-tab metadata for SEO ──────────────────────────────────────────────
const TAB_META: Record<string, { title: string; description: string; canonical: string }> = {
  movers: {
    title: 'Premarket Movers — Top Gainers & Losers | PreMarketPrice',
    description: 'Track the biggest pre-market stock movers today. See top gainers and losers ranked by % change across NYSE and NASDAQ before the market opens.',
    canonical: `${baseUrl}/premarket-movers`,
  },
  heatmap: {
    title: 'Market Heatmap — Real-Time Pre-Market Visualization | PreMarketPrice',
    description: 'Interactive market heatmap showing real-time pre-market % change and market cap shifts for 300+ US stocks, organized by sector.',
    canonical: `${baseUrl}/heatmap`,
  },
  earnings: {
    title: 'Earnings Calendar — Upcoming & Past US Stock Earnings | PreMarketPrice',
    description: 'Track upcoming earnings reports for US companies on NYSE and NASDAQ. Filter by date to see EPS estimates, revenue forecasts, and past earnings results.',
    canonical: `${baseUrl}/earnings`,
  },
  allStocks: {
    title: 'All US Stocks — Real-Time Pre-Market Prices | PreMarketPrice',
    description: 'Browse 300+ US stocks with real-time pre-market prices, % change, market cap, and sector data. Sort and filter by any metric.',
    canonical: `${baseUrl}/stocks`,
  },
  analysis: {
    title: 'Stock Analysis — Technical & Fundamental Data | PreMarketPrice',
    description: 'Deep-dive stock analysis including pre-market price, technical indicators, earnings history, valuation scores, and financial health metrics.',
    canonical: `${baseUrl}/analysis`,
  },
  portfolio: {
    title: 'My Portfolio — Track Your Pre-Market Holdings | PreMarketPrice',
    description: 'Track your personalized portfolio with real-time pre-market prices, % change, and market cap data for your favorite US stocks.',
    canonical: `${baseUrl}/?tab=portfolio`,
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
    const title = `${companyName} (${ticker}) Pre-Market Analysis | PreMarketPrice`;
    const description = `Real-time pre-market price, technical analysis, earnings history, and valuation metrics for ${companyName} (${ticker}). Track ${ticker} before the NYSE/NASDAQ opens.`;
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
    const isNoIndex = tab === 'portfolio'; // User-specific content — don't index
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

  try {
    const todayET = getDateET(new Date());

    logger.ssr('Fetching initial data for Top 20 tickers and Earnings...');

    // Parallel fetch with 3-second timeout — prevents blocking HTML for 10+ seconds
    // when DB is slow (cold connection, revalidation after ISR expiry).
    // Client-side hooks will fetch the data anyway, so empty initial data is safe.
    const SSR_TIMEOUT_MS = 3000;

    const [stocksResult, earningsResult] = await Promise.allSettled([
      withTimeout(getStocksData(topTickers, project), SSR_TIMEOUT_MS, { data: [], errors: ['SSR timeout'] }),
      withTimeout(getEarningsForDate(todayET), SSR_TIMEOUT_MS, null)
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

  } catch (error) {
    logger.error('SSR Error fetching initial data', error, { project, tickerCount: topTickers.length });
    // Continue with empty initialData - client side will handle fallback
  }

  // All tickers for crawlable internal links (SEO discovery)
  const allTickersForNav = getProjectTickers('pmp');

  return (
    <>
      {/* Server-rendered internal links (helps crawl/discovery even if the main UI is client-heavy) */}
      <nav className="sr-only" aria-label="Primary navigation">
        <Link href="/premarket-movers">Premarket Movers</Link>
        <Link href="/gainers">Top Gainers</Link>
        <Link href="/losers">Top Losers</Link>
        <Link href="/sectors">Sectors</Link>
        <Link href="/stocks">All Stocks</Link>
        <Link href="/heatmap">Market Heatmap</Link>
        <Link href="/earnings">Earnings Calendar</Link>
        {/* All analysis + stock pages — help Googlebot discover every ticker */}
        {allTickersForNav.map((ticker) => (
          <span key={ticker}>
            <Link href={`/analysis/${ticker}`}>
              {getCompanyName(ticker)} ({ticker}) Analysis
            </Link>
            <Link href={`/stock/${ticker}`}>
              {getCompanyName(ticker)} ({ticker}) Stock
            </Link>
          </span>
        ))}
      </nav>
      <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-950"></div>}>
        <HomePage initialData={initialData} initialEarningsData={initialEarningsData} />
      </Suspense>
    </>
  );
}


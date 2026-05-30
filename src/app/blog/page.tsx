import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Premarket Reports & Market Insights | PreMarketPrice Blog',
  description: 'Daily premarket reports with top gainers, losers, biggest market cap movers, and earnings calendar. Free stock market analysis updated every trading day.',
  alternates: {
    canonical: 'https://premarketprice.com/blog',
  },
  openGraph: {
    title: 'Premarket Reports & Market Insights | PreMarketPrice',
    description: 'Daily premarket reports with top gainers, losers, biggest market cap movers, and earnings calendar.',
    url: 'https://premarketprice.com/blog',
    type: 'website',
  },
};

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateShort(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface Overview {
  totalStocks: number;
  gainers: number;
  losers: number;
  avgChange: number;
  totalMcapChange: number;
  sentiment: 'Bullish' | 'Bearish' | 'Mixed';
}

export default async function BlogIndexPage() {
  let snapshots: { date: string; overviewJson: string }[] = [];
  try {
    snapshots = await prisma.dailyBlogSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, overviewJson: true },
    });
  } catch {
    snapshots = [];
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-10">
          <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            <Link href="/" className="hover:text-blue-600">Home</Link>
            <span className="mx-2">/</span>
            <span>Blog</span>
          </nav>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Premarket Daily Reports
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Daily premarket analysis — top gainers, losers, market cap movers, and earnings. Updated every trading day before market open.
          </p>
        </div>

        {/* Reports list */}
        {snapshots.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-lg">No reports yet. The first report will be published on the next trading day.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {snapshots.map((snap: { date: string; overviewJson: string }) => {
              const overview: Overview = JSON.parse(snap.overviewJson);
              const sentimentColor =
                overview.sentiment === 'Bullish' ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                overview.sentiment === 'Bearish' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
                'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
              const mcapColor = overview.totalMcapChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';

              return (
                <Link
                  key={snap.date}
                  href={`/blog/${snap.date}`}
                  className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mb-1">{formatDateShort(snap.date)}</p>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        Premarket Report — {formatDate(snap.date)}
                      </h2>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${sentimentColor} shrink-0`}>
                      {overview.sentiment}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-6 text-sm">
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Stocks tracked</span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-white">{overview.totalStocks}</span>
                    </div>
                    <div>
                      <span className="text-green-600 dark:text-green-400 font-medium">▲ {overview.gainers} gainers</span>
                    </div>
                    <div>
                      <span className="text-red-500 dark:text-red-400 font-medium">▼ {overview.losers} losers</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Avg move</span>
                      <span className={`ml-2 font-medium ${overview.avgChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {overview.avgChange >= 0 ? '+' : ''}{overview.avgChange.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">Market cap Δ</span>
                      <span className={`ml-2 font-medium ${mcapColor}`}>
                        {overview.totalMcapChange >= 0 ? '+' : ''}${overview.totalMcapChange.toFixed(0)}B
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* SEO content */}
        <div className="mt-12 prose prose-gray dark:prose-invert max-w-none text-sm text-gray-500 dark:text-gray-400">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">About Premarket Reports</h2>
          <p>
            Every trading day, PreMarketPrice publishes a free daily premarket report covering the S&P 500 and Nasdaq-100 universe.
            Reports include top gainers and losers by percentage change, biggest market cap movers in billions of dollars,
            earnings releases for the day, and an overall market sentiment summary. Data is sourced from real-time market feeds
            and updated before the US market opens at 9:30 AM ET.
          </p>
        </div>

      </div>
    </main>
  );
}

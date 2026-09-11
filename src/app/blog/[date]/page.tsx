import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 3600;

interface TickerSnapshot {
  ticker: string;
  name: string | null;
  price: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
}

interface EarningsItem {
  ticker: string;
  name: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  hour: string;
}

interface Overview {
  totalStocks: number;
  gainers: number;
  losers: number;
  avgChange: number;
  totalMcapChange: number;
  sentiment: 'Bullish' | 'Bearish' | 'Mixed';
  type?: string;
  title?: string;
  summary?: string;
  totalEarnings?: number;
}

function isWeeklyDate(dateStr: string): boolean {
  return dateStr.startsWith('weekly-');
}

function extractDateFromWeekly(dateStr: string): string {
  return dateStr.replace('weekly-', '');
}

function parseLocalDate(dateStr: string): Date {
  const cleanDate = isWeeklyDate(dateStr) ? extractDateFromWeekly(dateStr) : dateStr;
  const parts = cleanDate.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDateLong(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  const snapshot = await prisma.dailyBlogSnapshot.findUnique({ where: { date } });
  if (!snapshot) return { title: 'Report Not Found | PreMarketPrice' };

  const overview: Overview = JSON.parse(snapshot.overviewJson);
  const isWeekly = isWeeklyDate(date);

  if (isWeekly) {
    const title = overview.title || `Earnings This Week — ${date} | PreMarketPrice`;
    const description = overview.summary || `Weekly earnings report for ${formatDateLong(date)}.`;
    return {
      title,
      description,
      alternates: { canonical: `https://premarketprice.com/blog/${date}` },
      openGraph: {
        title,
        description,
        url: `https://premarketprice.com/blog/${date}`,
        type: 'article',
        publishedTime: new Date(extractDateFromWeekly(date)).toISOString(),
      },
    };
  }

  const gainers: TickerSnapshot[] = JSON.parse(snapshot.gainersJson);
  const top3 = gainers.slice(0, 3).map(g => `${g.ticker} ${g.percentChange > 0 ? '+' : ''}${g.percentChange.toFixed(1)}%`).join(', ');

  const title = `Premarket Report ${formatDateLong(date)} | PreMarketPrice`;
  const description = `${overview.sentiment} market: ${overview.gainers} gainers, ${overview.losers} losers. Top movers: ${top3}. Total market cap change: ${overview.totalMcapChange >= 0 ? '+' : ''}$${overview.totalMcapChange.toFixed(0)}B.`;

  return {
    title,
    description,
    alternates: { canonical: `https://premarketprice.com/blog/${date}` },
    openGraph: {
      title,
      description,
      url: `https://premarketprice.com/blog/${date}`,
      type: 'article',
      publishedTime: new Date(date).toISOString(),
    },
  };
}

export async function generateStaticParams() {
  try {
    const snapshots = await prisma.dailyBlogSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 60,
      select: { date: true },
    });
    return snapshots.map(s => ({ date: s.date }));
  } catch {
    return [];
  }
}

function ChangeTag({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span className={`font-semibold ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
      {positive ? '+' : ''}{value.toFixed(2)}{suffix}
    </span>
  );
}

function TickerRow({ stock, rank }: { stock: TickerSnapshot; rank: number }) {
  return (
    <Link
      href={`/analysis/${stock.ticker}`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
    >
      <span className="w-6 text-center text-sm text-gray-400 font-mono">{rank}</span>
      <div className="flex-1 min-w-0">
        <span className="font-bold text-blue-600 dark:text-blue-400 group-hover:underline">{stock.ticker}</span>
        {stock.name && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400 truncate">{stock.name}</span>}
      </div>
      <div className="text-right shrink-0">
        <div><ChangeTag value={stock.percentChange} /></div>
        <div className="text-xs text-gray-400">${stock.price.toFixed(2)}</div>
      </div>
      <div className="text-right shrink-0 w-20 hidden sm:block">
        <div className="text-xs text-gray-400">MCap Δ</div>
        <ChangeTag value={stock.marketCapDiff} suffix="B" />
      </div>
    </Link>
  );
}

export default async function BlogDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  // Allow both YYYY-MM-DD and weekly-YYYY-MM-DD
  const cleanDate = isWeeklyDate(date) ? extractDateFromWeekly(date) : date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) notFound();

  const snapshot = await prisma.dailyBlogSnapshot.findUnique({ where: { date } });
  if (!snapshot) notFound();

  const overview: Overview = JSON.parse(snapshot.overviewJson);
  const gainers: TickerSnapshot[] = JSON.parse(snapshot.gainersJson);
  const losers: TickerSnapshot[] = JSON.parse(snapshot.losersJson);
  const mcapMovers: TickerSnapshot[] = JSON.parse(snapshot.mcapMoversJson);
  const earnings: EarningsItem[] = JSON.parse(snapshot.earningsJson);
  const isWeekly = isWeeklyDate(date) || overview.type === 'weekly-earnings';

  // Parse weekly earnings breakdown if applicable
  let weeklyBreakdown: Array<{ date: string; total: number; preMarket: number; afterMarket: number; timeTbd: number; notable: Array<{ ticker: string; companyName: string | null; time: string; epsEstimate: number | null }> }> = [];
  if (isWeekly) {
    try {
      const parsed = JSON.parse(snapshot.earningsJson);
      weeklyBreakdown = parsed.dayBreakdown || [];
    } catch { /* ignore */ }
  }

  const sentimentColor =
    overview.sentiment === 'Bullish' ? 'text-green-600 dark:text-green-400' :
    overview.sentiment === 'Bearish' ? 'text-red-500 dark:text-red-400' :
    'text-yellow-600 dark:text-yellow-400';
  const sentimentBg =
    overview.sentiment === 'Bullish' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
    overview.sentiment === 'Bearish' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
    'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: isWeekly ? (overview.title || `Earnings This Week — ${formatDateLong(date)}`) : `Premarket Report ${formatDateLong(date)}`,
    description: isWeekly ? (overview.summary || '') : `${overview.sentiment} premarket session. ${overview.gainers} gainers, ${overview.losers} losers out of ${overview.totalStocks} tracked stocks.`,
    datePublished: new Date(isWeekly ? extractDateFromWeekly(date) : date).toISOString(),
    publisher: { '@type': 'Organization', name: 'PreMarketPrice', url: 'https://premarketprice.com' },
    url: `https://premarketprice.com/blog/${date}`,
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-blue-600">Blog</Link>
          <span className="mx-2">/</span>
          <span>{date}</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {isWeekly ? (overview.title || `Earnings This Week — ${formatDateLong(date)}`) : `Premarket Report — ${formatDateLong(date)}`}
            </h1>
            {isWeekly ? (
              <span className="text-sm font-semibold px-3 py-1 rounded-full border text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                Weekly Earnings
              </span>
            ) : (
              <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${sentimentColor} ${sentimentBg}`}>
                {overview.sentiment}
              </span>
            )}
          </div>
          {isWeekly && overview.summary && (
            <p className="text-gray-600 dark:text-gray-400 text-base">{overview.summary}</p>
          )}
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Published by PreMarketPrice · Data from Polygon.io & Finnhub
          </p>
        </div>

        {/* Weekly earnings breakdown */}
        {isWeekly && weeklyBreakdown.length > 0 && (
          <section className="mb-8 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Earnings by Day</h2>
            <div className="space-y-4">
              {weeklyBreakdown.map((day) => (
                <div key={day.date} className="border-l-4 border-blue-400 dark:border-blue-600 pl-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Link href={`/earnings/date/${day.date}`} className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                      {formatDateLong(day.date)}
                    </Link>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {day.total} reports
                      {day.preMarket > 0 && ` · ${day.preMarket} pre-market`}
                      {day.afterMarket > 0 && ` · ${day.afterMarket} after-hours`}
                    </span>
                  </div>
                  {day.notable.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {day.notable.map((n) => (
                        <Link
                          key={`${day.date}-${n.ticker}`}
                          href={`/analysis/${n.ticker}`}
                          className="inline-flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{n.ticker}</span>
                          {n.epsEstimate != null && (
                            <span className="text-gray-500 dark:text-gray-400 text-xs">EPS ${n.epsEstimate.toFixed(2)}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Market Overview — daily posts only */}
        {!isWeekly && (
        <section className="mb-8 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📈 Market Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{overview.totalStocks}</div>
              <div className="text-xs text-gray-400 mt-1">Stocks Tracked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{overview.gainers}</div>
              <div className="text-xs text-gray-400 mt-1">Gainers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500 dark:text-red-400">{overview.losers}</div>
              <div className="text-xs text-gray-400 mt-1">Losers</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${overview.avgChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {overview.avgChange >= 0 ? '+' : ''}{overview.avgChange.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">Avg. Change</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Total Market Cap Change: </span>
            <span className={`font-semibold ${overview.totalMcapChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {overview.totalMcapChange >= 0 ? '+' : ''}${overview.totalMcapChange.toFixed(0)}B
            </span>
          </div>
        </section>
        )}

        {/* Top Gainers — daily posts only */}
        {!isWeekly && gainers.length > 0 && (
          <section className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">🚀 Top Gainers</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {gainers.slice(0, 10).map((s, i) => <TickerRow key={s.ticker} stock={s} rank={i + 1} />)}
            </div>
          </section>
        )}

        {/* Top Losers — daily posts only */}
        {!isWeekly && losers.length > 0 && (
          <section className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">📉 Top Losers</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {losers.slice(0, 10).map((s, i) => <TickerRow key={s.ticker} stock={s} rank={i + 1} />)}
            </div>
          </section>
        )}

        {/* Biggest Market Cap Movers — daily posts only */}
        {!isWeekly && mcapMovers.length > 0 && (
          <section className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">💰 Biggest Market Cap Movers</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {mcapMovers.slice(0, 10).map((s, i) => <TickerRow key={s.ticker} stock={s} rank={i + 1} />)}
            </div>
          </section>
        )}

        {/* Earnings This Day — daily posts only */}
        {!isWeekly && earnings.length > 0 && (
          <section className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">📅 Earnings This Day</h2>
            <div className="space-y-2">
              {earnings.map(e => (
                <Link
                  key={e.ticker}
                  href={`/analysis/${e.ticker}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div>
                    <span className="font-bold text-blue-600 dark:text-blue-400 group-hover:underline">{e.ticker}</span>
                    {e.name && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{e.name}</span>}
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-gray-400">{e.hour === 'bmo' ? 'Before Open' : e.hour === 'amc' ? 'After Close' : 'During Market'}</span>
                    {e.epsEstimate !== null && (
                      <span className="ml-3 text-gray-600 dark:text-gray-300">EPS est. ${e.epsEstimate.toFixed(2)}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Navigation */}
        <div className="mt-8 flex justify-between items-center">
          <Link href="/blog" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            ← All Reports
          </Link>
          <Link href="/heatmap" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            View Live Heatmap →
          </Link>
        </div>

      </div>
    </main>
  );
}

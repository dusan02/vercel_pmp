import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';
import { getEarningsRange, getEarningsDateCounts, type EarningsSSRGroup } from '@/lib/seo/earningsSSR';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';
import { getSessionDateStr } from '@/lib/utils/timeUtils';
import { toJsonLd } from '@/lib/seo/jsonLd';
import { EarningsTable, FeaturedEarningsCard } from '@/components/earnings/EarningsShared';
import EarningsDayExplorer from '@/components/earnings/EarningsDayExplorer';

const baseUrl = 'https://premarketprice.com';

export const revalidate = 300; // 5 min - SSR earnings content

export const metadata: Metadata = generatePageMetadata({
  title: 'Earnings Calendar — Today & Upcoming',
  description: 'Track today\'s earnings calendar and upcoming earnings reports for US companies. Get real-time earnings announcements, EPS estimates, and revenue forecasts. Browse by date with our interactive calendar.',
  path: '/earnings',
  keywords: [
    'earnings calendar',
    'earnings reports',
    'earnings announcements',
    'EPS',
    'earnings per share',
    'quarterly earnings',
    'earnings date',
    'earnings schedule',
  ],
});

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function EarningsDaySection({ group, eligible }: { group: EarningsSSRGroup; eligible: Set<string> }) {
  if (group.total === 0) return null;
  const allRows = [...group.preMarket, ...group.afterMarket, ...group.timeTbd];

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
        <Link href={`/earnings/date/${group.date}`} className="hover:underline">
          {formatDateDisplay(group.date)}
        </Link>
        <span className="ml-2 text-sm font-normal text-slate-500">{group.total} earnings</span>
      </h3>
      <EarningsTable rows={allRows} eligible={eligible} />
    </div>
  );
}

export default async function EarningsPage() {
  // SSR: fetch earnings for the current trading day + next 7 days.
  // Earnings only exist on trading days — on weekends/holidays the
  // calendar must open on the most recent session (Friday), not an
  // empty weekend cell.
  const tradingDayStr = getSessionDateStr();
  const tradingDayNoonUTC = new Date(tradingDayStr + 'T12:00:00Z');
  const end = new Date(tradingDayNoonUTC);
  end.setUTCDate(end.getUTCDate() + 7);
  const endStr = end.toISOString().split('T')[0] ?? '';

  // Parallel SSR fetch: DB earnings + date counts for the calendar rail.
  // Direct DB call — no HTTP self-fetch (was 127.0.0.1:PORT roundtrip with
  // a 3s timeout budget added to every revalidation).
  const [groups, dateCountsData, eligibleSet] = await Promise.all([
    getEarningsRange(tradingDayStr, endStr, { enrich: true }),
    getEarningsDateCounts(),
    getEligibleAnalysisSet(),
  ]);
  const todayRows = groups[0]?.date === tradingDayStr
    ? [...groups[0].preMarket, ...groups[0].afterMarket, ...groups[0].timeTbd]
    : [];
  const totalEarnings = groups.reduce((sum, g) => sum + g.total, 0);
  const reportedCount = groups.reduce(
    (sum, g) => sum + [...g.preMarket, ...g.afterMarket, ...g.timeTbd].filter((r) => r.hasReported).length,
    0,
  );
  const upcomingCount = totalEarnings - reportedCount;

  // Find notable earnings (with EPS estimates)
  const allRows = groups.flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd]);
  const withEstimates = allRows.filter((r) => r.epsEstimate != null);
  const featuredPool = withEstimates.length > 0 ? withEstimates : allRows;
  const featured = [...featuredPool]
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
    .slice(0, 3);

  // ItemList of the largest upcoming reports — only eligible tickers (they have live /analysis pages)
  const earningsItemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Upcoming earnings — week of ${tradingDayStr}`,
    numberOfItems: Math.min(allRows.filter((r) => eligibleSet.has(r.ticker)).length, 15),
    itemListElement: allRows
      .filter((r) => eligibleSet.has(r.ticker))
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 15)
      .map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${r.companyName ?? r.ticker} (${r.ticker}) earnings — ${r.date}`,
        url: `${baseUrl}/analysis/${r.ticker}`,
      })),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(earningsItemList) }} />
      {/* Breadcrumbs */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Home</Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Earnings Calendar</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Earnings Calendar</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Track today's earnings announcements and upcoming earnings reports
          </p>
          {totalEarnings > 0 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {totalEarnings} earnings scheduled in the next 7 days — {upcomingCount} upcoming, {reportedCount} already reported.
              {withEstimates.length > 0 && ` ${withEstimates.length} with EPS estimates.`}
            </p>
          )}
        </div>

        {/* ET-style explorer: month calendar rail + compact day table */}
        <EarningsDayExplorer
          initialDate={tradingDayStr}
          initialRows={todayRows}
          dateCounts={dateCountsData}
          eligibleTickers={eligibleSet}
        />

        {/* Featured earnings — largest reports this week */}
        {featured.length > 0 && (featured[0]?.marketCap ?? 0) >= 1e9 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              Featured earnings this week
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {featured.map((r) => (
                <FeaturedEarningsCard key={`feat-${r.ticker}-${r.date}`} row={r} eligible={eligibleSet} />
              ))}
            </div>
          </section>
        )}

        {/* SSR earnings content - indexable by Google */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Earnings This Week — Detailed Schedule
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
            Earnings announcements for tracked US stocks including EPS estimates, actual results, and revenue expectations.
            Pre-market (BMO) earnings are reported before 9:30 AM ET; after-hours (AMC) earnings are reported after 4:00 PM ET.
          </p>

          {groups.map((g) => <EarningsDaySection key={g.date} group={g} eligible={eligibleSet} />)}

          {totalEarnings === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
              No earnings scheduled in the next 7 days. Check back later or browse{' '}
              <Link href="/screener" className="text-blue-600 dark:text-blue-400 hover:underline">all tracked stocks</Link>.
            </div>
          )}
        </section>

        {/* SEO content */}
        <section className="mt-10 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">
            Understanding Earnings Reports
          </h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Earnings reports are quarterly financial statements publicly traded companies must file with the SEC.
              They include key metrics like earnings per share (EPS), revenue, and forward guidance.
              Pre-market earnings (BMO) are released before the market opens at 9:30 AM ET, while after-hours earnings (AMC)
              are released after the market closes at 4:00 PM ET.
            </p>
            <p>
              EPS surprise measures the difference between actual and estimated earnings per share, expressed as a percentage.
              A positive surprise typically leads to short-term price increases, while a negative surprise can trigger sell-offs.
              Use the{' '}
              <Link href="/screener" className="text-blue-600 dark:text-blue-400 hover:underline">stock screener</Link>{' '}
              to filter stocks by quality metrics like Piotroski F-Score and Beneish M-Score, or explore{' '}
              <Link href="/premarket-movers" className="text-blue-600 dark:text-blue-400 hover:underline">pre-market movers</Link>{' '}
              to see how earnings impact pre-market trading.
            </p>
          </div>
        </section>

        {/* Internal linking */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/screener" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Stock Screener</Link>
            <Link href="/premarket-movers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Pre-Market Movers</Link>
            <Link href="/gainers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Top Gainers</Link>
            <Link href="/losers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Top Losers</Link>
            <Link href="/heatmap" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Market Heatmap</Link>
            <Link href="/screener" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">All Stocks</Link>
          </div>
        </nav>
      </main>

      {/* Structured Data */}
      <StructuredData
        pageType="earnings"
        breadcrumbs={[
          { name: 'Home', url: baseUrl },
          { name: 'Earnings Calendar', url: `${baseUrl}/earnings` },
        ]}
      />
    </div>
  );
}

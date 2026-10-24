import { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getHeatmapData } from '@/lib/heatmap/heatmapService';
import type { HeatmapPayloadRow } from '@/lib/heatmap/heatmapTransformer';
import { getEarningsRange } from '@/lib/seo/earningsSSR';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';
import { detectSession, getSessionDateStr } from '@/lib/utils/timeUtils';
import { formatPercent, formatPrice, formatMarketCap } from '@/lib/utils/heatmapFormat';
import { shortName } from '@/lib/seo/metadata';
import { toJsonLd } from '@/lib/seo/jsonLd';

const baseUrl = 'https://premarketprice.com';

// Brief is a live read of the shared heatmap pipeline — re-render every
// minute; the payload itself is Redis-cached with its own rebuild window.
export const revalidate = 60;

export const metadata: Metadata = generatePageMetadata({
  title: 'Market Brief: Overnight Movers & Earnings',
  description:
    'Your 60-second market brief: overnight and pre-market movers, sector performance, market breadth, and today\'s earnings — everything you need before the open.',
  path: '/brief',
  keywords: [
    'market brief',
    'morning market brief',
    'overnight movers',
    'premarket movers today',
    'market briefing',
    'stock market today',
    'premarket summary',
  ],
});

const SESSION_LABEL: Record<string, string> = {
  pre: 'Pre-market session — prices are moving before the open',
  live: 'Live — regular session in progress',
  after: 'After-hours session',
  closed: 'Market closed — showing the last session',
};

const SESSION_PILL: Record<string, { label: string; cls: string; dot: string }> = {
  pre:    { label: 'PRE-MARKET',  cls: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',   dot: 'bg-amber-500' },
  live:   { label: 'LIVE',        cls: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/50', dot: 'bg-green-500' },
  after:  { label: 'AFTER-HOURS', cls: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/50', dot: 'bg-violet-500' },
  closed: { label: 'CLOSED',      cls: 'bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-700',          dot: 'bg-gray-400' },
};

function MoverRow({ r, eligible }: { r: HeatmapPayloadRow; eligible: Set<string> }) {
  const up = r.percentChange >= 0;
  const body = (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-slate-900 dark:text-slate-100 flex-shrink-0">{r.ticker}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline">{shortName(r.companyName)}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-sm">
        <span className="text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline">{formatPrice(r.currentPrice)}</span>
        <span className={`font-semibold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {formatPercent(r.percentChange)}
        </span>
      </div>
    </div>
  );
  return eligible.has(r.ticker)
    ? <Link href={`/analysis/${r.ticker}`}>{body}</Link>
    : body;
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string | undefined; tone?: 'up' | 'down' | undefined }) {
  const cls = tone === 'up'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'down'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

export default async function BriefPage() {
  const session = detectSession();
  const todayStr = getSessionDateStr();
  const dateLabel = new Date(todayStr + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [heatmap, earningsGroups, eligible] = await Promise.all([
    getHeatmapData(),
    getEarningsRange(todayStr, todayStr).catch(() => []),
    getEligibleAnalysisSet().catch(() => new Set<string>()),
  ]);

  const rows: HeatmapPayloadRow[] = heatmap.ok
    ? (heatmap.payload as HeatmapPayloadRow[]).filter((r) => r.currentPrice > 0 && r.marketCap > 0)
    : [];
  const notable = rows.filter((r) => r.marketCap >= 0.5); // ≥$500M — skip micro-cap noise

  // --- Breadth -----------------------------------------------------------
  const advancers = rows.filter((r) => r.percentChange > 0.05).length;
  const decliners = rows.filter((r) => r.percentChange < -0.05).length;
  const unchanged = rows.length - advancers - decliners;
  const gapUp = rows.filter((r) => r.percentChange >= 5).length;
  const gapDown = rows.filter((r) => r.percentChange <= -5).length;
  const mcapSum = rows.reduce((s, r) => s + r.marketCap, 0);
  const weightedAvg = mcapSum > 0
    ? rows.reduce((s, r) => s + r.percentChange * r.marketCap, 0) / mcapSum
    : 0;

  // --- Sectors: mcap-weighted avg + breadth ------------------------------
  const sectorAgg = new Map<string, { wSum: number; mSum: number; up: number; down: number; n: number }>();
  for (const r of rows) {
    const s = sectorAgg.get(r.sector) ?? { wSum: 0, mSum: 0, up: 0, down: 0, n: 0 };
    s.wSum += r.percentChange * r.marketCap;
    s.mSum += r.marketCap;
    if (r.percentChange > 0.05) s.up++;
    else if (r.percentChange < -0.05) s.down++;
    s.n++;
    sectorAgg.set(r.sector, s);
  }
  const sectors = [...sectorAgg.entries()]
    .map(([name, s]) => ({ name, avg: s.mSum > 0 ? s.wSum / s.mSum : 0, up: s.up, down: s.down, n: s.n }))
    .sort((a, b) => b.avg - a.avg);
  const maxAbsSector = Math.max(1, ...sectors.map((s) => Math.abs(s.avg)));

  // --- Top movers ---------------------------------------------------------
  const pick = (pool: HeatmapPayloadRow[], n: number, dir: 'up' | 'down') =>
    [...pool]
      .sort((a, b) => (dir === 'up' ? b.percentChange - a.percentChange : a.percentChange - b.percentChange))
      .slice(0, n);
  const gainers = pick(notable.length >= 8 ? notable : rows, 8, 'up')
    .filter((r) => r.percentChange > 0.05);
  const losers = pick(notable.length >= 8 ? notable : rows, 8, 'down')
    .filter((r) => r.percentChange < -0.05);

  // --- Earnings today -----------------------------------------------------
  const todayGroup = earningsGroups.find((g) => g.date === todayStr);
  const bmo = todayGroup?.preMarket ?? [];
  const amc = todayGroup?.afterMarket ?? [];
  const tbd = todayGroup?.timeTbd ?? [];

  const pill = SESSION_PILL[session] ?? SESSION_PILL.closed!;

  const moversItemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Market brief movers — ${todayStr}`,
    numberOfItems: gainers.length + losers.length,
    itemListElement: [...gainers, ...losers]
      .filter((r) => eligible.has(r.ticker))
      .map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${r.companyName} (${r.ticker})`,
        url: `${baseUrl}/analysis/${r.ticker}`,
      })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Market Brief', item: `${baseUrl}/brief` },
    ],
  };

  const breadthTone = weightedAvg > 0.05 ? 'up' : weightedAvg < -0.05 ? 'down' : undefined;
  const breadthWord = weightedAvg > 0.05 ? 'positive' : weightedAvg < -0.05 ? 'negative' : 'flat';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(moversItemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbLd) }} />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Market Brief — {dateLabel}
          </h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${pill.cls}`}>
            <span className={`inline-flex rounded-full h-1.5 w-1.5 ${pill.dot}`} />
            {pill.label}
          </span>
        </div>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          {rows.length > 0
            ? `${SESSION_LABEL[session]}. Market breadth is ${breadthWord}: ${advancers} advancing vs ${decliners} declining of ${rows.length} tracked stocks.`
            : `${SESSION_LABEL[session]}. Market data is loading — check back in a moment.`}
        </p>
      </div>

      {/* Breadth strip */}
      <section aria-label="Market breadth" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <StatCard label="Weighted avg" value={formatPercent(weightedAvg)} sub="cap-weighted move" tone={breadthTone} />
        <StatCard label="Advancing" value={String(advancers)} tone="up" sub={`of ${rows.length} stocks`} />
        <StatCard label="Declining" value={String(decliners)} tone="down" sub={`${unchanged} flat`} />
        <StatCard label="Gappers +5%" value={String(gapUp)} tone="up" sub="moving ≥5%" />
        <StatCard label="Gappers −5%" value={String(gapDown)} tone="down" sub="moving ≤−5%" />
        <StatCard
          label="Biggest mover"
          value={gainers[0] ? `${gainers[0].ticker} ${formatPercent(gainers[0].percentChange)}` : '—'}
          tone="up"
          sub={gainers[0] ? formatMarketCap(gainers[0].marketCap) : undefined}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sector board */}
        <section className="lg:col-span-1" aria-label="Sector performance">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sectors</h2>
            <Link href="/sectors" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">All sectors</Link>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {sectors.map((s) => (
              <Link key={s.name} href={`/sectors/${encodeURIComponent(s.name)}`} className="block px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                  <span className={`flex-shrink-0 font-semibold tabular-nums ${s.avg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatPercent(s.avg)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                    <div
                      className={`${s.avg >= 0 ? 'bg-emerald-500 ml-auto' : 'bg-rose-500'} h-full`}
                      style={{ width: `${Math.min(100, (Math.abs(s.avg) / maxAbsSector) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                    {s.up}↑ {s.down}↓
                  </span>
                </div>
              </Link>
            ))}
            {sectors.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">No market data available right now.</div>
            )}
          </div>
        </section>

        {/* Movers + earnings */}
        <div className="lg:col-span-2 space-y-8">
          <section aria-label="Top movers" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="flex items-baseline justify-between px-2 mb-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Top gainers</h2>
                <Link href="/gainers" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">All</Link>
              </div>
              {gainers.map((r) => <MoverRow key={r.ticker} r={r} eligible={eligible} />)}
              {gainers.length === 0 && <div className="px-2 py-4 text-sm text-slate-500">No notable gainers.</div>}
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="flex items-baseline justify-between px-2 mb-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Top losers</h2>
                <Link href="/losers" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">All</Link>
              </div>
              {losers.map((r) => <MoverRow key={r.ticker} r={r} eligible={eligible} />)}
              {losers.length === 0 && <div className="px-2 py-4 text-sm text-slate-500">No notable losers.</div>}
            </div>
          </section>

          {/* Earnings today */}
          <section aria-label="Earnings today" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Earnings today</h2>
              <Link href={`/earnings/date/${todayStr}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Full day</Link>
            </div>
            {(bmo.length + amc.length + tbd.length) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No earnings scheduled today. See the <Link href="/earnings" className="text-blue-600 dark:text-blue-400 hover:underline">earnings calendar</Link>.
              </p>
            ) : (
              <div className="space-y-3">
                {[
                  { label: 'Before open', rows: bmo },
                  { label: 'After close', rows: amc },
                  { label: 'Time TBD', rows: tbd },
                ].map(({ label, rows: list }) => list.length > 0 && (
                  <div key={label}>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5">{label} · {list.length}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.slice(0, 30).map((r) => eligible.has(r.ticker) ? (
                        <Link
                          key={r.ticker}
                          href={`/analysis/${r.ticker}`}
                          title={r.companyName}
                          className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {r.ticker}
                        </Link>
                      ) : (
                        <span key={r.ticker} title={r.companyName} className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                          {r.ticker}
                        </span>
                      ))}
                      {list.length > 30 && (
                        <Link href={`/earnings/date/${todayStr}`} className="px-2.5 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          +{list.length - 30} more
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Internal links */}
          <nav className="pt-2 border-t border-slate-200 dark:border-slate-800" aria-label="Explore more">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore more</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/heatmap" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Market Heatmap</Link>
              <Link href="/premarket-movers" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Pre-Market Movers</Link>
              <Link href="/unusual-volume" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Unusual Volume</Link>
              <Link href="/screener" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Stock Screener</Link>
              <Link href="/earnings" className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Earnings Calendar</Link>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}

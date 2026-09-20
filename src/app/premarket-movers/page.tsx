import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { SsrMoverLinksCombined } from '@/components/seo/SsrMoverLinks';
import { getPremarketDateSummaries } from '@/lib/seo/premarketArchive';
import { getEligibleAnalysisSet } from '@/lib/seo/eligibleTickers';
import { prisma } from '@/lib/db/prisma';
import { NotificationToggle } from '@/components/notifications/NotificationToggle';
import { getMoversData, type MoverRecord } from '@/services/movers/getMovers';
import { SIGMA_LABELS, type SigmaLevel } from '@/services/movers/classify';

export const revalidate = 60;

/**
 * Shared per-request mover fetch — generateMetadata and the page render both
 * use this so the title snippet and the table come from ONE pipeline call.
 */
const getMovers = cache(() => getMoversData(50, 2.0));

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getTodayShort(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function generateMetadata(): Promise<Metadata> {
  const today = getTodayFormatted();
  let moversSnippet = '';
  try {
    const { movers } = await getMovers();
    const gainers = movers.filter(m => (m.lastChangePct ?? 0) > 0);
    const losers = movers.filter(m => (m.lastChangePct ?? 0) < 0);
    const parts: string[] = [];
    if (gainers[0]) parts.push(`${gainers[0].symbol} +${gainers[0].lastChangePct.toFixed(1)}%`);
    if (losers[0]) parts.push(`${losers[0].symbol} ${losers[0].lastChangePct.toFixed(1)}%`);
    if (parts.length > 0) moversSnippet = `: ${parts.join(', ')}`;
  } catch {
    // Data unavailable at build/render — fall back to static title
  }
  return generatePageMetadata({
    title: `Premarket Movers Today${moversSnippet} (${getTodayShort()})`,
    description:
      `Biggest pre-market stock movers for ${today} — top gainers and losers ranked by % change with Z-scores, catalysts and momentum insights. Real-time data from NYSE & NASDAQ.`,
    path: '/premarket-movers',
    keywords: ['premarket movers', 'stocks moving today', 'premarket gainers and losers', 'stock movers today', 'biggest stock movers premarket', 'stocks moving premarket'],
    languages: {
      en: '/premarket-movers',
      'zh-CN': '/zh/premarket-movers',
      'x-default': '/premarket-movers',
    },
  });
}

const SIGMA_BADGE: Record<SigmaLevel, string> = {
  extreme: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  very_unusual: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  unusual: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  normal: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

function CatalystCell({ mover }: { mover: MoverRecord }) {
  const a = mover.analysis;
  if (!a) {
    // Degraded path: LLM prose from the worker pipeline
    return mover.moversReason ? (
      <div className="text-xs text-slate-600 dark:text-slate-400 max-w-[260px]">
        <span className="font-bold opacity-50 mr-1">{mover.moversCategory}:</span>
        {mover.moversReason}
      </div>
    ) : (
      <span className="text-xs text-slate-400 italic">Analyzing…</span>
    );
  }
  const ev = a.catalyst.evidence.find(e => e.url);
  return (
    <div className="text-xs max-w-[260px]">
      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
        {a.catalyst.status === 'found' && (
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[a.catalyst.confidence]}`} title={`${a.catalyst.confidence} confidence`} />
        )}
        <span className="font-medium">{a.catalyst.status === 'found' ? a.catalyst.label : 'No clear catalyst detected'}</span>
        {ev?.url && (
          <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline shrink-0">[src]</a>
        )}
      </div>
      {(a.sectorChangePct !== null || a.marketChangePct !== null) && (
        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
          {a.sectorChangePct !== null && `Sector ${a.sectorChangePct >= 0 ? '+' : ''}${a.sectorChangePct.toFixed(1)}%`}
          {a.sectorChangePct !== null && a.marketChangePct !== null && ' · '}
          {a.marketChangePct !== null && `Mkt ${a.marketChangePct >= 0 ? '+' : ''}${a.marketChangePct.toFixed(1)}%`}
          {a.excessMovePct !== null && ` · Excess ${a.excessMovePct >= 0 ? '+' : ''}${a.excessMovePct.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
}

function PillarCell({ mover }: { mover: MoverRecord }) {
  const p = mover.analysis?.pillars;
  if (!p) return <span className="text-xs text-slate-400">—</span>;
  const cell = (label: string, v: number | null) =>
    v === null ? null : (
      <span key={label} className="tabular-nums" title={`${label} score`}>
        <span className="text-slate-400">{label}</span>{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.round(v)}</span>
      </span>
    );
  return (
    <div className="text-[10px] leading-4 flex flex-wrap gap-x-1.5 max-w-[150px]">
      {cell('V', p.valuation)}{cell('G', p.growth)}{cell('P', p.profitability)}{cell('H', p.health)}{cell('Q', p.quality)}
      {p.ewScore !== null && p.ewMaxPossible !== null && (
        <span className="tabular-nums" title="Early Winners composite score (V5-B, current data)">
          <span className="text-slate-400">EW</span>{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.round(p.ewScore)}/{Math.round(p.ewMaxPossible)}</span>
        </span>
      )}
    </div>
  );
}

function MoversTable({ title, rows, eligibleAnalysis }: { title: string; rows: MoverRecord[]; eligibleAnalysis: Set<string> }) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-600 dark:text-slate-400">
              <th className="px-4 py-2">Ticker</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Sector</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">% Change</th>
              <th className="px-4 py-2 text-center">σ</th>
              <th className="px-4 py-2">Catalyst</th>
              <th className="px-4 py-2">PMP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.lastChangePct ?? 0;
              const color =
                pct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400';

              const sector = r.sector || 'Other';
              const sectorHref = `/sectors/${encodeURIComponent(sector)}`;
              const sigma = r.analysis?.sigmaLevel ?? 'normal';
              const z = r.latestMoversZScore;

              return (
                <tr
                  key={r.symbol}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60"
                >
                  <td className="px-4 py-2 font-semibold">
                    {eligibleAnalysis.has(r.symbol) ? (
                      <Link className="hover:underline" href={`/analysis/${r.symbol}`}>
                        {r.symbol}
                      </Link>
                    ) : (
                      <span>{r.symbol}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {r.name ?? ''}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      className="text-slate-700 dark:text-slate-300 hover:underline"
                      href={sectorHref}
                    >
                      {formatSectorName(sector)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                    {formatPrice(r.lastPrice)}
                  </td>
                  <td className={`px-4 py-2 tabular-nums font-semibold ${color}`}>
                    {formatPercent(pct)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${SIGMA_BADGE[sigma]}`}
                      title={`Z-score ${z?.toFixed(1) ?? '—'} — ${SIGMA_LABELS[sigma]}`}
                    >
                      {z !== null ? `${Math.abs(z).toFixed(1)}σ` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <CatalystCell mover={r} />
                  </td>
                  <td className="px-4 py-2">
                    <PillarCell mover={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PremarketMoversPage() {
  // Movers 2.0 shared pipeline — identical records as /api/stocks/movers.
  // A failure here must NOT render as "no movers": keep a distinct
  // temporarily-unavailable state (page is ISR 60s, self-heals).
  let moversData: Awaited<ReturnType<typeof getMovers>> | null = null;
  let dataError = false;
  try {
    moversData = await getMovers();
  } catch (e) {
    console.error('[premarket-movers] mover pipeline failed:', e);
    dataError = true;
  }

  const [archiveDates, eligibleAnalysis] = await Promise.all([
    getPremarketDateSummaries(14),
    getEligibleAnalysisSet(),
  ]);

  const movers = moversData?.movers ?? [];
  const session = moversData?.session ?? 'closed';
  const gainers = movers.filter(m => (m.lastChangePct ?? 0) > 0.01);
  const losers = movers.filter(m => (m.lastChangePct ?? 0) < -0.01);

  // Fetch tickers with significant moves for /movers/[symbol] links
  let moverTickers: { symbol: string; name: string | null }[] = [];
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const moveCounts = await prisma.sessionPrice.groupBy({
      by: ['symbol'],
      where: {
        date: { gte: since },
        OR: [
          { zScore: { gte: 2.0 } },
          { zScore: { lte: -2.0 } },
        ],
      },
      _count: { _all: true },
      orderBy: { symbol: 'asc' },
      take: 30,
    });
    const eligibleMovers = moveCounts
      .filter(r => r._count._all >= 3)
      .map(r => r.symbol);
    if (eligibleMovers.length > 0) {
      moverTickers = await prisma.ticker.findMany({
        where: { symbol: { in: eligibleMovers } },
        select: { symbol: true, name: true },
        orderBy: { symbol: 'asc' },
      });
    }
  } catch {
    // DB unavailable — skip silently
  }

  const today = getTodayFormatted();
  const topGainer = gainers[0];
  const topLoser = losers[0];

  // JSON-LD must escape "</" so names can't break out of the script tag (XSS).
  const toJsonLd = (schema: object) => JSON.stringify(schema).replace(/</g, '\\u003c');
  const baseUrl = 'https://premarketprice.com';

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Premarket stock movers — ${today}`,
    description: `Top pre-market gainers and losers for ${today}, ranked by percentage change.`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: Math.min(20, gainers.length + losers.length),
    itemListElement: [
      ...gainers.slice(0, 10).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${r.name ?? r.symbol} (${r.symbol}) — ${formatPercent(r.lastChangePct ?? 0)}`,
        url: `${baseUrl}/analysis/${r.symbol}`,
      })),
      ...losers.slice(0, 10).map((r, i) => ({
        '@type': 'ListItem',
        position: 11 + i,
        name: `${r.name ?? r.symbol} (${r.symbol}) — ${formatPercent(r.lastChangePct ?? 0)}`,
        url: `${baseUrl}/analysis/${r.symbol}`,
      })),
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What are premarket stock movers?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Premarket movers are stocks with the largest price changes during the pre-market session (4:00 AM – 9:30 AM ET), before regular US trading begins. Moves are usually driven by earnings reports, analyst actions, or overnight news.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which stocks are moving the most in premarket today?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: topGainer && topLoser
            ? `As of ${today}, the top pre-market gainer is ${topGainer.name ?? topGainer.symbol} (${topGainer.symbol}) at ${formatPercent(topGainer.lastChangePct ?? 0)}, and the biggest decliner is ${topLoser.name ?? topLoser.symbol} (${topLoser.symbol}) at ${formatPercent(topLoser.lastChangePct ?? 0)}.`
            : 'Premarket rankings update continuously during the 4:00–9:30 AM ET session.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does the Z-Score on this page mean?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The σ column shows each stock’s Z-Score — how unusual its move is relative to recent history. A Z-Score above 2.0 marks a statistically significant deviation, with tiers from unusual to extreme, filtering out routine noise.',
        },
      },
      {
        '@type': 'Question',
        name: 'How often is this page updated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Premarket prices and rankings refresh continuously throughout the pre-market session and are archived after the close, so every trading day has a permanent dated page.',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Stocks Moving in Premarket Today ({today})
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            The biggest pre-market movers ranked by percentage change.
            {topGainer && ` Top gainer: ${topGainer.name ?? topGainer.symbol} (${topGainer.symbol}) at ${formatPercent(topGainer.lastChangePct ?? 0)}.`}
            {topLoser && ` Biggest decliner: ${topLoser.name ?? topLoser.symbol} (${topLoser.symbol}) at ${formatPercent(topLoser.lastChangePct ?? 0)}.`}
          </p>
        </div>

        {/* SEO Content: Understanding premarket movers */}
        <section className="mb-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3">Understanding Premarket Stock Movers</h2>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3 leading-relaxed">
            <p>
              Pre-market trading occurs between 4:00 AM and 9:30 AM Eastern Time, before the regular US stock market session opens. During this window, stocks can move significantly in response to overnight news, earnings announcements, economic data releases, and global market developments. The movers listed below represent the most actively changing stocks across NYSE and NASDAQ.
            </p>
            <p>
              The <strong>σ</strong> column measures how unusual each stock's move is relative to its recent history — a Z-Score above 2.0 indicates a statistically significant deviation, with tiers ranging from unusual to extreme. The <strong>Catalyst</strong> column provides context on why each stock is moving — earnings reports, analyst actions, and news — alongside market- and sector-relative attribution. The <strong>PMP</strong> column shows each stock's fundamental profile across Valuation, Growth, Profitability, Financial Health and Quality.
            </p>
            <p>
              Use this page alongside the <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/heatmap">Market Heatmap</Link> for sector-level context, or dive into individual <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/screener">stock pages</Link> for comprehensive analysis including valuation scores and financial health metrics. Check the <Link className="text-blue-600 dark:text-blue-400 hover:underline" href="/earnings">Earnings Calendar</Link> to see if today's movers are earnings-related.
            </p>
          </div>
        </section>

        {/* SSR discovery section — ticker links from DB (independent of Redis) */}
        <SsrMoverLinksCombined />

        {/* Mover insight pages — /movers/[symbol] */}
        {moverTickers.length > 0 && (
          <section className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Mover Insight Pages
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Stocks with significant pre-market moves (Z-Score ≥ 2.0) in the last 30 days. Each links to a dedicated mover analysis page.
            </p>
            <div className="flex flex-wrap gap-2">
              {moverTickers.map((t) => (
                <Link
                  key={t.symbol}
                  href={`/premarket/${t.symbol}`}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {t.symbol}
                  {t.name && <span className="ml-1 text-slate-400 hidden sm:inline">{t.name}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Three honest states — never claim "no movers" when data is missing */}
        {dataError ? (
          <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
            Live mover data is temporarily unavailable. Please check back shortly.
          </div>
        ) : movers.length === 0 ? (
          <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
            {session === 'closed'
              ? 'Live mover data is available during market sessions.'
              : 'No unusual movers detected right now.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MoversTable title="Top Gainers" rows={gainers} eligibleAnalysis={eligibleAnalysis} />
            <MoversTable title="Top Losers" rows={losers} eligibleAnalysis={eligibleAnalysis} />
          </div>
        )}

        {/* Push/email digest subscribe — daily premarket movers at ~08:00 ET */}
        <div className="mt-6 max-w-md">
          <NotificationToggle
            title="Daily Movers Digest"
            subtitle="Top premarket movers each weekday at 8:00 AM ET."
          />
        </div>

        {/* Historical premarket archive — links to past dates from PostgreSQL */}
        {archiveDates.length > 0 && (
          <section className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Historical Premarket Movers
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Browse pre-market gainers and losers from previous trading days. Each date shows the top mover in each direction.
              {' '}<Link href="/premarket-movers/weekly" className="text-blue-600 dark:text-blue-400 hover:underline">Biggest movers this week</Link>
              {' · '}
              <Link href="/premarket-gainers" className="text-emerald-600 dark:text-emerald-400 hover:underline">Full gainers archive</Link>
              {' · '}
              <Link href="/premarket-losers" className="text-rose-600 dark:text-rose-400 hover:underline">Full losers archive</Link>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-slate-600 dark:text-slate-400">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Tickers</th>
                    <th className="px-3 py-2">Top Gainer</th>
                    <th className="px-3 py-2">Top Loser</th>
                    <th className="px-3 py-2">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {archiveDates.map((d) => {
                    const dateDisplay = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                      <tr key={d.date} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{dateDisplay}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">{d.totalTickers}</td>
                        <td className="px-3 py-2">
                          {d.topGainer ? (
                            <span className="tabular-nums">
                              {eligibleAnalysis.has(d.topGainer.symbol) ? (
                                <Link href={`/analysis/${d.topGainer.symbol}`} className="font-semibold text-slate-700 dark:text-slate-300 hover:underline">{d.topGainer.symbol}</Link>
                              ) : (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{d.topGainer.symbol}</span>
                              )}
                              <span className="ml-2 text-emerald-600 dark:text-emerald-400">{formatPercent(d.topGainer.changePct)}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {d.topLoser ? (
                            <span className="tabular-nums">
                              {eligibleAnalysis.has(d.topLoser.symbol) ? (
                                <Link href={`/analysis/${d.topLoser.symbol}`} className="font-semibold text-slate-700 dark:text-slate-300 hover:underline">{d.topLoser.symbol}</Link>
                              ) : (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{d.topLoser.symbol}</span>
                              )}
                              <span className="ml-2 text-rose-600 dark:text-rose-400">{formatPercent(d.topLoser.changePct)}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={`/premarket-gainers/${d.date}`} className="text-emerald-600 dark:text-emerald-400 hover:underline mr-3">Gainers →</Link>
                          <Link href={`/premarket-losers/${d.date}`} className="text-rose-600 dark:text-rose-400 hover:underline">Losers →</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Visible FAQ — mirrors the FAQPage JSON-LD (required by Google guidelines) */}
        <section className="mt-8 max-w-4xl">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Premarket Movers FAQ</h2>
          <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">What are premarket stock movers?</h3>
              <p>Premarket movers are stocks with the largest price changes during the pre-market session (4:00 AM – 9:30 AM ET), before regular US trading begins. Moves are usually driven by earnings reports, analyst actions, or overnight news.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">Which stocks are moving the most in premarket today?</h3>
              <p>
                {topGainer && topLoser
                  ? `As of ${today}, the top pre-market gainer is ${topGainer.name ?? topGainer.symbol} (${topGainer.symbol}) at ${formatPercent(topGainer.lastChangePct ?? 0)}, and the biggest decliner is ${topLoser.name ?? topLoser.symbol} (${topLoser.symbol}) at ${formatPercent(topLoser.lastChangePct ?? 0)}.`
                  : 'Premarket rankings update continuously during the 4:00–9:30 AM ET session.'}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">What does the Z-Score on this page mean?</h3>
              <p>The Z-Score measures how unusual a stock’s move is relative to its recent history. A Z-Score above 2.5 marks a statistically significant deviation, filtering out routine noise.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">How often is this page updated?</h3>
              <p>Premarket prices and rankings refresh continuously throughout the pre-market session and are archived after the close, so every trading day has a permanent dated page.</p>
            </div>
          </div>
        </section>

        {/* Internal linking */}
        <nav className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">Top Gainers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/losers">Top Losers</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/unusual-volume">Unusual Volume</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">Market Heatmap</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/sectors">Sectors</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">Earnings Calendar</Link>
            <Link className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/screener">All Stocks</Link>
          </div>
        </nav>
      </div>
    </div>
  );
}


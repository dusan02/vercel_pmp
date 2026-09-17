import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getLeaderboard, getLeaderboardRows, LEADERBOARDS } from '@/lib/seo/leaderboards';
import { formatPrice, formatPercent } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { toJsonLd } from '@/lib/seo/jsonLd';

export const revalidate = 3600; // 1 hour — underlying data refreshes daily anyway

export function generateStaticParams() {
  return LEADERBOARDS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const def = getLeaderboard(slug);
  if (!def) return {};
  return generatePageMetadata({
    title: def.title,
    description: def.description,
    path: `/screener/${def.slug}`,
    keywords: def.keywords,
  });
}

function formatMarketCap(value: number | null): string {
  if (value == null || value <= 0) return '—';
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (value >= 1) return `$${value.toFixed(1)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

export default async function LeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = getLeaderboard(slug);
  if (!def) notFound();

  const rows = await getLeaderboardRows(def, 50);
  const baseUrl = 'https://premarketprice.com';

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: def.h1,
    numberOfItems: rows.length,
    itemListElement: rows.map((r) => ({
      '@type': 'ListItem',
      position: r.rank,
      name: `${r.name} (${r.symbol})`,
      url: `${baseUrl}/analysis/${r.symbol}`,
    })),
  };

  const faqSchema = def.faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: def.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  const others = LEADERBOARDS.filter((l) => l.slug !== def.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(itemListSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      )}

      <div className="min-h-screen bg-white dark:bg-slate-900">
        <div className="container mx-auto py-8 px-4">
          {/* Breadcrumb */}
          <nav className="text-sm text-slate-500 dark:text-slate-400 mb-4" aria-label="Breadcrumb">
            <Link href="/" className="hover:underline">Home</Link>
            {' / '}
            <Link href="/screener" className="hover:underline">Stock Screener</Link>
            {' / '}
            <span className="text-slate-700 dark:text-slate-300">{def.h1}</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{def.h1}</h1>
            <div className="mt-3 space-y-2 max-w-3xl">
              {def.intro.map((p, i) => (
                <p key={i} className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{p}</p>
              ))}
            </div>
          </div>

          {/* Leaderboard table — fully server-rendered for crawlers */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2 hidden md:table-cell">Sector</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Day %</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">Mkt Cap</th>
                  <th className="px-3 py-2 text-right font-bold">{def.metricLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-2 text-slate-400">{r.rank}</td>
                    <td className="px-3 py-2">
                      <Link href={`/analysis/${r.symbol}`} className="group">
                        <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
                          {r.symbol}
                        </span>
                        <span className="ml-2 text-slate-500 dark:text-slate-400 text-xs hidden sm:inline">
                          {r.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-slate-500 dark:text-slate-400 text-xs">
                      {r.sector ? formatSectorName(r.sector) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.price != null ? formatPrice(r.price) : '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        (r.changePct ?? 0) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {r.changePct != null ? formatPercent(r.changePct) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right hidden sm:table-cell text-slate-600 dark:text-slate-300 tabular-nums">
                      {formatMarketCap(r.marketCapB)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {r.metricValue != null ? def.format(r.metricValue) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FAQ — visible copy + FAQPage schema above */}
          {def.faq.length > 0 && (
            <section className="mt-8 max-w-3xl">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">FAQ</h2>
              <div className="space-y-3">
                {def.faq.map((f, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="font-medium text-slate-900 dark:text-white text-sm">{f.q}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related leaderboards */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">More stock screens</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {others.map((l) => (
                <Link
                  key={l.slug}
                  href={`/screener/${l.slug}`}
                  className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {l.h1}
                </Link>
              ))}
            </div>
            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/heatmap" className="hover:underline">Market heatmap</Link>
              {' · '}
              <Link href="/screener" className="hover:underline">Full screener</Link>
              {' · '}
              <Link href="/gainers" className="hover:underline">Top gainers</Link>
              {' · '}
              <Link href="/sectors" className="hover:underline">Sectors</Link>
            </div>
          </section>

          <p className="mt-8 text-xs text-slate-400 dark:text-slate-500 max-w-3xl">
            Data updated daily from Finnhub fundamentals and SEC filings. Scores are simplified
            heuristics for screening — not investment advice.
          </p>
        </div>
      </div>
    </>
  );
}

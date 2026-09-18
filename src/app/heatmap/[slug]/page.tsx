import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { getMetricPage, METRIC_PAGES } from '@/lib/heatmap/metricPages';
import { toJsonLd } from '@/lib/seo/jsonLd';
import MetricHeatmapClient from './MetricHeatmapClient';

// Same pattern as /screener/[slug]: no generateStaticParams (prerendered
// params 404 in this deployment), ISR renders on demand instead.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const def = getMetricPage(slug);
  if (!def) return {};
  return generatePageMetadata({
    title: def.titleTag,
    description: def.description,
    path: `/heatmap/${def.slug}`,
    keywords: def.keywords,
  });
}

export default async function MetricHeatmapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = getMetricPage(slug);
  if (!def) notFound();

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: def.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const others = METRIC_PAGES.filter((p) => p.slug !== def.slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />

      <div className="min-h-screen bg-white dark:bg-slate-900">
        <div className="container mx-auto py-8 px-4">
          {/* Breadcrumb */}
          <nav className="text-sm text-slate-500 dark:text-slate-400 mb-4" aria-label="Breadcrumb">
            <Link href="/" className="hover:underline">Home</Link>
            {' / '}
            <Link href="/heatmap" className="hover:underline">Market Heatmap</Link>
            {' / '}
            <span className="text-slate-700 dark:text-slate-300">{def.h1}</span>
          </nav>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{def.h1}</h1>
            <div className="mt-3 space-y-2 max-w-3xl">
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{def.intro}</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{def.colorNote}</p>
            </div>
          </div>

          {/* Interactive heatmap preset to this metric — click a tile for its analysis */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-black h-[65vh] min-h-[420px]">
            <MetricHeatmapClient metric={def.metric} />
          </div>

          {/* FAQ — visible copy + FAQPage schema above */}
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

          {/* Other metric heatmaps — internal linking between landing pages */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">More heatmap views</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {others.map((p) => (
                <Link
                  key={p.slug}
                  href={`/heatmap/${p.slug}`}
                  className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {p.h1}
                </Link>
              ))}
            </div>
            <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/heatmap" className="hover:underline">Full market heatmap</Link>
              {' · '}
              <Link href="/screener" className="hover:underline">Stock screener</Link>
              {' · '}
              <Link href="/premarket-movers" className="hover:underline">Pre-market movers</Link>
              {' · '}
              <Link href="/gainers" className="hover:underline">Top gainers</Link>
            </div>
          </section>

          <p className="mt-8 text-xs text-slate-400 dark:text-slate-500 max-w-3xl">
            Heatmap data updates through the trading session. Fundamentals come from Finnhub
            and SEC filings; scores are simplified heuristics for screening — not investment advice.
          </p>
        </div>
      </div>
    </>
  );
}

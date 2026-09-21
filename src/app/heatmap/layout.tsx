import type { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { toJsonLd } from '@/lib/seo/jsonLd';

export const metadata: Metadata = generatePageMetadata({
  title: 'Stock Market Heatmap — Performance by Sector',
  description:
    'Interactive stock market heatmap for 1,000+ US stocks. Color tiles by day/week/month/YTD/1-year performance, P/E, PEG, P/S, EV/EBITDA, dividend yield, ROE, health scores, and more — organized by sector.',
  path: '/heatmap',
  keywords: [
    'market heatmap',
    'stock heatmap',
    'pre-market heatmap',
    'market movers',
    'sector heatmap',
    'market visualization',
    'treemap',
    'stock performance heatmap',
    'P/E ratio heatmap',
    'valuation heatmap',
    'dividend yield heatmap',
    'stock screener heatmap',
  ],
});

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is a stock market heatmap?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A market heatmap is a treemap visualization where each tile is a publicly traded company, sized by market capitalization and colored by a selected metric — such as daily % change, weekly/monthly/yearly performance, valuation ratios, or financial health scores.',
      },
    },
    {
      '@type': 'Question',
      name: 'What metrics can the heatmap display?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The heatmap supports 27 metrics grouped into five categories: performance (day, week, month, YTD, 1-year change and market-cap change), scores (health, valuation, profitability, Piotroski F-score, Altman Z, Beneish M-score), valuation ratios (P/E, forward P/E, P/S, P/B, PEG, EV/EBITDA), fundamentals (ROE, net margin, revenue and EPS growth, dividend yield, FCF margin) and activity (relative volume, beta, movers Z-score).',
      },
    },
    {
      '@type': 'Question',
      name: 'How often is the heatmap data updated?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Prices refresh roughly every minute during pre-market, regular, and after-hours sessions. Fundamental metrics such as valuation ratios and health scores are refreshed daily.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does tile color mean?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Green tiles indicate a favorable value for the selected metric (e.g. positive performance, high score, or cheap valuation), red tiles indicate an unfavorable one, and dark neutral tiles mean the metric is not available for that company.',
      },
    },
  ],
};

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqSchema) }} />
      {children}
    </>
  );
}

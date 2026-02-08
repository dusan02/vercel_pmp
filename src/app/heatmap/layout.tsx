import type { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'Market Heatmap',
  description: 'Interactive stock market heatmap for US stocks. Explore real-time pre-market movers by % change or market cap change with sector zoom and detailed tooltips.',
  path: '/heatmap',
  keywords: [
    'market heatmap',
    'stock heatmap',
    'pre-market heatmap',
    'market movers',
    'sector heatmap',
    'NASDAQ heatmap',
    'NYSE heatmap',
  ],
});

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'Market Heatmap',
  description: 'Interactive market heatmap showing real-time stock performance across sectors. Visualize market movements, percent changes, and market cap changes for S&P 500 companies. Track market trends with our comprehensive heatmap visualization.',
  path: '/heatmap',
  keywords: [
    'market heatmap',
    'stock heatmap',
    'market visualization',
    'sector performance',
    'market movers',
    'stock market visualization',
    'market analysis',
    'treemap',
  ],
});

export default function HeatmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}


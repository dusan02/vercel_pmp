import type { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'Market Heatmap',
  description:
    'Interactive stock market heatmap for US stocks. Explore real-time pre-market movers by % change or market cap change with sector zoom and detailed tooltips.',
  path: '/heatmap',
  keywords: [
    'market heatmap',
    'stock heatmap',
    'pre-market heatmap',
    'market movers',
    'sector heatmap',
    'market visualization',
    'treemap',
  ],
});

export default function HeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}


import type { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StandaloneHeader } from '@/components/StandaloneHeader';
import { EmbedSnippets } from './EmbedSnippets';

export const metadata: Metadata = generatePageMetadata({
  title: 'Free Stock Market Widgets — Embed Live Movers & Heatmap',
  description:
    'Free embeddable stock market widgets: live premarket movers list and sector heatmap. Copy-paste iframe snippet, real-time data, free for blogs and newsletters.',
  path: '/embed',
});

export default function EmbedPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <StandaloneHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
          Free Stock Market Widgets
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
          Embed live market data on your blog, newsletter archive page or dashboard.
          Free to use — a small &ldquo;Powered by PreMarketPrice&rdquo; link is included in each widget.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
          Data refreshes automatically during market hours. Clicking a stock opens its full analysis on premarketprice.com.
        </p>

        <EmbedSnippets />
      </div>
    </div>
  );
}

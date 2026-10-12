import { Metadata } from 'next';
import { AnalysisStandalone } from '@/components/home/StandaloneTools';

export const metadata: Metadata = {
  title: 'Stock Analysis — Search Any US Stock | PreMarketPrice',
  description: 'Search 1,000+ US stocks for a six-pillar fundamental profile: valuation, growth, profitability, financial health, quality and moat. Free, updated daily.',
};

export default function AnalysisSearchPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-4 lg:py-6">
        <AnalysisStandalone />
      </div>
    </main>
  );
}

import { Metadata } from 'next';
import { PortfolioStandalone } from '@/components/home/StandaloneTools';
import { StandaloneHeader } from '@/components/StandaloneHeader';

export const metadata: Metadata = {
  title: 'Portfolio | PreMarketPrice',
  description: 'Your stock portfolio — personal holdings saved in your browser.',
  robots: { index: false, follow: true },
};

export default function PortfolioPage() {
  return (
    <main className="min-h-screen">
      <StandaloneHeader />
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-4 lg:py-6">
        <PortfolioStandalone />
      </div>
    </main>
  );
}

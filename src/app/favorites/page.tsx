import { Metadata } from 'next';
import { FavoritesStandalone } from '@/components/home/StandaloneTools';
import { StandaloneHeader } from '@/components/StandaloneHeader';

export const metadata: Metadata = {
  title: 'Favorites | PreMarketPrice',
  description: 'Your favorite stocks — personal watchlist saved in your browser.',
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return (
    <main className="min-h-screen">
      <StandaloneHeader />
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-4 lg:py-6">
        <FavoritesStandalone />
      </div>
    </main>
  );
}

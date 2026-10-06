import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmbedMovers } from './EmbedMovers';

// Embeddable widget — served inside iframes on third-party sites, so it must
// never compete with the canonical /premarket-movers page in search results.
export const metadata: Metadata = {
  title: 'Market Movers Widget — PreMarketPrice',
  robots: { index: false, follow: false },
};

export default function EmbedMoversPage() {
  return (
    <Suspense fallback={null}>
      <EmbedMovers />
    </Suspense>
  );
}

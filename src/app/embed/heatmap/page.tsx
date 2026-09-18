import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmbedHeatmap } from './EmbedHeatmap';

// Embeddable widget — served inside iframes on third-party sites, so it must
// never compete with the canonical /heatmap page in search results.
export const metadata: Metadata = {
  title: 'Premarket Heatmap Widget — PreMarketPrice',
  robots: { index: false, follow: false },
};

export default function EmbedHeatmapPage() {
  return (
    <Suspense fallback={null}>
      <EmbedHeatmap />
    </Suspense>
  );
}

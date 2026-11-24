import { getInitialHeatmapRows } from '@/lib/heatmap/heatmapService';
import HeatmapClient from './HeatmapClient';

export const revalidate = 30;

/**
 * Full-page heatmap route — prefetches top 300 caps via ISR/SSR so the first
 * paint has tiles immediately, then HeatmapClient refreshes the full universe.
 */
export default async function HeatmapPage() {
  const initialHeatmapData = await getInitialHeatmapRows(300, 2500);
  return <HeatmapClient initialHeatmapData={initialHeatmapData} />;
}

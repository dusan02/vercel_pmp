import { getInitialHeatmapRows } from '@/lib/heatmap/heatmapService';
import HeatmapClient from './HeatmapClient';

export const revalidate = 30;

/**
 * Full-page heatmap route — prefetches full universe in slim SSR format so
 * the first paint has complete treemap geometry without any tile-size jump.
 */
export default async function HeatmapPage() {
  const initialHeatmapData = await getInitialHeatmapRows(null, 2500);
  return <HeatmapClient initialHeatmapData={initialHeatmapData} />;
}

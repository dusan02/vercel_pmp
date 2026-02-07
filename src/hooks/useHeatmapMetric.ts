/**
 * Centralized hook for heatmap metric state management
 * Handles localStorage persistence and hydration safety
 */

import { useState, useEffect } from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { safeGetItem, safeSetItem } from '@/lib/utils/safeStorage';

const METRIC_STORAGE_KEY = 'heatmap-metric-preference';
const DEFAULT_METRIC: HeatmapMetric = 'percent';

/**
 * Hook for managing heatmap metric state with localStorage persistence
 */
export function useHeatmapMetric(initialMetric: HeatmapMetric = DEFAULT_METRIC) {
  const [metric, setMetricState] = useState<HeatmapMetric>(initialMetric);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    const stored = safeGetItem(METRIC_STORAGE_KEY);
    if (stored && (stored === 'percent' || stored === 'mcap')) {
      setMetricState(stored as HeatmapMetric);
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage when metric changes
  const setMetric = (newMetric: HeatmapMetric) => {
    setMetricState(newMetric);
    safeSetItem(METRIC_STORAGE_KEY, newMetric);
  };

  return {
    metric,
    setMetric,
    isHydrated,
  };
}


/**
 * Centralized hook for heatmap metric state management
 * Handles localStorage persistence and hydration safety
 */

import { useState, useEffect, useCallback } from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { safeGetItem, safeSetItem } from '@/lib/utils/safeStorage';
import { DEFAULT_HEATMAP_METRIC, isHeatmapMetric } from '@/lib/heatmap/metricValue';

const METRIC_STORAGE_KEY = 'heatmap-metric-preference';
const DEFAULT_METRIC: HeatmapMetric = DEFAULT_HEATMAP_METRIC;

export interface UseHeatmapMetricOptions {
  /** Read saved preference from localStorage on mount (default: true). */
  useStoredPreference?: boolean;
  /** Persist metric updates to localStorage (default: true). */
  persistPreference?: boolean;
}

/**
 * Hook for managing heatmap metric state with optional localStorage persistence.
 * Pages with URL- or embed-pinned metrics pass `{ useStoredPreference: false }`
 * so a stored preference never overwrites the route's intended metric.
 */
export function useHeatmapMetric(
  initialMetric: HeatmapMetric = DEFAULT_METRIC,
  options: UseHeatmapMetricOptions = {},
) {
  const { useStoredPreference = true, persistPreference = true } = options;
  const [metric, setMetricState] = useState<HeatmapMetric>(initialMetric);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration unless caller pinned an explicit metric
  useEffect(() => {
    if (useStoredPreference) {
      const stored = safeGetItem(METRIC_STORAGE_KEY);
      if (stored && isHeatmapMetric(stored)) {
        setMetricState(stored);
      }
    }
    setIsHydrated(true);
  }, [useStoredPreference]);

  // Keep in sync if caller changes initialMetric while localStorage restore is disabled
  useEffect(() => {
    if (!useStoredPreference) {
      setMetricState(initialMetric);
    }
  }, [initialMetric, useStoredPreference]);

  // Save to localStorage when metric changes
  const setMetric = useCallback(
    (newMetric: HeatmapMetric) => {
      setMetricState(newMetric);
      if (persistPreference) {
        safeSetItem(METRIC_STORAGE_KEY, newMetric);
      }
    },
    [persistPreference],
  );

  return {
    metric,
    setMetric,
    isHydrated,
  };
}


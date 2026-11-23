'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyNode } from '@/lib/heatmap/types';

export type PrefetchTarget = CompanyNode | string | null;

/**
 * Debounced route prefetch for heatmap tile hover / pointerdown.
 * Calls `router.prefetch('/analysis/<SYMBOL>')` so both the RSC payload and
 * route JS chunks are warm before click without firing redundant API fetches.
 */
export function useAnalysisPrefetch(delayMs = 80) {
  const router = useRouter();
  const stateRef = useRef<{
    timer?: ReturnType<typeof setTimeout> | undefined;
    pendingSymbol?: string | null;
    done: Set<string>;
  }>({
    done: new Set(),
  });

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      clearTimeout(state.timer);
      state.timer = undefined;
      state.pendingSymbol = null;
    };
  }, []);

  return useCallback(
    (target: PrefetchTarget) => {
      const state = stateRef.current;
      if (!target) {
        clearTimeout(state.timer);
        state.timer = undefined;
        state.pendingSymbol = null;
        return;
      }
      const raw = typeof target === 'string' ? target : target.symbol;
      if (!raw) {
        clearTimeout(state.timer);
        state.timer = undefined;
        state.pendingSymbol = null;
        return;
      }
      const symbol = raw.toUpperCase();
      if (state.done.has(symbol)) return;
      // Moving within the same tile should NOT reset the hover countdown.
      if (state.pendingSymbol === symbol && state.timer !== undefined) return;

      clearTimeout(state.timer);
      state.pendingSymbol = symbol;
      state.timer = setTimeout(() => {
        state.timer = undefined;
        state.pendingSymbol = null;
        state.done.add(symbol);
        router.prefetch(`/analysis/${encodeURIComponent(symbol)}`);
      }, delayMs);
    },
    [delayMs, router],
  );
}

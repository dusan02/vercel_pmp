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
  const stateRef = useRef<{ timer?: ReturnType<typeof setTimeout>; done: Set<string> }>({
    done: new Set(),
  });

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      clearTimeout(state.timer);
    };
  }, []);

  return useCallback(
    (target: PrefetchTarget) => {
      const state = stateRef.current;
      clearTimeout(state.timer);
      if (!target) return;
      const raw = typeof target === 'string' ? target : target.symbol;
      if (!raw) return;
      const symbol = raw.toUpperCase();
      if (state.done.has(symbol)) return;

      state.timer = setTimeout(() => {
        state.done.add(symbol);
        router.prefetch(`/analysis/${encodeURIComponent(symbol)}`);
      }, delayMs);
    },
    [delayMs, router],
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SsrFreshnessGuardProps {
  /** Server render timestamp (Date.now() at SSR/ISR time) */
  renderedAt: number;
  /** Max age (ms) before an immediate post-mount router.refresh() is triggered (default 90s) */
  maxAgeMs?: number;
  /** Interval (ms) for periodic background router.refresh() while tab is visible (default 60s; 0 disables) */
  refreshIntervalMs?: number;
}

/**
 * Ensures ISR-cached pages never stay pinned to a stale server snapshot
 * (e.g. yesterday's HTML served on the first hit of the day with x-nextjs-cache: STALE).
 *
 * 1. If the SSR payload is older than `maxAgeMs`, the current request already
 *    triggered Next.js background ISR regeneration on the server — wait ~1s
 *    for regeneration to finish and call `router.refresh()` once.
 * 2. While the tab remains visible, periodically call `router.refresh()` so
 *    SSR pages (/brief, /premarket-movers, /gainers, /losers) stay live.
 */
export function SsrFreshnessGuard({
  renderedAt,
  maxAgeMs = 90_000,
  refreshIntervalMs = 60_000,
}: SsrFreshnessGuardProps) {
  const router = useRouter();
  const lastRefreshedSnapshotRef = useRef<number | null>(null);
  const lastRefreshCallTsRef = useRef<number>(Date.now());

  useEffect(() => {
    const ageMs = Date.now() - renderedAt;
    if (ageMs > maxAgeMs && lastRefreshedSnapshotRef.current !== renderedAt) {
      lastRefreshedSnapshotRef.current = renderedAt;
      const timer = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          lastRefreshCallTsRef.current = Date.now();
          router.refresh();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [renderedAt, maxAgeMs, router]);

  useEffect(() => {
    if (refreshIntervalMs <= 0) return undefined;

    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshCallTsRef.current < refreshIntervalMs - 5_000) return;
      lastRefreshCallTsRef.current = Date.now();
      router.refresh();
    };

    const id = setInterval(maybeRefresh, refreshIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefreshCallTsRef.current >= refreshIntervalMs) {
        maybeRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshIntervalMs, router]);

  return null;
}

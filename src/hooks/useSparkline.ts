'use client';

import { useEffect, useState } from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';

export type SparkRange = '1d' | '1w' | '1m' | 'ytd' | '1y';

/** Performance metrics → sparkline range; everything else defaults to 1D. */
export function sparkRangeForMetric(metric: HeatmapMetric): SparkRange {
    switch (metric) {
        case 'week': return '1w';
        case 'month': return '1m';
        case 'ytd': return 'ytd';
        case 'year': return '1y';
        default: return '1d';
    }
}

// Module-level cache — tooltip mounts/unmounts on every hover, so fetched
// series must survive the component. In-flight map dedupes rapid re-hovers.
const cache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[]>>();

async function fetchSparkline(symbol: string, range: SparkRange): Promise<number[]> {
    const key = `${symbol}:${range}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = inflight.get(key);
    if (pending) return pending;

    const req = fetch(`/api/analysis/${encodeURIComponent(symbol)}/sparkline?range=${range}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
            const prices: unknown = json?.prices;
            const data = Array.isArray(prices)
                ? prices.filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
                : [];
            cache.set(key, data);
            inflight.delete(key);
            return data;
        })
        .catch(() => {
            inflight.delete(key);
            return [];
        });
    inflight.set(key, req);
    return req;
}

/**
 * Close-price sparkline for a ticker + range. Cached per session —
 * hovering the same tile twice never refetches.
 */
export function useSparkline(symbol: string | undefined, range: SparkRange): number[] | null {
    const [data, setData] = useState<number[] | null>(() =>
        symbol ? cache.get(`${symbol.toUpperCase()}:${range}`) ?? null : null,
    );

    useEffect(() => {
        if (!symbol) return;
        const sym = symbol.toUpperCase();
        const key = `${sym}:${range}`;
        const hit = cache.get(key);
        if (hit) { setData(hit); return; }
        let cancelled = false;
        void fetchSparkline(sym, range).then((d) => { if (!cancelled) setData(d); });
        return () => { cancelled = true; };
    }, [symbol, range]);

    return data;
}

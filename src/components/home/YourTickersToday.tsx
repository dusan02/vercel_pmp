'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFavorites } from '@/hooks/useFavorites';

interface FavoriteQuote {
    ticker: string;
    percentChange: number | null;
    currentPrice: number | null;
}

/**
 * "Your tickers today" — personalization strip on the homepage. Joins the
 * user's favorites (localStorage-backed, works for anonymous users too —
 * useFavorites syncs to DB only when logged in) with today's move for each.
 *
 * Renders nothing until it has rows, so SSR output is unaffected and the
 * block never shows an empty/loading shell to users without favorites.
 */
export function YourTickersToday() {
    const { favoriteTickers } = useFavorites();
    const [rows, setRows] = useState<FavoriteQuote[] | null>(null);

    const tickers = favoriteTickers.slice(0, 10);
    const key = tickers.join(',');

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        fetch(`/api/stocks?tickers=${encodeURIComponent(key)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (cancelled || !json?.data) return;
                const byTicker = new Map<string, FavoriteQuote>();
                for (const s of json.data) {
                    if (s?.ticker) {
                        byTicker.set(s.ticker, {
                            ticker: s.ticker,
                            percentChange: s.percentChange ?? null,
                            currentPrice: s.currentPrice ?? null,
                        });
                    }
                }
                const ordered = key
                    .split(',')
                    .map((t) => byTicker.get(t))
                    .filter((r): r is FavoriteQuote => !!r);
                setRows(ordered.length > 0 ? ordered : null);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [key]);

    if (!rows) return null;

    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs" aria-label="Your tickers today">
            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">Your tickers today:</span>
            {rows.map((r) => {
                const pct = r.percentChange;
                const cls = pct == null
                    ? 'text-slate-500 dark:text-slate-400'
                    : pct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400';
                return (
                    <Link
                        key={r.ticker}
                        href={`/analysis/${r.ticker}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                    >
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{r.ticker}</span>
                        <span className={`tabular-nums font-medium ${cls}`}>
                            {pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}

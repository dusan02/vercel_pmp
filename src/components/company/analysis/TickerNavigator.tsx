'use client';

/**
 * Slim prev/next navigation between /analysis pages.
 *
 * Deterministic neighbors (mcap DESC, symbol ASC) come precomputed from the
 * server for all three dimensions — switching modes is a pure client toggle,
 * no refetch. `?nav=<dimension>` in the URL keeps the selected mode across
 * page transitions and survives a full reload; the page itself stays a
 * single canonical ISR render (query param is not part of the cache key and
 * canonical href points at the clean path).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { event } from '@/lib/ga';
import type { NavDimension, TickerNav, NavModeResult } from '@/lib/analysis/tickerNav';

const DIMENSIONS: { id: NavDimension; short: string }[] = [
    { id: 'market_cap', short: 'Cap' },
    { id: 'sector', short: 'Sector' },
    { id: 'industry', short: 'Industry' },
];

const LS_KEY = 'ticker-nav-mode';
const DEFAULT_MODE: NavDimension = 'sector';

function readUrlMode(): NavDimension | null {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('nav');
    return v === 'market_cap' || v === 'sector' || v === 'industry' ? v : null;
}

function ArrowLink({
    direction, neighbor, mode, from,
}: {
    direction: 'previous' | 'next';
    neighbor: { symbol: string; name: string | null } | null;
    mode: NavDimension;
    from: string;
}) {
    const dimLabel = mode === 'market_cap' ? 'market cap' : mode;
    const inner = (
        <>
            {direction === 'previous' && <span aria-hidden="true" className="text-gray-400">←</span>}
            <span className="font-semibold text-gray-800 dark:text-gray-100">{neighbor?.symbol ?? '—'}</span>
            {neighbor?.name && (
                <span className="hidden sm:inline text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[9rem]">{neighbor.name}</span>
            )}
            {direction === 'next' && <span aria-hidden="true" className="text-gray-400">→</span>}
        </>
    );
    const cls = `inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm min-w-[3.5rem] ${
        direction === 'previous' ? 'justify-start' : 'justify-end'
    }`;
    if (!neighbor) {
        return (
            <span
                className={`${cls} opacity-35 cursor-not-allowed`}
                aria-disabled="true"
                aria-label={`No ${direction} stock by ${dimLabel}`}
            >
                <span aria-hidden="true" className="text-gray-400">{direction === 'previous' ? '←' : '→'}</span>
            </span>
        );
    }
    return (
        <Link
            href={`/analysis/${neighbor.symbol}?nav=${mode}`}
            prefetch
            aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} stock by ${dimLabel}: ${neighbor.symbol}`}
            title={`${direction === 'previous' ? 'Previous' : 'Next'} ${dimLabel} stock by market cap`}
            onClick={() => event('stock_navigator_click', {
                ticker_from: from,
                ticker_to: neighbor.symbol,
                dimension: mode,
                direction,
            })}
            className={`${cls} hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
        >
            {inner}
        </Link>
    );
}

export function TickerNavigator({ symbol, nav }: { symbol: string; nav: TickerNav }) {
    const [mode, setMode] = useState<NavDimension>(DEFAULT_MODE);

    // Post-mount: ?nav= wins, else last-used mode. Runs in an effect so the
    // SSR render is deterministic (no hydration mismatch on the links).
    useEffect(() => {
        const m = readUrlMode() ?? (localStorage.getItem(LS_KEY) as NavDimension | null);
        if (m && (nav[m].available || nav[m].prev || nav[m].next)) setMode(m);
    }, [nav]);

    // Fall back to market_cap when the default mode is unavailable.
    const active: NavModeResult = nav[mode].available || nav[mode].prev || nav[mode].next ? nav[mode] : nav.market_cap;
    const activeMode: NavDimension = nav[mode].available || nav[mode].prev || nav[mode].next ? mode : 'market_cap';

    const pick = (d: NavDimension) => {
        setMode(d);
        try { localStorage.setItem(LS_KEY, d); } catch {}
    };

    return (
        <nav aria-label="Stock navigator" className="flex items-center justify-between gap-2 sm:gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 sm:px-3 py-1.5">
            <ArrowLink direction="previous" neighbor={active.prev} mode={activeMode} from={symbol} />

            <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-900/70 p-0.5" role="group" aria-label="Navigation dimension">
                {DIMENSIONS.map((d) => {
                    const res = nav[d.id];
                    const enabled = res.available || res.prev !== null || res.next !== null;
                    const activeCls = activeMode === d.id
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200';
                    return (
                        <button
                            key={d.id}
                            type="button"
                            disabled={!enabled}
                            onClick={() => pick(d.id)}
                            title={res.label ? `${d.short}: ${res.label}` : `${d.short} unavailable`}
                            aria-pressed={activeMode === d.id}
                            className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeCls}`}
                        >
                            {d.short}
                        </button>
                    );
                })}
            </div>

            <ArrowLink direction="next" neighbor={active.next} mode={activeMode} from={symbol} />
        </nav>
    );
}

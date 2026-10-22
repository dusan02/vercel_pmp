'use client';

/**
 * Shared resolution of the active navigator dimension (Cap / Sector /
 * Industry) for the /analysis ticker slider — used by the page-top
 * TickerNavigator and the in-chart prev/next arrows so both stay on the
 * same ordering. `?nav=<dim>` wins, else the last-used localStorage mode,
 * else 'sector' (falling back to 'market_cap' when the mode has no
 * neighbors at all).
 */
import { useEffect, useState } from 'react';
import type { NavDimension, NavModeResult, TickerNav } from '@/lib/analysis/tickerNav';

const LS_KEY = 'ticker-nav-mode';
const DEFAULT_MODE: NavDimension = 'sector';

function readUrlMode(): NavDimension | null {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('nav');
    return v === 'market_cap' || v === 'sector' || v === 'industry' ? v : null;
}

function hasNeighbors(nav: TickerNav | null | undefined, d: NavDimension): boolean {
    if (!nav) return false;
    const r = nav[d];
    return r.available || r.prev !== null || r.next !== null;
}

export function useTickerNavMode(nav: TickerNav | null | undefined): {
    mode: NavDimension;
    result: NavModeResult | null;
    pick: (d: NavDimension) => void;
} {
    const [mode, setMode] = useState<NavDimension>(DEFAULT_MODE);

    // Post-mount: ?nav= wins, else last-used mode. Runs in an effect so the
    // SSR render is deterministic (no hydration mismatch on the links).
    useEffect(() => {
        if (!nav) return;
        const m = readUrlMode() ?? (localStorage.getItem(LS_KEY) as NavDimension | null);
        if (m && hasNeighbors(nav, m)) setMode(m);
    }, [nav]);

    const resolved: NavDimension = hasNeighbors(nav, mode) ? mode : 'market_cap';
    const pick = (d: NavDimension) => {
        setMode(d);
        try { localStorage.setItem(LS_KEY, d); } catch {}
    };
    return { mode: resolved, result: nav ? nav[resolved] : null, pick };
}

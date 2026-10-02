'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { MiniIntradayChart } from './MiniIntradayChart';

// Primary: real index values (S&P 500 / NASDAQ / DOW) from /api/indices/market
// (TradingView quotes + Yahoo intraday). Fallback: SPY/QQQ ETFs from Polygon
// via /api/stocks + the legacy Yahoo DJIA card.
const INDEX_DEFS = [
    { key: 'SPX', label: 'S&P 500' },
    { key: 'IXIC', label: 'NASDAQ' },
    { key: 'DJI', label: 'DOW' },
];

const ETF_INDICES = [
    { ticker: 'SPY', label: 'SPY' },
    { ticker: 'QQQ', label: 'QQQ' },
];

interface DjiaData {
    price: number;
    previousClose: number;
    dollarChange: number;
    percentChange: number;
    intraday: { ts: string; price: number }[];
}

export function MarketIndices() {
    const [data, setData]       = useState<Record<string, StockData>>({});
    const [history, setHistory] = useState<Record<string, { ts: string; price: number }[]>>({});
    const [djia, setDjia]       = useState<DjiaData | null>(null);
    const [indices, setIndices] = useState<Record<string, DjiaData> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let abortController: AbortController | null = null;

        const fetchLegacyEtfPath = async (signal: AbortSignal) => {
            const tickers = ETF_INDICES.map(i => i.ticker).join(',');
            const res = await fetch(`/api/stocks?tickers=${tickers}`, { signal, cache: 'no-store' });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const json = await res.json();
            if (json.data && Array.isArray(json.data)) {
                const map: Record<string, StockData> = {};
                json.data.forEach((s: StockData) => { map[s.ticker] = s; });
                setData(map);
            }

            try {
                const polyRes = await fetch('/api/indices/intraday', { signal, cache: 'no-store' });
                if (polyRes.ok) {
                    const polyJson = await polyRes.json();
                    if (polyJson?.data) {
                        const histMap: Record<string, { ts: string; price: number }[]> = {};
                        ETF_INDICES.forEach(({ ticker }) => {
                            histMap[ticker] = polyJson.data[ticker] ?? [];
                        });
                        setHistory(histMap);
                    }
                }
            } catch { /* silent — chart stays empty, quotes still show */ }

            try {
                const djiaRes = await fetch('/api/indices/djia', { signal, cache: 'no-store' });
                if (djiaRes.ok) {
                    const djiaJson = await djiaRes.json();
                    if (djiaJson?.price) setDjia(djiaJson);
                }
            } catch { /* silent */ }
        };

        const fetchIndices = async () => {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const signal = abortController.signal;

            try {
                // ── Real index values (one request) ──
                try {
                    const res = await fetch('/api/indices/market', { signal, cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        if (json?.SPX?.price || json?.IXIC?.price || json?.DJI?.price) {
                            setIndices(json);
                            return;
                        }
                    }
                } catch { /* fall through to ETF strip */ }

                await fetchLegacyEtfPath(signal);
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 5 * 60_000);
        return () => {
            clearInterval(interval);
            abortController?.abort();
        };
    }, []);

    type CardProps = {
        label: string;
        price: number | null;
        dollarChg: number | null;
        percentChg: number | null;
        pts: { ts: string; price: number }[];
        isIndex?: boolean;
        /** Post-close: live after-hours price drifting off the pinned close */
        ah?: { price: number; pct: number } | null;
    };

    const renderCard = ({ label, price, dollarChg, percentChg, pts, isIndex, ah }: CardProps) => {
        const isPositive = (percentChg ?? 0) >= 0;
        const hasData = price != null && price > 0;

        // Slim horizontal card: [label+price] [sparkline] [%+$ change] — one
        // row ~52px tall instead of the previous 3-row ~100px card.
        return (
            <div
                key={label}
                className={`
                    flex-1 flex items-center gap-2
                    bg-white dark:bg-gray-900
                    border border-gray-200 dark:border-gray-700
                    border-l-[3px]
                    ${isPositive
                        ? 'border-l-emerald-500'
                        : 'border-l-red-500'}
                    rounded-lg px-2.5 py-1.5
                    transition-all duration-200 cursor-default
                    hover:shadow-sm
                `}
                title={label}
            >
                {/* Left: label + price (+ AH drift once the day result is pinned) */}
                <div className="flex flex-col justify-center shrink-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400 leading-tight">
                        {label}
                    </span>
                    {loading && !hasData ? (
                        <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 rounded mt-0.5" />
                    ) : (
                        <span className="flex items-baseline gap-1.5 leading-tight">
                            <span className="text-base font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                                {isIndex ? formatPrice(price) : `$${formatPrice(price)}`}
                            </span>
                            {ah && (
                                <span className={`text-[10px] font-medium tabular-nums ${ah.pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    AH {ah.pct >= 0 ? '+' : ''}{ah.pct.toFixed(2)}%
                                </span>
                            )}
                        </span>
                    )}
                </div>

                {/* Middle: sparkline fills remaining width — hidden below xl so
                    narrow headers never push the % chip into the auth cluster */}
                <div className="hidden xl:block flex-1 h-9 min-w-[40px]">
                    {pts.length > 0 ? (
                        <MiniIntradayChart
                            points={pts}
                            height={36}
                            positive={isPositive}
                        />
                    ) : (
                        <div className="w-full h-full rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
                    )}
                </div>

                {/* Right: % change chip + $ change */}
                <div className="flex flex-col items-end justify-center gap-0.5 shrink-0">
                    {loading && !hasData ? (
                        <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-12 rounded" />
                    ) : (
                        <>
                            <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded
                                ${isPositive
                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                                {formatPercent(percentChg)}
                            </span>
                            {dollarChg !== null && (
                                <span className={`text-[10px] font-medium tabular-nums hidden sm:inline
                                    ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {isPositive ? '+' : ''}{dollarChg.toFixed(isIndex ? 0 : 2)}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex items-stretch gap-2 sm:gap-3 w-full">
            {indices ? (
                INDEX_DEFS.map(({ key, label }) => {
                    const idx = indices[key];
                    if (!idx?.price) return null;
                    return renderCard({
                        label,
                        price: idx.price,
                        dollarChg: idx.dollarChange ?? null,
                        percentChg: idx.percentChange ?? null,
                        pts: idx.intraday ?? [],
                        isIndex: true,
                    });
                })
            ) : (
                <>
                    {ETF_INDICES.map(({ ticker, label }) => {
                        const stock = data[ticker];
                        const price = stock?.currentPrice ?? null;
                        const close = stock?.closePrice ?? null;          // D-1 close
                        const regClose = stock?.regularClose ?? null;     // today's official close (post-close only)
                        const dayPct = stock?.dayChangePct ?? null;       // pinned close→close result
                        const livePct = stock?.percentChange ?? null;     // live price vs D-1
                        const pts = history[ticker] ?? [];

                        // Post-close: pin headline to the official day result (Finviz
                        // parity) — the live/AH price drifts off on a small AH chip.
                        const pinned = dayPct != null && regClose != null;
                        const displayPrice = pinned ? regClose : price;
                        const dollarChg = (pinned && close != null && regClose != null)
                            ? regClose - close
                            : (price != null && close != null ? price - close : null);
                        const ah = (pinned && price != null && regClose != null && Math.abs(price - regClose) / regClose >= 0.0005)
                            ? { price, pct: (price / regClose - 1) * 100 }
                            : null;

                        return renderCard({
                            label,
                            price: displayPrice,
                            dollarChg,
                            percentChg: pinned ? dayPct : livePct,
                            pts,
                            ah
                        });
                    })}

                    {renderCard({
                        label: 'DJIA',
                        price: djia?.price ?? null,
                        dollarChg: djia?.dollarChange ?? null,
                        percentChg: djia?.percentChange ?? null,
                        pts: djia?.intraday ?? [],
                        isIndex: true,
                    })}
                </>
            )}
        </div>
    );
}

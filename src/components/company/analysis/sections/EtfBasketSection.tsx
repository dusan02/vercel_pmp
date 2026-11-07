import Link from 'next/link';
import type { EtfBasket } from '@/lib/analysis/etfBaskets';

const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

function rsiChip(rsi: number | null) {
    if (rsi == null) return { label: 'RSI —', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' };
    if (rsi <= 30) return { label: `RSI ${rsi.toFixed(0)}`, cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
    if (rsi >= 70) return { label: `RSI ${rsi.toFixed(0)}`, cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' };
    return { label: `RSI ${rsi.toFixed(0)}`, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
}

/**
 * ETF related-basket card (SSR) — top constituents / sector leaders / the
 * single-stock underlying, with today's move, RSI and a breadth summary.
 * Every tile is an internal link to that stock's /analysis page.
 */
export function EtfBasketSection({ ticker, basket }: { ticker: string; basket: EtfBasket }) {
    const { breadth } = basket;
    return (
        <section
            id="etf-basket"
            aria-label={`${ticker} related stocks`}
            className="mb-6 scroll-mt-16 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
        >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {ticker} · {basket.label}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                        Approximate exposure — not an official holdings file.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium tabular-nums">
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{breadth.up} up</span>
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300">{breadth.down} down</span>
                    {breadth.avgRsi != null && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">avg RSI {breadth.avgRsi.toFixed(0)}</span>
                    )}
                    {breadth.oversold > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{breadth.oversold} oversold</span>
                    )}
                    {breadth.overbought > 0 && (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-700 dark:text-rose-300">{breadth.overbought} overbought</span>
                    )}
                </div>
            </div>

            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {basket.items.map((it) => {
                    const chip = rsiChip(it.rsi14);
                    const chg = it.lastChangePct;
                    return (
                        <li key={it.symbol}>
                            <Link
                                href={`/analysis/${it.symbol}`}
                                className={`block h-full rounded-lg border px-2.5 py-2 transition-colors hover:border-blue-400 ${
                                    it.isUnderlying
                                        ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30'
                                        : 'border-gray-200/80 bg-gray-50/60 dark:border-gray-700/70 dark:bg-gray-800/40'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{it.symbol}</span>
                                    <span className={`text-xs font-semibold tabular-nums ${
                                        chg == null ? 'text-gray-400' : chg > 0 ? 'text-emerald-600 dark:text-emerald-400' : chg < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
                                    }`}>{pct(chg)}</span>
                                </div>
                                <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                                    {it.isUnderlying ? 'Underlying · ' : ''}{it.name ?? ''}
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-1">
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${chip.cls}`}>{chip.label}</span>
                                    {it.lastPrice != null && (
                                        <span className="text-[11px] tabular-nums text-gray-600 dark:text-gray-300">${it.lastPrice.toFixed(2)}</span>
                                    )}
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

'use client';

import React, { useEffect, useState } from 'react';
import { VERDICT_LABELS } from '@/lib/analysis/verdict';
import type { VerdictFilterKey } from '@/lib/utils/screener';

// Rows are persisted fundLevel values, columns are valLevel values. The
// degenerate cells (no pillar scores / no valuation history) are omitted —
// the matrix only covers the 9 real verdict cells; 'insufficient' sits
// below it.
const FUNDS = [
    { id: 'strong', label: 'Strong' },
    { id: 'mixed', label: 'Mixed' },
    { id: 'weak', label: 'Weak' },
] as const;
const VALS = [
    { id: 'cheap', label: 'Cheap', cls: 'text-emerald-600 dark:text-emerald-400' },
    { id: 'fair', label: 'Fair', cls: 'text-gray-500 dark:text-gray-400' },
    { id: 'expensive', label: 'Expensive', cls: 'text-rose-500 dark:text-rose-400' },
] as const;

type FundId = (typeof FUNDS)[number]['id'];
type ValId = (typeof VALS)[number]['id'];

const cellKey = (f: FundId, v: ValId): string => `${f}_${v}`;

export default function VerdictMatrix({
    verdictFilters,
    setVerdictFilter,
}: {
    verdictFilters: Partial<Record<VerdictFilterKey, string>>;
    setVerdictFilter: (key: VerdictFilterKey, value: string | undefined) => void;
}) {
    const [counts, setCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        fetch('/api/analysis/verdict-matrix')
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.counts) setCounts(d.counts); })
            .catch(() => {});
    }, []);

    const exact = verdictFilters.verdict;
    const fund = verdictFilters.fund;
    const val = verdictFilters.val;

    // Cell click pins the exact verdictKey — atomic fund/val selects are
    // cleared so the chips show one constraint, not three redundant ones.
    const pickCell = (key: string | null) => {
        if (!key) return;
        setVerdictFilter('verdict', exact === key ? undefined : key);
        setVerdictFilter('fund', undefined);
        setVerdictFilter('val', undefined);
    };
    const pickAxis = (axis: 'fund' | 'val', v: string) => {
        setVerdictFilter(axis, verdictFilters[axis] === v ? undefined : v);
        setVerdictFilter('verdict', undefined);
    };

    const cellActive = (key: string | null) =>
        !!key && (exact === key || (!exact && fund != null && val != null && key === `${fund}_${val}`));

    const rowTotal = (f: FundId) => VALS.reduce((a, v) => a + (counts[cellKey(f, v.id) ?? ''] ?? 0), 0);
    const colTotal = (v: ValId) => FUNDS.reduce((a, f) => a + (counts[cellKey(f.id, v) ?? ''] ?? 0), 0);

    const cellCls = (active: boolean) =>
        `h-9 flex flex-col items-center justify-center rounded-md border text-[10px] leading-tight transition-colors ${
            active
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
        }`;

    return (
        <div className="flex flex-col justify-between h-full">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">PMP Verdict Matrix</span>
                {/* insufficient = no financial statements at all — compact chip in header */}
                <button
                    onClick={() => pickCell('insufficient')}
                    title={VERDICT_LABELS.insufficient}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                        exact === 'insufficient'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium'
                            : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-600'
                    }`}
                >
                    Insufficient data{counts['insufficient'] != null ? ` (${counts['insufficient']})` : ''}
                </button>
            </div>
            <div className="w-full">
                {/* Column headers — click selects the valLevel axis. */}
                <div className="grid grid-cols-[58px_repeat(3,1fr)] gap-1 mb-1">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 self-end pb-0.5">Fund \ Val</span>
                    {VALS.map((v) => {
                        const active = val === v.id;
                        return (
                            <button
                                key={v.id}
                                onClick={() => pickAxis('val', v.id)}
                                title={`All verdicts with valuation ${v.label} (${colTotal(v.id)} tickers)`}
                                className={`text-[10px] font-semibold uppercase tracking-wide text-center rounded px-1 py-0.5 transition-colors flex flex-col sm:flex-row items-center justify-center sm:gap-1 leading-tight ${v.cls} ${active ? 'bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            >
                                <span>{v.label}</span>
                                <span className="text-[9px] font-normal opacity-75">({colTotal(v.id)})</span>
                            </button>
                        );
                    })}
                </div>
                {FUNDS.map((f) => {
                    const rowActive = fund === f.id;
                    return (
                        <div key={f.id} className="grid grid-cols-[58px_repeat(3,1fr)] gap-1 mb-1 last:mb-0">
                            <button
                                onClick={() => pickAxis('fund', f.id)}
                                title={`All verdicts with ${f.label.toLowerCase()} fundamentals (${rowTotal(f.id)} tickers)`}
                                className={`text-[10px] font-semibold uppercase tracking-wide text-left rounded px-1 py-0.5 transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex flex-col justify-center leading-tight ${rowActive ? 'bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-400' : ''}`}
                            >
                                <span>{f.label}</span>
                                <span className="text-[9px] font-normal text-gray-400 dark:text-gray-500">{rowTotal(f.id)}</span>
                            </button>
                            {VALS.map((v) => {
                                const key = cellKey(f.id, v.id);
                                const n = counts[key];
                                return (
                                    <button
                                        key={v.id}
                                        onClick={() => pickCell(key)}
                                        title={VERDICT_LABELS[key as keyof typeof VERDICT_LABELS] ?? key}
                                        className={cellCls(cellActive(key))}
                                    >
                                        <span className="tabular-nums font-semibold text-xs">{n ?? '–'}</span>
                                        <span className="text-[8px] opacity-60 hidden sm:block">{f.id} · {v.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

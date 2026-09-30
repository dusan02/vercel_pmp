/**
 * Financial Snapshot — headline strip above the chart grid.
 *
 * One row of TTM values (Revenue / Operating Income / Net Income / EPS /
 * Operating CF / Free CF) with year-over-year chips. Gives the instant-scan
 * benefit of per-metric cards without six axis-less sparklines; the combined
 * charts below carry the actual trend analysis.
 *
 * TTM uses the shared computeTTM/computeTTMAtDate helpers so the strip is
 * consistent with Key Metrics (unified-source rule in AGENTS.md).
 */

import { computeTTM, computeTTMAtDate } from '@/lib/utils/ttm';
import type { FinancialStatement } from '../types';

export interface Cell {
    label: string;
    main: string;
    suffix: string;
    yoy: number | null;
}

const YEAR_MS = 365 * 86400_000;

function splitCompact(v: number): { main: string; suffix: string } {
    // "$46.4B" → main "46", suffix ".4B" — large digits, small magnitude
    const s = new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
    }).format(v);
    const m = s.match(/^(-?[\d.]+)([KMBT]?)$/);
    if (!m) return { main: s, suffix: '' };
    return { main: m[1]!, suffix: m[2]! };
}

function yoyPct(cur: number | null, prev: number | null): number | null {
    // % change is meaningless across a sign flip (loss→profit) — hide the chip
    if (cur == null || prev == null || prev <= 0 || !isFinite(cur) || !isFinite(prev)) return null;
    return (cur / prev - 1) * 100;
}

function latestShares(stmts: FinancialStatement[], before?: number): number | null {
    for (const s of stmts) {
        const t = new Date(s.endDate).getTime();
        if (before !== undefined && t > before) continue;
        if (s.sharesOutstanding != null && s.sharesOutstanding > 0) return s.sharesOutstanding;
    }
    return null;
}

export function buildSnapshotCells(statements: FinancialStatement[] | undefined): Cell[] | null {
    if (!statements?.length) return null;

    const sorted = [...statements].sort(
        (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ttm = computeTTM(sorted as any);
    if (ttm.revenue == null && ttm.netIncome == null && ttm.operatingCashFlow == null) return null;

    const latestEnd = new Date(sorted[0]!.endDate).getTime();
    const prevCutoff = new Date(latestEnd - YEAR_MS);
    const prevStmts = sorted
        .filter((s) => new Date(s.endDate).getTime() <= prevCutoff.getTime())
        .map((s) => ({ ...s, endDate: new Date(s.endDate) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevTtm = prevStmts.length ? computeTTMAtDate(prevStmts as any, prevCutoff) : null;

    const shares = latestShares(sorted);
    const prevShares = latestShares(sorted, prevCutoff.getTime());
    const fcf = ttm.operatingCashFlow != null && ttm.capex != null
        ? ttm.operatingCashFlow - Math.abs(ttm.capex) : null;
    const prevFcf = prevTtm && prevTtm.operatingCashFlow != null && prevTtm.capex != null
        ? prevTtm.operatingCashFlow - Math.abs(prevTtm.capex) : null;
    const eps = ttm.netIncome != null && shares ? ttm.netIncome / shares : null;
    const prevEps = prevTtm?.netIncome != null && prevShares ? prevTtm.netIncome / prevShares : null;

    const money = (v: number | null, prev: number | null): Cell | null => {
        if (v == null) return null;
        const { main, suffix } = splitCompact(v);
        return { label: '', main, suffix, yoy: yoyPct(v, prev) };
    };

    const defs: Array<[string, number | null, number | null, boolean]> = [
        ['Revenue', ttm.revenue, prevTtm?.revenue ?? null, false],
        ['Op. Income', ttm.ebit, prevTtm?.ebit ?? null, false],
        ['Net Income', ttm.netIncome, prevTtm?.netIncome ?? null, false],
        ['EPS', eps, prevEps, true],
        ['Operating CF', ttm.operatingCashFlow, prevTtm?.operatingCashFlow ?? null, false],
        ['Free CF', fcf, prevFcf, false],
    ];

    const cells: Cell[] = defs.flatMap(([label, cur, prev, isPerShare]) => {
        if (cur == null) return [];
        if (isPerShare) {
            const cents = Math.abs(cur) < 10 ? 2 : 1;
            return [{ label, main: cur.toFixed(cents), suffix: '', yoy: yoyPct(cur, prev) }];
        }
        const cell = money(cur, prev);
        return cell ? [{ ...cell, label }] : [];
    });

    return cells.length ? cells : null;
}

export function FinancialSnapshot({ statements }: { statements: FinancialStatement[] }) {
    const cells = buildSnapshotCells(statements);
    if (!cells) return null;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {cells.map((c) => (
                <div
                    key={c.label}
                    className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3"
                >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 dark:text-gray-400 truncate">
                            {c.label}
                        </span>
                        {c.yoy != null && (
                            <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${
                                    c.yoy > 0
                                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                        : c.yoy < 0
                                          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                          : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:border-gray-600'
                                }`}
                            >
                                {c.yoy > 0 ? '+' : ''}{c.yoy.toFixed(0)}%
                            </span>
                        )}
                    </div>
                    <div className="leading-none">
                        <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            {c.main}
                        </span>
                        {c.suffix && (
                            <span className="text-sm font-semibold text-blue-500 dark:text-blue-400 ml-0.5">
                                {c.suffix}
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">TTM</div>
                </div>
            ))}
        </div>
    );
}

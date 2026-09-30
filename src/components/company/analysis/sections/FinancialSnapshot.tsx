/**
 * TTM Snapshot cells — headline strip at the top of Key Metrics.
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

'use client';

import { useEffect, useRef, useState } from 'react';
import SankeyChart, { SankeyNode, SankeyLink, sankeyViewBoxWidth } from '@/components/charts/SankeyChart';

export interface FlowPeriod {
    label: string;
    revenue: number | null;
    grossProfit: number | null;
    ebit: number | null;
    netIncome: number | null;
    ocf: number | null;
    capex: number | null;
    sbc: number | null;
    sharesOutstanding?: number | null;
    totalAssets?: number | null;
    totalLiabilities?: number | null;
    currentAssets?: number | null;
    currentLiabilities?: number | null;
    retainedEarnings?: number | null;
    totalEquity?: number | null;
    totalDebt?: number | null;
    cashAndEquivalents?: number | null;
    netPPE?: number | null;
}

const C = {
    revenue: '#3b82f6',   // blue-500
    cogs: '#94a3b8',      // slate-400
    grossProfit: '#10b981', // emerald-500
    opex: '#f43f5e',      // rose-500
    ebit: '#059669',      // emerald-600
    intTax: '#fb7185',    // rose-400
    netIncome: '#047857', // emerald-700
    loss: '#e11d48',      // rose-600
    ocf: '#3b82f6',
    capex: '#f59e0b',     // amber-500
    fcf: '#10b981',
    sbc: '#8b5cf6',       // violet-500
    trueFcf: '#047857',
    // balance sheet
    cash: '#38bdf8',      // sky-400
    otherAsset: '#93c5fd',// blue-300
    ppe: '#34d399',       // emerald-400
    ltAssets: '#059669',  // emerald-600
    totalAssets: '#1d4ed8',// blue-700
    liab: '#e11d48',      // rose-600
    ltLiab: '#f43f5e',    // rose-500
    debt: '#be123c',      // rose-700
    otherLiab: '#fda4af', // rose-300
    equity: '#047857',    // emerald-700
    otherEq: '#6ee7b7',   // emerald-300
};

function fmt$(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
}

function pctOf(v: number | null, base: number | null): string | undefined {
    if (v == null || base == null || base <= 0) return undefined;
    return `${((v / base) * 100).toFixed(1)}%`;
}

interface FlowSpec { columns: SankeyNode[][]; links: SankeyLink[]; total: number }

function buildIncome(p: FlowPeriod): FlowSpec | null {
    const R = p.revenue ?? 0;
    const ni = p.netIncome;
    if (R <= 0 || ni == null) return null;
    const gp = p.grossProfit;
    const ebit = p.ebit ?? ni;

    const revenueNode: SankeyNode = { id: 'rev', label: 'Revenue', value: R, color: C.revenue };
    const links: SankeyLink[] = [];

    if (gp != null && gp > 0 && gp < R * 1.5) {
        // Full 4-column: Revenue → [COGS, GP] → [OpEx, EBIT] → [IntTax, NI]
        const cogs = Math.max(0, R - gp);
        const opex = Math.max(0, gp - ebit);
        const columns: SankeyNode[][] = [
            [revenueNode],
            [
                { id: 'cogs', label: 'COGS', value: cogs, color: C.cogs, sub: pctOf(cogs, R) },
                { id: 'gp', label: 'Gross Profit', value: gp, color: C.grossProfit, sub: pctOf(gp, R) },
            ],
            [],
            [],
        ];
        links.push({ from: 'rev', to: 'cogs', value: cogs }, { from: 'rev', to: 'gp', value: gp });

        if (ebit >= 0) {
            columns[2] = [
                { id: 'opex', label: 'Operating Exp.', value: opex, color: C.opex, sub: pctOf(opex, R) },
                { id: 'ebit', label: 'EBIT', value: ebit, color: C.ebit, sub: pctOf(ebit, R) },
            ];
            links.push({ from: 'gp', to: 'opex', value: opex }, { from: 'gp', to: 'ebit', value: ebit });
            if (ni >= 0) {
                const intTax = Math.max(0, ebit - ni);
                columns[3] = [
                    { id: 'inttax', label: 'Interest + Tax', value: intTax, color: C.intTax, sub: pctOf(intTax, R) },
                    { id: 'ni', label: 'Net Income', value: ni, color: C.netIncome, sub: pctOf(ni, R) },
                ];
                links.push({ from: 'ebit', to: 'inttax', value: intTax }, { from: 'ebit', to: 'ni', value: ni });
            } else {
                columns[3] = [
                    { id: 'nl', label: 'Net Loss', value: Math.abs(ni), color: C.loss },
                ];
                links.push({ from: 'ebit', to: 'nl', value: Math.min(ebit, Math.abs(ni)) });
            }
        } else {
            // Operating loss — gross profit consumed by OpEx + loss
            const oploss = Math.abs(ebit);
            columns[2] = [
                { id: 'opex', label: 'Operating Exp.', value: opex, color: C.opex, sub: pctOf(opex, R) },
                { id: 'opl', label: 'Operating Loss', value: oploss, color: C.loss },
            ];
            links.push({ from: 'gp', to: 'opex', value: opex }, { from: 'gp', to: 'opl', value: Math.min(gp, oploss) });
        }
        return { columns: columns.filter((c) => c.length > 0), links, total: R };
    }

    // Fallback without gross profit: Revenue → [Costs, EBIT] → [IntTax, NI]
    const costs = Math.max(0, R - ebit);
    const columns: SankeyNode[][] = [
        [revenueNode],
        [
            { id: 'costs', label: 'Total Costs', value: costs, color: C.cogs, sub: pctOf(costs, R) },
            { id: 'ebit', label: 'EBIT', value: Math.max(0, ebit), color: ebit >= 0 ? C.ebit : C.loss, sub: pctOf(ebit, R) },
        ],
        [],
    ];
    links.push({ from: 'rev', to: 'costs', value: costs }, { from: 'rev', to: 'ebit', value: Math.max(0, ebit) });
    if (ebit >= 0 && ni >= 0) {
        const intTax = Math.max(0, ebit - ni);
        columns[2] = [
            { id: 'inttax', label: 'Interest + Tax', value: intTax, color: C.intTax, sub: pctOf(intTax, R) },
            { id: 'ni', label: 'Net Income', value: ni, color: C.netIncome, sub: pctOf(ni, R) },
        ];
        links.push({ from: 'ebit', to: 'inttax', value: intTax }, { from: 'ebit', to: 'ni', value: ni });
    } else if (ni < 0) {
        columns[2] = [{ id: 'nl', label: 'Net Loss', value: Math.abs(ni), color: C.loss }];
        if (ebit > 0) links.push({ from: 'ebit', to: 'nl', value: Math.min(ebit, Math.abs(ni)) });
    }
    return { columns: columns.filter((c) => c.length > 0), links, total: R };
}

function buildCashFlow(p: FlowPeriod): FlowSpec | null {
    const ocf = p.ocf;
    const capex = p.capex;
    if (ocf == null || ocf <= 0 || capex == null) return null;
    const cx = Math.abs(capex);
    const fcf = ocf - cx;
    const sbc = p.sbc != null && p.sbc > 0 ? p.sbc : null;

    const columns: SankeyNode[][] = [
        [{ id: 'ocf', label: 'Operating CF', value: ocf, color: C.ocf }],
        [
            { id: 'capex', label: 'CapEx', value: cx, color: C.capex, sub: pctOf(cx, ocf) },
            {
                id: 'fcf', label: fcf >= 0 ? 'Free Cash Flow' : 'Negative FCF',
                value: Math.abs(fcf), color: fcf >= 0 ? C.fcf : C.loss, sub: pctOf(fcf, ocf),
            },
        ],
        [],
    ];
    const links: SankeyLink[] = [
        { from: 'ocf', to: 'capex', value: cx },
        { from: 'ocf', to: 'fcf', value: Math.abs(fcf) },
    ];

    if (fcf > 0 && sbc != null) {
        const trueFcf = fcf - sbc;
        columns[2] = [
            { id: 'sbc', label: 'Stock Comp.', value: sbc, color: C.sbc, sub: pctOf(sbc, ocf) },
            {
                id: 'tfcf', label: trueFcf >= 0 ? 'True FCF' : 'True FCF (neg.)',
                value: Math.abs(trueFcf), color: trueFcf >= 0 ? C.trueFcf : C.loss, sub: pctOf(trueFcf, ocf),
            },
        ];
        links.push({ from: 'fcf', to: 'sbc', value: Math.min(fcf, sbc) });
        if (trueFcf > 0) links.push({ from: 'fcf', to: 'tfcf', value: trueFcf });
    }
    return { columns: columns.filter((c) => c.length > 0), links, total: ocf };
}

function buildBalanceSheet(p: FlowPeriod): FlowSpec | null {
    const A = p.totalAssets;
    if (A == null || A <= 0) return null;
    const L = p.totalLiabilities ?? (p.totalEquity != null ? A - p.totalEquity : null);
    const E = p.totalEquity ?? (L != null ? A - L : null);
    if (L == null || E == null || L < 0) return null;

    const pos = (v: number | null | undefined) => (v != null && isFinite(v) && v > 0 ? v : 0);
    const sub = (v: number) => pctOf(v, A);
    const links: SankeyLink[] = [];

    // --- left side: asset components → [Current/LT Assets] → Total Assets
    const leaves: SankeyNode[] = [];
    const midAssets: SankeyNode[] = [];
    const ca = p.currentAssets;
    const cash = pos(p.cashAndEquivalents);
    const ppe = pos(p.netPPE);
    const leaf = (id: string, label: string, value: number, color: string, to: string, linkValue = value) => {
        leaves.push({ id, label, value, color, sub: sub(value) });
        links.push({ from: id, to, value: linkValue });
    };

    if (ca != null && ca > 0 && ca <= A) {
        const otherCA = Math.max(0, ca - cash);
        const lta = Math.max(0, A - ca);
        const otherLTA = Math.max(0, lta - ppe);
        if (cash > 0) leaf('cash', 'Cash & Equiv.', cash, C.cash, 'ca');
        if (otherCA > 0) leaf('oca', 'Other Current Assets', otherCA, C.otherAsset, 'ca');
        if (ppe > 0 && lta > 0) leaf('ppe', 'Net PP&E', ppe, C.ppe, 'lta', Math.min(ppe, lta));
        if (otherLTA > 0) leaf('olta', 'Other LT Assets', otherLTA, C.otherAsset, 'lta');
        midAssets.push({ id: 'ca', label: 'Current Assets', value: ca, color: C.revenue, sub: sub(ca) });
        if (lta > 0) midAssets.push({ id: 'lta', label: 'Long-Term Assets', value: lta, color: C.ltAssets, sub: sub(lta) });
        links.push({ from: 'ca', to: 'assets', value: ca });
        if (lta > 0) links.push({ from: 'lta', to: 'assets', value: lta });
    } else {
        // No current/long-term split — direct leaves into Total Assets
        if (cash > 0) leaf('cash', 'Cash & Equiv.', cash, C.cash, 'assets');
        if (ppe > 0) leaf('ppe', 'Net PP&E', ppe, C.ppe, 'assets');
        const other = Math.max(0, A - cash - ppe);
        if (other > 0) leaf('oa', 'Other Assets', other, C.otherAsset, 'assets');
    }

    // --- right side: Total Assets → Liabilities + Equity → components
    const right: SankeyNode[] = [];
    const children: SankeyNode[] = [];
    const debtChildren: SankeyNode[] = [];

    if (L > 0) {
        right.push({ id: 'liab', label: 'Total Liabilities', value: L, color: C.liab, sub: sub(L) });
        links.push({ from: 'assets', to: 'liab', value: L });
        const cl = p.currentLiabilities;
        if (cl != null && cl > 0 && cl <= L) {
            children.push({ id: 'cl', label: 'Current Liabilities', value: cl, color: C.intTax, sub: sub(cl) });
            links.push({ from: 'liab', to: 'cl', value: cl });
            const ltl = Math.max(0, L - cl);
            if (ltl > 0) {
                children.push({ id: 'ltl', label: 'LT Liabilities', value: ltl, color: C.ltLiab, sub: sub(ltl) });
                links.push({ from: 'liab', to: 'ltl', value: ltl });
                const d = Math.min(pos(p.totalDebt), ltl);
                const otherLTL = Math.max(0, ltl - d);
                if (d > 0) {
                    debtChildren.push({ id: 'debt', label: 'Total Debt', value: d, color: C.debt, sub: sub(d) });
                    links.push({ from: 'ltl', to: 'debt', value: d });
                }
                if (otherLTL > 0) {
                    debtChildren.push({ id: 'oltl', label: 'Other LT Liab.', value: otherLTL, color: C.otherLiab, sub: sub(otherLTL) });
                    links.push({ from: 'ltl', to: 'oltl', value: otherLTL });
                }
            }
        }
    }
    if (E > 0) {
        right.push({ id: 'eq', label: 'Total Equity', value: E, color: C.equity, sub: sub(E) });
        links.push({ from: 'assets', to: 'eq', value: E });
        const re = p.retainedEarnings;
        if (re != null && re > 0) {
            const rv = Math.min(re, E);
            children.push({ id: 're', label: 'Retained Earnings', value: rv, color: C.ebit, sub: sub(rv) });
            links.push({ from: 'eq', to: 're', value: rv });
            const otherEq = Math.max(0, E - rv);
            if (otherEq > 0) {
                children.push({ id: 'oeq', label: 'Other Equity', value: otherEq, color: C.otherEq, sub: sub(otherEq) });
                links.push({ from: 'eq', to: 'oeq', value: otherEq });
            }
        } else {
            // Accumulated deficit (or no RE data) — deficit shown as a
            // detached marker: it reduces equity rather than flowing out of it
            const otherEq = re != null && re < 0 ? E + Math.abs(re) : E;
            if (re != null && re < 0) {
                children.push({ id: 'adef', label: 'Accumulated Deficit', value: Math.abs(re), color: C.loss, sub: sub(Math.abs(re)) });
            }
            if (otherEq > 0) {
                children.push({ id: 'oeq', label: re != null && re < 0 ? 'Paid-in & Other Equity' : 'Common Equity', value: otherEq, color: C.otherEq, sub: sub(otherEq) });
                links.push({ from: 'eq', to: 'oeq', value: Math.min(otherEq, E) });
            }
        }
    } else if (E < 0) {
        right.push({ id: 'eq', label: 'Negative Equity', value: Math.abs(E), color: C.loss, sub: sub(Math.abs(E)) });
    }

    const columns: SankeyNode[][] = [
        leaves,
        midAssets,
        [{ id: 'assets', label: 'Total Assets', value: A, color: C.totalAssets }],
        right,
        children,
        debtChildren,
    ].filter((c) => c.length > 0);

    return { columns, links, total: A };
}

const KINDS = {
    income: { title: 'Income Statement Flow', build: buildIncome },
    cashflow: { title: 'Cash Flow', build: buildCashFlow },
    balance: { title: 'Balance Sheet Breakdown', build: buildBalanceSheet },
} as const;

export type FlowKind = keyof typeof KINDS;

/**
 * Single sankey cell for the paired charts grid — same data/toggle logic as
 * the old FinancialFlows section, but rendered as one ChartSection-sized card
 * so it can sit next to its matching history bar chart.
 */
export function SankeyCell({ kind, annual, quarterly }: { kind: FlowKind; annual: FlowPeriod | null; quarterly: FlowPeriod | null }) {
    const [period, setPeriod] = useState<FlowPeriod | null>(annual ?? quarterly);
    const boxRef = useRef<HTMLDivElement>(null);
    const [slot, setSlot] = useState<{ w: number; h: number } | null>(null);
    const [overflows, setOverflows] = useState(false);
    // The card is grid-stretched to the paired bar chart's height — measure
    // the real leftover slot so the sankey fills it instead of leaving a
    // dead band under a fixed-height SVG.
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r && r.height >= 200 && r.width > 0) setSlot({ w: r.width, h: r.height });
            setOverflows(el.scrollWidth > el.clientWidth + 4);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    if (!period) return <p className="text-sm text-gray-500 dark:text-gray-500 italic py-8 text-center">No data</p>;
    const spec = KINDS[kind].build(period);
    if (!spec) return <p className="text-sm text-gray-500 dark:text-gray-500 italic py-8 text-center">No data</p>;
    // SVG is w-full h-auto → displayed height = svgW * viewH / viewW. Solve
    // viewH so the rendered diagram exactly fills the measured slot height.
    const viewW = sankeyViewBoxWidth(spec.columns.length);
    const svgW = slot ? Math.max(480, slot.w) : viewW;
    const chartH = slot ? Math.max(240, Math.floor(slot.h * (viewW / svgW))) : 300;
    return (
        <div className="h-full flex flex-col">
            {annual && quarterly && (
                <div className="flex gap-1.5 mb-3 shrink-0">
                    {[annual, quarterly].map((p) => (
                        <button
                            key={p!.label}
                            onClick={() => setPeriod(p)}
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${period === p
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                        >
                            {p!.label}
                        </button>
                    ))}
                </div>
            )}
            <div className="relative flex-1 min-h-[240px]">
                <div ref={boxRef} className="h-full overflow-x-auto">
                    <SankeyChart columns={spec.columns} links={spec.links} total={spec.total} formatValue={fmt$} height={chartH} />
                </div>
                {overflows && (
                    <div className="absolute inset-y-0 right-0 w-14 pointer-events-none bg-gradient-to-l from-white dark:from-gray-800 to-transparent flex items-center justify-end pr-1.5">
                        <span className="text-gray-400 text-sm leading-none">→</span>
                    </div>
                )}
            </div>
        </div>
    );
}

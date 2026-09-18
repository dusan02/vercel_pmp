'use client';

import { useState } from 'react';
import SankeyChart, { SankeyNode, SankeyLink } from '@/components/charts/SankeyChart';

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

export function FinancialFlowsClient({ annual, quarterly, shareChangeYoY }: { annual: FlowPeriod | null; quarterly: FlowPeriod | null; shareChangeYoY?: number | null }) {
    const [period, setPeriod] = useState<FlowPeriod | null>(annual ?? quarterly);
    if (!period) return null;

    const income = buildIncome(period);
    const cash = buildCashFlow(period);

    const margins: { label: string; value: string | undefined }[] = [
        { label: 'Gross margin', value: pctOf(period.grossProfit, period.revenue) },
        { label: 'Operating margin', value: pctOf(period.ebit, period.revenue) },
        { label: 'Net margin', value: pctOf(period.netIncome, period.revenue) },
        { label: 'FCF margin', value: pctOf(period.ocf != null && period.capex != null ? period.ocf - Math.abs(period.capex) : null, period.revenue) },
        { label: 'True FCF margin', value: pctOf(period.ocf != null && period.capex != null ? period.ocf - Math.abs(period.capex) - (period.sbc ?? 0) : null, period.revenue) },
        { label: 'Capex / Revenue', value: pctOf(period.capex != null ? Math.abs(period.capex) : null, period.revenue) },
        { label: 'SBC / Revenue', value: pctOf(period.sbc, period.revenue) },
        {
            label: 'Shares YoY',
            value: shareChangeYoY != null
                ? `${shareChangeYoY >= 0 ? '+' : ''}${(shareChangeYoY * 100).toFixed(1)}%${shareChangeYoY > 0 ? ' (dilution)' : ' (buyback)'}`
                : undefined,
        },
    ].filter((m) => m.value != null);

    return (
        <div>
            {(annual && quarterly) && (
                <div className="flex gap-2 mb-4">
                    {[annual, quarterly].map((p) => (
                        <button
                            key={p!.label}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${period === p
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}
                        >
                            {p!.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-col gap-8">
                {income && (
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                            Income statement — {period.label}
                        </h3>
                        <div className="overflow-x-auto">
                            <SankeyChart columns={income.columns} links={income.links} total={income.total} formatValue={fmt$} height={280} />
                        </div>
                    </div>
                )}
                {cash && (
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                            Cash flow — {period.label}
                        </h3>
                        <div className="overflow-x-auto">
                            <SankeyChart columns={cash.columns} links={cash.links} total={cash.total} formatValue={fmt$} height={280} />
                        </div>
                    </div>
                )}
            </div>

            {margins.length > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {margins.map((m) => (
                        <span key={m.label} className="text-xs text-gray-500 dark:text-gray-400">
                            {m.label}: <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{m.value}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

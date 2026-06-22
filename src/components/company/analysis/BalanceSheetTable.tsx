import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { MetricCard, MetricCardDef, StatusBadge, StatusType } from '../shared/MetricCard';

interface BalanceSheetTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

function fmt(val: number | null | undefined, suffix = '', decimals = 2): string {
    if (val === null || val === undefined) return 'N/A';
    return `${val.toFixed(decimals)}${suffix}`;
}

function fmtB(val: number | null | undefined): string {
    if (val === null || val === undefined) return 'N/A';
    const absVal = Math.abs(val);
    if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(0)}`;
}

function ratioStatus(val: number | null | undefined, goodBelow: number, warnBelow: number): StatusType {
    if (val === null || val === undefined) return 'neutral';
    return val <= goodBelow ? 'good' : val <= warnBelow ? 'warn' : 'bad';
}

function ratioStatusAbove(val: number | null | undefined, goodAbove: number, warnAbove: number): StatusType {
    if (val === null || val === undefined) return 'neutral';
    return val >= goodAbove ? 'good' : val >= warnAbove ? 'warn' : 'bad';
}

// ─── Piotroski Gauge ─────────────────────────────────────────────
function PiotroskiGauge({ score, ticker, compareScore, compareWith }: {
    score: number | null | undefined;
    ticker: string;
    compareScore?: number | null | undefined;
    compareWith?: string | undefined;
}) {
    const s = score ?? 0;
    const color = s >= 7 ? 'green' : s >= 4 ? 'yellow' : 'red';
    const colorMap = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };
    const textMap = { green: 'text-green-600 dark:text-green-400', yellow: 'text-yellow-600 dark:text-yellow-400', red: 'text-red-600 dark:text-red-400' };
    const labelMap = { green: 'Strong', yellow: 'Average', red: 'Weak' };

    return (
        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700" title="Piotroski F-Score (0-9): financial strength. 7+ = Strong, 0-3 = Weak.">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500">Piotroski F-Score</span>
                <StatusBadge label={labelMap[color]} type={color === 'green' ? 'good' : color === 'yellow' ? 'warn' : 'bad'} />
            </div>
            <div className="flex items-center gap-3 mb-2">
                <span className={`text-2xl font-bold ${textMap[color]}`}>{score ?? 'N/A'}<span className="text-sm font-normal text-gray-400">/9</span></span>
                {compareWith && compareScore !== null && compareScore !== undefined && (
                    <span className="text-sm text-gray-400 border-l dark:border-gray-700 pl-3">
                        {compareWith}: <span className="font-bold text-gray-600 dark:text-gray-300">{compareScore}/9</span>
                    </span>
                )}
            </div>
            <div className="flex gap-0.5">
                {Array.from({ length: 9 }, (_, i) => (
                    <div
                        key={i}
                        className={`h-2 flex-1 rounded-sm transition-colors ${i < s ? colorMap[color] : 'bg-gray-200 dark:bg-gray-700'}`}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Inline Metric Row ───────────────────────────────────────────
function MetricRow({ label, hint, value, status, statusLabel, secondaryValue, compareWith }: {
    label: string;
    hint: string;
    value: string;
    status: StatusType;
    statusLabel: string;
    secondaryValue?: string | undefined;
    compareWith?: string | undefined;
}) {
    return (
        <div className="flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-700" title={hint}>
            <div className="min-w-0">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                {compareWith && secondaryValue !== undefined && (
                    <span className="text-xs text-gray-400 border-r dark:border-gray-700 pr-3">
                        {compareWith}: <span className="font-semibold text-gray-500 dark:text-gray-400">{secondaryValue}</span>
                    </span>
                )}
                <span className="text-base font-bold text-gray-900 dark:text-white font-mono">{value}</span>
                {statusLabel && <StatusBadge label={statusLabel} type={status} />}
            </div>
        </div>
    );
}

// ─── Section Divider ─────────────────────────────────────────────
function SectionTitle({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-2 pt-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────
export function BalanceSheetTable({ ticker, data, compareWith, secondaryData }: BalanceSheetTableProps) {
    const bs = data.balanceSheet;
    const sbs = secondaryData?.balanceSheet;

    if (!bs) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center text-gray-400 text-sm">
                Balance sheet data not available. Run Deep Analysis first.
            </div>
        );
    }

    // ── Ratio Cards ──
    const ratioCards: MetricCardDef[] = [
        {
            label: 'Debt / Equity', hint: 'Total Debt / Total Equity. < 0.5 is conservative, > 2 is leveraged.',
            value: fmt(bs.debtToEquity, 'x'), secondaryValue: compareWith ? fmt(sbs?.debtToEquity, 'x') : undefined,
            statusType: ratioStatus(bs.debtToEquity, 0.5, 2),
            statusLabel: bs.debtToEquity !== null ? (bs.debtToEquity <= 0.5 ? 'Conservative' : bs.debtToEquity <= 2 ? 'Moderate' : 'High Leverage') : 'N/A',
        },
        {
            label: 'Net Debt / EBIT', hint: 'Net Debt / EBIT. < 2x is healthy, > 4x is risky.',
            value: fmt(bs.netDebtToEbit, 'x'), secondaryValue: compareWith ? fmt(sbs?.netDebtToEbit, 'x') : undefined,
            statusType: ratioStatus(bs.netDebtToEbit, 2, 4),
            statusLabel: bs.netDebtToEbit !== null ? (bs.netDebtToEbit <= 2 ? 'Healthy' : bs.netDebtToEbit <= 4 ? 'Elevated' : 'High') : 'N/A',
        },
        {
            label: 'Current Ratio', hint: 'Current Assets / Current Liabilities. > 2 is strong, < 1 is risky.',
            value: fmt(bs.currentRatio, 'x'), secondaryValue: compareWith ? fmt(sbs?.currentRatio, 'x') : undefined,
            statusType: ratioStatusAbove(bs.currentRatio, 2, 1),
            statusLabel: bs.currentRatio !== null ? (bs.currentRatio >= 2 ? 'Strong' : bs.currentRatio >= 1 ? 'Adequate' : 'Weak') : 'N/A',
        },
        {
            label: 'Asset / Liability', hint: 'Total Assets / Total Liabilities. > 2 = assets comfortably cover liabilities.',
            value: fmt(bs.assetToLiability, 'x'), secondaryValue: compareWith ? fmt(sbs?.assetToLiability, 'x') : undefined,
            statusType: ratioStatusAbove(bs.assetToLiability, 2, 1),
            statusLabel: bs.assetToLiability !== null ? (bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky') : 'N/A',
        },
    ];

    // ── Absolute Value Cards ──
    const netDebtStatus: StatusType = bs.netDebt !== null ? (bs.netDebt < 0 ? 'good' : 'neutral') : 'neutral';
    const absoluteCards: MetricCardDef[] = [
        { label: 'Total Debt', hint: 'Total debt obligations (short + long term).', value: fmtB(bs.totalDebt), secondaryValue: compareWith ? fmtB(sbs?.totalDebt) : undefined, statusType: 'neutral', statusLabel: '' },
        { label: 'Net Debt', hint: 'Total Debt minus Cash. Negative = Net Cash position.', value: fmtB(bs.netDebt), secondaryValue: compareWith ? fmtB(sbs?.netDebt) : undefined, statusType: netDebtStatus, statusLabel: bs.netDebt !== null && bs.netDebt < 0 ? 'Net Cash' : '' },
        { label: 'Cash & Equivalents', hint: 'Cash and short-term investments on the balance sheet.', value: fmtB(bs.cash), secondaryValue: compareWith ? fmtB(sbs?.cash) : undefined, statusType: 'neutral', statusLabel: '' },
        { label: 'Total Equity', hint: "Shareholders' equity (book value).", value: fmtB(bs.totalEquity), secondaryValue: compareWith ? fmtB(sbs?.totalEquity) : undefined, statusType: 'neutral', statusLabel: '' },
    ];

    // ── Beneish M-Score ──
    const bScore = data.beneishScore;
    const bScoreSec = secondaryData?.beneishScore;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-3">
                <div className="p-1.5 sm:p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4l-2 16M14 4l-2 16" />
                    </svg>
                </div>
                <div>
                    <h4 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Balance Sheet Insights</h4>
                    <p className="text-xs text-gray-400">Based on latest annual financial statement</p>
                </div>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
                {/* Ratio Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {ratioCards.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/40" />)}
                </div>

                {/* Absolute Values */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {absoluteCards.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/40" />)}
                </div>

                {/* ── Health & Quality ── */}
                <SectionTitle title="Health & Quality" />
                <div className="space-y-0">
                    <PiotroskiGauge
                        score={data.piotroskiScore}
                        ticker={ticker}
                        compareScore={compareWith ? secondaryData?.piotroskiScore : undefined}
                        compareWith={compareWith || undefined}
                    />
                    <MetricRow
                        label="Beneish M-Score"
                        hint="Detects earnings manipulation. Below -2.22 = Safe, above -1.78 = Risk."
                        value={bScore !== null && bScore !== undefined ? bScore.toFixed(2) : 'N/A'}
                        status={bScore !== null && bScore !== undefined ? (bScore < -2.22 ? 'good' : bScore < -1.78 ? 'warn' : 'bad') : 'neutral'}
                        statusLabel={bScore !== null && bScore !== undefined ? (bScore < -2.22 ? 'Unlikely' : bScore < -1.78 ? 'Caution' : 'Risk') : 'N/A'}
                        secondaryValue={compareWith && bScoreSec !== null && bScoreSec !== undefined ? bScoreSec.toFixed(2) : undefined}
                        compareWith={compareWith || undefined}
                    />
                </div>
            </div>
        </div>
    );
}

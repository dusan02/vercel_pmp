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

function pctStatus(val: number | null | undefined): StatusType {
    if (val === null || val === undefined) return 'neutral';
    return val > 10 ? 'good' : val > 0 ? 'warn' : 'bad';
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
            value: fmt(bs.netDebtToEbitda, 'x'), secondaryValue: compareWith ? fmt(sbs?.netDebtToEbitda, 'x') : undefined,
            statusType: ratioStatus(bs.netDebtToEbitda, 2, 4),
            statusLabel: bs.netDebtToEbitda !== null ? (bs.netDebtToEbitda <= 2 ? 'Healthy' : bs.netDebtToEbitda <= 4 ? 'Elevated' : 'High') : 'N/A',
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

    // ── Growth Cards ──
    const growthCards: MetricCardDef[] = [
        {
            label: 'Revenue CAGR (5Y)', hint: 'Compound annual growth rate of revenue over 5 years.',
            value: data.revenueCagr !== null && data.revenueCagr !== undefined ? `${data.revenueCagr.toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith && secondaryData?.revenueCagr !== null && secondaryData?.revenueCagr !== undefined ? `${secondaryData.revenueCagr.toFixed(1)}%` : undefined,
            statusType: pctStatus(data.revenueCagr), statusLabel: data.revenueCagr !== null && data.revenueCagr !== undefined ? (data.revenueCagr > 10 ? 'Strong' : data.revenueCagr > 0 ? 'Moderate' : 'Declining') : 'N/A',
        },
        {
            label: 'Net Income CAGR (5Y)', hint: 'Compound annual growth rate of net income over 5 years.',
            value: data.netIncomeCagr !== null && data.netIncomeCagr !== undefined ? `${data.netIncomeCagr.toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith && secondaryData?.netIncomeCagr !== null && secondaryData?.netIncomeCagr !== undefined ? `${secondaryData.netIncomeCagr.toFixed(1)}%` : undefined,
            statusType: pctStatus(data.netIncomeCagr), statusLabel: data.netIncomeCagr !== null && data.netIncomeCagr !== undefined ? (data.netIncomeCagr > 10 ? 'Strong' : data.netIncomeCagr > 0 ? 'Moderate' : 'Declining') : 'N/A',
        },
    ];

    // ── Valuation Cards ──
    const fcfY = data.metrics?.fcfYield;
    const fcfYSec = secondaryData?.metrics?.fcfYield;
    const valuationCards: MetricCardDef[] = [
        {
            label: 'FCF Yield', hint: 'Free Cash Flow / Market Cap. Higher = better value.',
            value: fcfY !== null && fcfY !== undefined ? `${(fcfY * 100).toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith && fcfYSec !== null && fcfYSec !== undefined ? `${(fcfYSec * 100).toFixed(1)}%` : undefined,
            statusType: fcfY !== null && fcfY !== undefined ? (fcfY > 0.05 ? 'good' : fcfY > 0.02 ? 'warn' : 'bad') : 'neutral',
            statusLabel: fcfY !== null && fcfY !== undefined ? (fcfY > 0.05 ? 'Attractive' : fcfY > 0.02 ? 'Fair' : 'Expensive') : 'N/A',
        },
        {
            label: 'P/E Ratio', hint: 'Price to Earnings ratio.',
            value: data.metrics?.currentPe !== null && data.metrics?.currentPe !== undefined ? `${data.metrics.currentPe.toFixed(1)}x` : 'N/A',
            secondaryValue: compareWith && secondaryData?.metrics?.currentPe !== null && secondaryData?.metrics?.currentPe !== undefined ? `${secondaryData.metrics.currentPe.toFixed(1)}x` : undefined,
            statusType: 'neutral', statusLabel: '',
        },
    ];

    // ── Dilution & SBC Cards ──
    const dilutionCards: MetricCardDef[] = [];
    if (bs.dilution1y !== null && bs.dilution1y !== undefined) {
        dilutionCards.push({
            label: '1Y Share Dilution', hint: 'Change in shares outstanding over 1 year. Negative = buyback.',
            value: `${bs.dilution1y.toFixed(1)}%`,
            secondaryValue: compareWith && sbs?.dilution1y !== null && sbs?.dilution1y !== undefined ? `${sbs.dilution1y.toFixed(1)}%` : undefined,
            statusType: bs.dilution1y <= -0.5 ? 'good' : bs.dilution1y <= 1 ? 'warn' : 'bad',
            statusLabel: bs.dilution1y < 0 ? 'Buyback' : bs.dilution1y <= 1 ? 'Stable' : 'Diluting',
        });
    }
    if (bs.dilution5y !== null && bs.dilution5y !== undefined) {
        dilutionCards.push({
            label: '5Y Share Dilution', hint: 'Cumulative change in shares outstanding over 5 years.',
            value: `${bs.dilution5y.toFixed(1)}%`,
            secondaryValue: compareWith && sbs?.dilution5y !== null && sbs?.dilution5y !== undefined ? `${sbs.dilution5y.toFixed(1)}%` : undefined,
            statusType: bs.dilution5y <= -2 ? 'good' : bs.dilution5y <= 5 ? 'warn' : 'bad',
            statusLabel: bs.dilution5y < 0 ? 'Buyback' : bs.dilution5y <= 5 ? 'Moderate' : 'Heavy Dilution',
        });
    }
    if (bs.sbcRatio !== null && bs.sbcRatio !== undefined) {
        dilutionCards.push({
            label: 'SBC / Net Income', hint: 'Stock-based compensation as % of net income. High = quality concern.',
            value: `${bs.sbcRatio.toFixed(1)}%`,
            secondaryValue: compareWith && sbs?.sbcRatio !== null && sbs?.sbcRatio !== undefined ? `${sbs.sbcRatio.toFixed(1)}%` : undefined,
            statusType: bs.sbcRatio <= 10 ? 'good' : bs.sbcRatio <= 25 ? 'warn' : 'bad',
            statusLabel: bs.sbcRatio <= 10 ? 'Low' : bs.sbcRatio <= 25 ? 'Moderate' : 'High',
        });
    }

    // ── Beneish & Interest Coverage ──
    const bScore = data.beneishScore;
    const bScoreSec = secondaryData?.beneishScore;
    const ic = data.interestCoverage;
    const icSec = secondaryData?.interestCoverage;

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
                    <MetricRow
                        label="Interest Coverage"
                        hint="EBIT / Interest Expense. > 5x is strong, < 2x is risky."
                        value={ic !== null && ic !== undefined ? `${ic.toFixed(1)}x` : 'N/A'}
                        status={ic !== null && ic !== undefined ? (ic > 5 ? 'good' : ic > 2 ? 'warn' : 'bad') : 'neutral'}
                        statusLabel={ic !== null && ic !== undefined ? (ic > 5 ? 'Strong' : ic > 2 ? 'Adequate' : 'Weak') : 'N/A'}
                        secondaryValue={compareWith && icSec !== null && icSec !== undefined ? `${icSec.toFixed(1)}x` : undefined}
                        compareWith={compareWith || undefined}
                    />
                </div>

                {/* ── Growth Trajectory ── */}
                <SectionTitle title="Growth Trajectory" />
                <div className="grid grid-cols-2 gap-3">
                    {growthCards.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/40" />)}
                </div>

                {/* ── Valuation ── */}
                <SectionTitle title="Valuation" />
                <div className="grid grid-cols-2 gap-3">
                    {valuationCards.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/40" />)}
                </div>
                {data.humanPeInfo && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium -mt-3">{data.humanPeInfo}</p>
                )}
                {compareWith && secondaryData?.humanPeInfo && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium -mt-4">[{compareWith}] {secondaryData.humanPeInfo}</p>
                )}

                {/* ── Dilution & SBC ── */}
                {dilutionCards.length > 0 && (
                    <>
                        <SectionTitle title="Dilution & SBC" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {dilutionCards.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/40" />)}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

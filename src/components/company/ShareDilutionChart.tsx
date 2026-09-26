import React, { useState, useMemo } from 'react';
import {
    ComposedChart,
    Bar,
    Cell,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { FinancialStatement } from './analysis/types';
import { filterStatementsByViewMode, buildPeriodLabel } from '@/lib/utils/chartUtils';
import { ChartViewToggle } from './shared/ChartViewToggle';
import { ChartQuarterTick } from './shared/ChartQuarterTick';
import { ChartBody, ChartControls, ChartPlot, ChartFootnote } from './shared/ChartFrame';
import { CHART_FONT } from '@/components/charts/chartTheme';

interface ShareDilutionChartProps {
    statements: FinancialStatement[];
}

const BUYBACK_GREEN = '#059669';
const DILUTION_RED = '#DC2626';
const CUMULATIVE_SLATE = '#334155';

function formatSharesCompact(valueMillions: number): string {
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(valueMillions * 1e6);
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color ?? entry.stroke ?? entry.fill }} />
                    <span className="text-gray-600 dark:text-gray-300">{entry.name}:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {entry.value != null ? `${entry.value > 0 ? '+' : ''}${entry.value.toFixed(1)}%` : '—'}
                    </span>
                </div>
            ))}
            {point?.shares != null && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    Shares: {formatSharesCompact(point.shares)}
                </div>
            )}
        </div>
    );
}

/**
 * Single-axis redesign: the question this chart answers is "diluting or
 * buying back, and how fast?" — i.e. the RATE, not absolute counts. YoY %
 * bars carry the per-period story (green = buyback, red = dilution), the
 * cumulative % line shows where the share count actually ended up. Both
 * series are % so a single zero-centered axis suffices — no dual-axis
 * mapping between bars (B) and a line (%). Absolute share counts live in
 * the tooltip + footnote.
 */
export default function ShareDilutionChart({ statements }: ShareDilutionChartProps) {
    const [viewMode, setViewMode] = useState<'annual' | 'quarterly'>('annual');
    const [showYoy, setShowYoy] = useState(true);
    const [showCumulative, setShowCumulative] = useState(true);

    const chartData = useMemo(() => {
        if (!statements || statements.length === 0) return [];

        const filtered = filterStatementsByViewMode(statements, viewMode);
        const sorted = [...filtered]
            .filter(s => s.sharesOutstanding !== null && s.sharesOutstanding > 0)
            .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

        const base = sorted.length > 0 ? sorted[0]!.sharesOutstanding! / 1e6 : null;
        return sorted.map((s) => {
            const shares = (s.sharesOutstanding ?? 0) / 1e6; // in millions
            // Find same period one year earlier for YoY comparison
            const prevYear = sorted.find(prev =>
                prev.fiscalPeriod === s.fiscalPeriod &&
                prev.fiscalYear === s.fiscalYear - 1
            );
            const prevShares = prevYear?.sharesOutstanding
                ? prevYear.sharesOutstanding / 1e6
                : null;
            // Positive = shares decreased (buyback), negative = dilution.
            // null when no prior-year comparison exists — 0 would fake "no change".
            // Same sign convention for cumulative: + = net buyback since start.
            // NOTE: ratios are NOT split-adjusted; a stock split shows as a large
            // false dilution spike (backend split-adjusted counts are a known gap).
            const buybackRatio = prevShares && prevShares > 0
                ? ((prevShares - shares) / prevShares) * 100
                : null;
            const cumulative = base && base > 0
                ? ((base - shares) / base) * 100
                : null;
            const label = buildPeriodLabel(s.fiscalPeriod, s.fiscalYear);
            return { name: label, date: label, shares, buybackRatio, cumulative };
        });
    }, [statements, viewMode]);

    if (!statements || statements.length === 0 || chartData.length === 0) {
        return (
            <div className="text-gray-500 text-sm p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="font-medium">No share count data available</p>
                <p className="text-xs mt-1">Click Refresh Analysis to fetch data.</p>
            </div>
        );
    }

    const allVals = chartData.flatMap(d => [d.buybackRatio, d.cumulative]).filter((v): v is number => v != null);
    const vMax = Math.max(0, ...allVals);
    const vMin = Math.min(0, ...allVals);
    const pad = Math.max(vMax - vMin, 1) * 0.15;
    const domain: [number, number] = [Math.floor((vMin - pad) * 10) / 10, Math.ceil((vMax + pad) * 10) / 10];

    const firstShares = chartData[0]?.shares;
    const lastShares = chartData[chartData.length - 1]?.shares;
    const sharesDelta = (firstShares != null && lastShares != null && firstShares > 0)
        ? ((lastShares - firstShares) / firstShares) * 100
        : null;

    return (
        <ChartBody>
            <ChartControls className="justify-between">
                <ChartViewToggle viewMode={viewMode} onChange={setViewMode} />
                <div className="flex gap-1.5 sm:gap-2">
                    <button onClick={() => setShowYoy(showCumulative ? !showYoy : true)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${showYoy ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'}`}
                        style={{ backgroundColor: showYoy ? BUYBACK_GREEN : undefined }}>
                        YoY %{showYoy && <span className="ml-1">✓</span>}
                    </button>
                    <button onClick={() => setShowCumulative(showYoy ? !showCumulative : true)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${showCumulative ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'}`}
                        style={{ backgroundColor: showCumulative ? CUMULATIVE_SLATE : undefined }}>
                        Cumulative %{showCumulative && <span className="ml-1">✓</span>}
                    </button>
                </div>
            </ChartControls>
            <ChartPlot>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: viewMode === 'quarterly' ? 8 : 5 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                        <XAxis dataKey="date"
                            tick={viewMode === 'quarterly' ? <ChartQuarterTick chartData={chartData} /> : { fontSize: CHART_FONT.axis, fill: '#6B7280', fontWeight: 500 }}
                            axisLine={false} tickLine={false} interval="preserveStartEnd" dy={viewMode === 'annual' ? 6 : 0} height={viewMode === 'quarterly' ? 44 : 24} />
                        <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: CHART_FONT.axis, fill: '#6B7280' }}
                            axisLine={false} tickLine={false} width={42} domain={domain} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.05)' }} />
                        {/* Zero = buyback/dilution boundary for both series */}
                        <ReferenceLine y={0} stroke="#6B7280" strokeOpacity={0.6} />
                        {showYoy && (
                            <Bar dataKey="buybackRatio" name="YoY Change" maxBarSize={36} isAnimationActive={false}>
                                {chartData.map((d, i) => (
                                    <Cell key={i} fill={d.buybackRatio == null ? 'transparent' : d.buybackRatio >= 0 ? BUYBACK_GREEN : DILUTION_RED} />
                                ))}
                            </Bar>
                        )}
                        {showCumulative && (
                            <Line type="monotone" dataKey="cumulative" name="Cumulative"
                                stroke={CUMULATIVE_SLATE} strokeWidth={2}
                                dot={{ r: 2.5, fill: CUMULATIVE_SLATE }} activeDot={{ r: 4 }} isAnimationActive={false} />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </ChartPlot>
            <ChartFootnote>
                {sharesDelta != null && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        Share count {firstShares != null ? formatSharesCompact(firstShares) : '—'} → {lastShares != null ? formatSharesCompact(lastShares) : '—'}{' '}
                        (<span className={`font-semibold ${sharesDelta > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {sharesDelta > 0 ? '+' : ''}{sharesDelta.toFixed(1)}%
                        </span>){' '}
                        since {chartData[0]!.date} — {sharesDelta > 0 ? 'net dilution' : 'net buybacks'} over the shown period
                    </p>
                )}
            </ChartFootnote>
        </ChartBody>
    );
}

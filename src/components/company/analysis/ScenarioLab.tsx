import React, { useState, useEffect, useMemo } from 'react';
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Area,
} from 'recharts';

interface ScenarioLabProps {
    ticker: string;
    currentEps: number;
    currentPe: number;
    currentPrice: number;
}

interface PricePoint {
    date: string;
    price: number;
}

function ScenarioTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const isProjected = d?.payload?.projected;
    return (
        <div className="bg-white dark:bg-gray-800 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
            <p className={isProjected ? 'text-blue-500 font-bold' : 'text-gray-900 dark:text-white font-bold'}>
                {isProjected ? 'Projected: ' : ''}${d?.value?.toFixed(2)}
            </p>
        </div>
    );
}

export function ScenarioLab({ ticker, currentEps, currentPe, currentPrice }: ScenarioLabProps) {
    const [epsGrowth, setEpsGrowth] = useState<number>(10);
    const [exitPe, setExitPe] = useState<number>(Math.max(5, Math.min(100, currentPe || 20)));
    const [years, setYears] = useState<number>(5);
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

    const isNegativePe = !currentPe || currentPe <= 0;

    // Fetch historical price data
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/analysis/${ticker}/history`)
            .then(r => r.json())
            .then(d => { if (!cancelled && d.priceHistory) setPriceHistory(d.priceHistory); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [ticker]);

    // Calculations
    const projectedEps = currentEps * Math.pow(1 + epsGrowth / 100, years);
    const targetPrice = projectedEps * exitPe;
    let cagr = 0;
    if (currentPrice > 0 && targetPrice > 0) {
        cagr = (Math.pow(targetPrice / currentPrice, 1 / years) - 1) * 100;
    }
    const isMarketBeating = cagr > 15;

    // Build chart data: historical (last 5Y) + projected points
    const chartData = useMemo(() => {
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        const cutoff = fiveYearsAgo.toISOString().slice(0, 10);

        // Historical — solid line
        const hist = priceHistory
            .filter(p => p.date >= cutoff)
            .map(p => ({ date: p.date, historical: p.price, projection: null as number | null, projected: false }));

        if (hist.length === 0 && currentPrice > 0) {
            hist.push({ date: new Date().toISOString().slice(0, 10), historical: currentPrice, projection: null, projected: false });
        }

        // Bridge point: last historical price → start of projection
        const lastDate = hist.length > 0 ? hist[hist.length - 1]!.date : new Date().toISOString().slice(0, 10);
        const lastPrice = hist.length > 0 ? hist[hist.length - 1]!.historical : currentPrice;

        // Projected points — one per year, dashed line
        const projPoints: typeof hist = [];
        const today = new Date(lastDate);

        // Bridge: both lines connect at today
        projPoints.push({ date: lastDate, historical: lastPrice ?? currentPrice, projection: lastPrice ?? currentPrice, projected: false });

        for (let y = 1; y <= years; y++) {
            const futureDate = new Date(today);
            futureDate.setFullYear(futureDate.getFullYear() + y);
            const label = futureDate.toISOString().slice(0, 10);
            const epsAtYear = currentEps * Math.pow(1 + epsGrowth / 100, y);
            const priceAtYear = epsAtYear * exitPe;
            projPoints.push({ date: label, historical: null as any, projection: priceAtYear, projected: true });
        }

        return [...hist, ...projPoints];
    }, [priceHistory, currentPrice, currentEps, epsGrowth, exitPe, years]);

    // Y-axis domain
    const allPrices = chartData.map(d => d.historical ?? d.projection ?? 0).filter(v => v > 0);
    const yMin = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.85) : 0;
    const yMax = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices) * 1.1) : 100;

    return (
        <div className="space-y-4">
            {isNegativePe && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
                    ⚠️ Company has negative or no P/E (loss-making). Projection uses assumed exit P/E — treat results as speculative.
                </div>
            )}

            {/* Chart: Historical + Projected */}
            {chartData.length > 2 && (
                <div className="w-full" style={{ minHeight: 220 }}>
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 5 }}>
                            <defs>
                                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-gray-700" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                                minTickGap={60}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                                axisLine={false}
                                tickLine={false}
                                width={50}
                                domain={[yMin, yMax]}
                                tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}`}
                            />
                            <Tooltip content={<ScenarioTooltip />} />
                            <ReferenceLine x={chartData.find(d => d.projection !== null && d.historical !== null)?.date ?? ''} stroke="#9CA3AF" strokeDasharray="3 3" label={{ value: 'Today', fontSize: 10, fill: '#9CA3AF', position: 'top' }} />
                            {/* Historical solid line */}
                            <Line
                                type="monotone"
                                dataKey="historical"
                                stroke="#6B7280"
                                strokeWidth={1.5}
                                dot={false}
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                            {/* Projected dashed line */}
                            <Line
                                type="monotone"
                                dataKey="projection"
                                stroke="#3B82F6"
                                strokeWidth={2.5}
                                strokeDasharray="8 4"
                                dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#fff' }}
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="projection"
                                fill="url(#projGrad)"
                                stroke="none"
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Inputs */}
                <div className="space-y-5">
                    {/* Years slider */}
                    <div>
                        <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <span>Investment Horizon</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">{years} {years === 1 ? 'year' : 'years'}</span>
                        </label>
                        <input
                            type="range" min="1" max="5" step="1" value={years}
                            onChange={(e) => setYears(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            {[1, 2, 3, 4, 5].map(y => (
                                <span key={y} className={years === y ? 'text-blue-500 font-bold' : ''}>{y}Y</span>
                            ))}
                        </div>
                    </div>

                    {/* EPS Growth slider */}
                    <div>
                        <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <span>Expected Annual EPS Growth</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">{epsGrowth}%</span>
                        </label>
                        <input
                            type="range" min="-20" max="50" step="1" value={epsGrowth}
                            onChange={(e) => setEpsGrowth(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>-20%</span><span>0%</span><span>+50%</span>
                        </div>
                    </div>

                    {/* Exit P/E slider */}
                    <div>
                        <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <span>Exit P/E Multiple</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">{exitPe.toFixed(1)}x</span>
                        </label>
                        <input
                            type="range" min="5" max="100" step="0.5" value={exitPe}
                            onChange={(e) => setExitPe(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>Current: {currentPe.toFixed(1)}x</span>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 sm:p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                    <div className="grid grid-cols-2 gap-4 mb-5">
                        <div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
                            <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">${currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Projected EPS (Y{years})</p>
                            <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">${projectedEps.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                        <div className="flex justify-between items-end mb-2">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Target Price in {years}Y</p>
                            <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">${targetPrice.toFixed(2)}</p>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                            <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">Annual Return (CAGR)</p>
                            <p className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${cagr > 15 ? 'text-green-500' : cagr > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                {cagr > 0 ? '+' : ''}{cagr.toFixed(2)}%
                                {isMarketBeating && (
                                    <span className="text-[9px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                                        Market Beating
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React, { useState } from 'react';

interface ScenarioCalculatorProps {
    currentEps: number;
    currentPe: number;
    currentPrice: number;
}

export function ScenarioLab({ currentEps, currentPe, currentPrice }: ScenarioCalculatorProps) {
    const [epsGrowth, setEpsGrowth] = useState<number>(10);
    // Clamp initial exitPe to [5, 100] — negative/zero PE (loss-making company) breaks projection
    const [exitPe, setExitPe] = useState<number>(Math.max(5, Math.min(100, currentPe || 20)));

    const isNegativePe = !currentPe || currentPe <= 0;

    // Target Price in 5 years: EPS_current * (1 + Growth)^5 * P/E_target
    const projectedEps = currentEps * Math.pow(1 + epsGrowth / 100, 5);
    const targetPrice = projectedEps * exitPe;

    // CAGR: (TargetPrice / CurrentPrice)^(1/5) - 1
    // Guard: targetPrice and currentPrice must both be positive
    let cagr = 0;
    if (currentPrice > 0 && targetPrice > 0) {
        cagr = (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100;
    }

    const isMarketBeating = cagr > 15;

    return (
        <div className="space-y-4">
            {isNegativePe && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
                    ⚠️ Company has negative or no P/E (loss-making). Projection uses assumed exit P/E — treat results as speculative.
                </div>
            )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="space-y-6">
                <div>
                    <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <span>Expected Annual EPS Growth (%)</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{epsGrowth}%</span>
                    </label>
                    <input
                        type="range"
                        min="-20"
                        max="50"
                        step="1"
                        value={epsGrowth}
                        onChange={(e) => setEpsGrowth(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        data-html2canvas-ignore="true"
                    />
                    <div data-html2canvas-ignore="true" className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>-20%</span>
                        <span>0%</span>
                        <span>+50%</span>
                    </div>
                </div>

                <div>
                    <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <span>Exit P/E Multiple</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400">{exitPe.toFixed(1)}x</span>
                    </label>
                    <input
                        type="range"
                        min="5"
                        max="100"
                        step="0.5"
                        value={exitPe}
                        onChange={(e) => setExitPe(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
                        data-html2canvas-ignore="true"
                    />
                    <div data-html2canvas-ignore="true" className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>Current: {currentPe.toFixed(1)}x</span>
                    </div>
                </div>
            </div>

            {/* Results */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            ${currentPrice.toFixed(2)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Projected EPS (Year 5)</p>
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            ${projectedEps.toFixed(2)}
                        </p>
                    </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex justify-between items-end mb-2">
                        <p className="text-base font-medium text-gray-600 dark:text-gray-400">Target Price in 5 Years</p>
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                            ${targetPrice.toFixed(2)}
                        </p>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Estimated Annual Return (CAGR)</p>
                        <p className={`text-2xl font-bold flex items-center gap-2 ${cagr > 15 ? 'text-green-500' : cagr > 0 ? 'text-blue-500' : 'text-red-500'
                            }`}>
                            {cagr > 0 ? '+' : ''}{cagr.toFixed(2)}%
                            {isMarketBeating && (
                                <span className="text-[10px] uppercase tracking-wider bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full font-semibold">
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

import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { MetricCard, MetricCardDef } from '../shared/MetricCard';

interface QualityStabilityStatsProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

export function QualityStabilityStats({
    ticker,
    data,
    compareWith,
    secondaryData
}: QualityStabilityStatsProps) {
    const mv = data.marginStability;
    const secMv = secondaryData?.marginStability;

    const niYears = data.negativeNiYears ?? 0;
    const secNiYears = secondaryData?.negativeNiYears ?? 0;

    const dil = data.balanceSheet?.dilution5y;
    const secDil = secondaryData?.balanceSheet?.dilution5y;

    const sbc = data.balanceSheet?.sbcRatio;
    const secSbc = secondaryData?.balanceSheet?.sbcRatio;

    const cards: MetricCardDef[] = [
        {
            label: 'Margin Volatility (σ)',
            hint: 'Standard deviation of EBIT margin over history. Lower = more stable and predictable business.',
            value: mv !== null && mv !== undefined ? (mv * 100).toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secMv !== null && secMv !== undefined ? (secMv * 100).toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: mv == null ? 'N/A' : mv < 0.03 ? 'Stable' : mv < 0.08 ? 'Normal' : mv < 0.15 ? 'Volatile' : 'Unstable',
            statusType: mv == null ? 'neutral' : mv < 0.03 ? 'good' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad',
        },
        {
            label: 'Negative NI Years (10Y)',
            hint: 'How many years the company had a net loss in the last 10 years. 0 = always profitable.',
            value: `${niYears}y`,
            secondaryValue: compareWith ? `${secNiYears}y` : undefined,
            statusLabel: niYears === 0 ? 'Excellent' : niYears <= 2 ? 'Good' : niYears <= 4 ? 'Concern' : 'Poor',
            statusType: niYears === 0 ? 'good' : niYears <= 2 ? 'good' : niYears <= 4 ? 'warn' : 'bad',
        },
        {
            label: 'Dilution (5Y Change)',
            hint: 'Share count change over 5 years. Negative = buybacks (good). >5% dilution is a red flag.',
            value: dil !== null && dil !== undefined ? (dil > 0 ? '+' : '') + dil.toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secDil !== null && secDil !== undefined ? (secDil > 0 ? '+' : '') + secDil.toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: dil == null ? 'N/A' : dil < -2 ? 'Buyback' : dil <= 2 ? 'Stable' : dil <= 10 ? 'Diluting' : 'Heavy Dilution',
            statusType: dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'good' : dil <= 10 ? 'warn' : 'bad',
        },
        {
            label: 'SBC (% of Net Income)',
            hint: 'Stock-based compensation as % of net income. >30% means significant shareholder dilution risk.',
            value: sbc !== null && sbc !== undefined ? sbc.toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secSbc !== null && secSbc !== undefined ? secSbc.toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: sbc == null ? 'N/A' : sbc < 10 ? 'Low' : sbc < 20 ? 'Moderate' : sbc < 40 ? 'High' : 'Excessive',
            statusType: sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad',
        },
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Quality & Stability Stats
                </h4>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {cards.map(card => (
                        <MetricCard key={card.label} card={card} compareWith={compareWith} bgClass="bg-gray-50 dark:bg-gray-900/50" />
                    ))}
                </div>
            </div>
        </div>
    );
}

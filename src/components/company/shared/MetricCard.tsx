import React from 'react';

// ─── Shared types ────────────────────────────────────────────────
export type StatusType = 'good' | 'warn' | 'bad' | 'neutral';

export interface MetricCardDef {
    label: string;
    hint: string;
    value: string;
    secondaryValue?: string | undefined;
    statusLabel: string;
    statusType: StatusType;
    source?: 'computed' | 'finnhub' | undefined;
}

// ─── Shared constants ────────────────────────────────────────────
export const STATUS_CLASSES: Record<StatusType, string> = {
    good: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    warn: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
    bad: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    neutral: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:border-gray-600',
};

// ─── Sub-components ──────────────────────────────────────────────
export function StatusBadge({ label, type }: { label: string; type: StatusType }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_CLASSES[type]}`}>
            {label}
        </span>
    );
}

export function SourceTag() {
    return (
        <span
            className="text-[9px] font-bold text-blue-400 dark:text-blue-500 tracking-wide"
            title="Computed from SEC filings (via Finnhub API)"
        >
            FH
        </span>
    );
}

// ─── Reusable metric card ────────────────────────────────────────
interface MetricCardProps {
    card: MetricCardDef;
    compareWith: string;
    bgClass?: string;
}

export function MetricCard({ card, compareWith, bgClass = 'bg-white dark:bg-gray-800' }: MetricCardProps) {
    return (
        <div
            className={`${bgClass} rounded-xl p-4 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors`}
            title={card.hint}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 leading-tight">
                        {card.label}
                    </span>
                    {card.source === 'finnhub' && <SourceTag />}
                </div>
                <StatusBadge label={card.statusLabel} type={card.statusType} />
            </div>
            <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-gray-900 dark:text-white leading-none tracking-tight">
                    {card.value}
                </div>
                {compareWith && card.secondaryValue !== undefined && (
                    <div className="text-right">
                        <div className="text-[9px] text-gray-400 mb-0.5">{compareWith}</div>
                        <div className="text-sm font-bold text-gray-500 dark:text-gray-400">
                            {card.secondaryValue}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

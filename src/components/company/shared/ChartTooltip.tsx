import React from 'react';

interface MetricDef {
    key: string;
    label: string;
    color: string;
}

interface ChartTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    metrics: readonly MetricDef[];
    multiplier?: number;
    prefix?: string;
}

export function ChartTooltip({ active, payload, label, metrics, multiplier = 1e6, prefix = '$' }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm max-w-xs">
            <p className="font-bold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
            {payload.map((entry: any, i: number) => {
                if (entry.value === 0 && entry.hide) return null;
                const metric = metrics.find(m => m.key === entry.dataKey);
                return (
                    <div key={i} className="flex items-center gap-2 mb-1">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-gray-600 dark:text-gray-300 truncate">{metric?.label ?? entry.name}:</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                            {prefix}{new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(entry.value * multiplier)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

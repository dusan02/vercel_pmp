import React from 'react';

interface MetricDef {
    key: string;
    label: string;
    color: string;
}

interface MetricToggleButtonsProps {
    metrics: readonly MetricDef[];
    selected: string[];
    onToggle: (key: string) => void;
}

export function toggleMetric(prev: string[], key: string): string[] {
    if (prev.includes(key)) {
        if (prev.length > 1) return prev.filter(m => m !== key);
        return prev;
    }
    return [...prev, key];
}

export function MetricToggleButtons({ metrics, selected, onToggle }: MetricToggleButtonsProps) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {metrics.map(metric => (
                <button
                    key={metric.key}
                    onClick={() => onToggle(metric.key)}
                    className={`text-[10px] px-2 py-1 rounded font-medium transition-all ${
                        selected.includes(metric.key)
                            ? 'text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-200 dark:bg-gray-700'
                    }`}
                    style={{
                        backgroundColor: selected.includes(metric.key) ? metric.color : undefined
                    }}
                >
                    {metric.label}
                    {selected.includes(metric.key) && <span className="ml-1">✓</span>}
                </button>
            ))}
        </div>
    );
}

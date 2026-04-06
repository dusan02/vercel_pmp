import React from 'react';

interface ChartQuarterTickProps {
    x?: number;
    y?: number;
    payload?: { value?: string };
    index?: number;
    chartData: Array<{ date: string }>;
}

export function ChartQuarterTick({ x = 0, y = 0, payload, index = 0, chartData }: ChartQuarterTickProps) {
    const val: string = payload?.value ?? '';
    const m = val.match(/Q(\d)'(\d{2})/);
    if (!m) {
        return <text x={x} y={y + 12} textAnchor="middle" fill="#6B7280" fontSize={11}>{val}</text>;
    }
    const q = `Q${m[1]}`;
    const year = `20${m[2]}`;
    const prevDate = index > 0 ? (chartData[index - 1]?.date ?? '') : '';
    const prevYear = prevDate.match(/Q\d'(\d{2})/)?.[1];
    const showYear = index === 0 || prevYear !== m[2];
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={14} textAnchor="middle" fill="#6B7280" fontSize={11} fontWeight={500}>{q}</text>
            {showYear && (
                <text x={0} y={30} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight={500}>{year}</text>
            )}
        </g>
    );
}

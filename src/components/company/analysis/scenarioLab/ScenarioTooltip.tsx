'use client';

import { fmtMoney } from './format';

/** Recharts tooltip for the scenario chart — shows historical + projected values. */
export function ScenarioTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const lines = payload
        .filter((d: any) => d.value !== null && d.value !== undefined)
        .map((d: any) => {
            const isProjected = d?.payload?.projected;
            const name = d.name;
            const color = d.stroke || d.color;
            return (
                <p key={name} className="font-bold tabular-nums" style={{ color }}>
                    {name}: {fmtMoney(d.value)}
                    {isProjected ? ' (proj)' : ''}
                </p>
            );
        });
    if (lines.length === 0) return null;
    const dateLabel = label ? new Date(label).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    }) : '';
    return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{dateLabel}</p>
            {lines}
        </div>
    );
}

import React from 'react';
import { fmtPct, fmtPe } from './format';

/** Growth slider used in the data-driven methodology panel. */
export function GrowthSlider({ label, value, onChange, accentColor }: { label: string; value: number; onChange: (v: number) => void; accentColor: 'red' | 'blue' | 'green' }) {
    const colorMap = {
        red: { text: 'text-red-500', accent: 'accent-red-500' },
        blue: { text: 'text-blue-500', accent: 'accent-blue-500' },
        green: { text: 'text-green-500', accent: 'accent-green-500' },
    };
    const c = colorMap[accentColor];
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
            <label className="flex justify-between items-baseline text-sm font-medium mb-2">
                <span className={c.text}>{label}</span>
                <span className={`font-mono tabular-nums text-base font-bold ${c.text}`}>{fmtPct(value)}</span>
            </label>
            <input
                type="range" min="-20" max="50" step="1" value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 ${c.accent}`}
            />
        </div>
    );
}

/** Stat card used in the methodology panel. */
export function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
            <p className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100 text-sm">{value}</p>
            {sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p>}
        </div>
    );
}

/** Horizon slider (1–5 years), shared by both modes. */
export function HorizonSlider({
    years, onChange, accent = 'blue',
}: {
    years: number;
    onChange: (v: number) => void;
    accent?: string;
}) {
    return (
        <div>
            <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <span>Investment Horizon</span>
                <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{years} {years === 1 ? 'year' : 'years'}</span>
            </label>
            <input
                type="range" min="1" max="5" step="1" value={years}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
                {[1, 2, 3, 4, 5].map(y => (
                    <span key={y} className={years === y ? 'text-blue-500 font-bold' : ''}>{y}Y</span>
                ))}
            </div>
        </div>
    );
}

// Re-export for consumers that only import from this module
export { fmtPct, fmtPe };

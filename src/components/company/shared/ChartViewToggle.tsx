import React from 'react';

interface ChartViewToggleProps {
    viewMode: 'annual' | 'quarterly';
    onChange: (mode: 'annual' | 'quarterly') => void;
}

export function ChartViewToggle({ viewMode, onChange }: ChartViewToggleProps) {
    const base = 'text-xs px-3 py-1.5 rounded-md font-medium transition-all';
    const active = 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm';
    const inactive = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';
    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex">
            <button onClick={() => onChange('annual')} className={`${base} ${viewMode === 'annual' ? active : inactive}`}>
                Annual
            </button>
            <button onClick={() => onChange('quarterly')} className={`${base} ${viewMode === 'quarterly' ? active : inactive}`}>
                Quarterly
            </button>
        </div>
    );
}

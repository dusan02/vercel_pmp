'use client';

import React from 'react';

export interface MobileSortColumn {
    key: string;
    label: React.ReactNode;
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
    /** Width hint (Tailwind class like 'w-16' or 'flex-1') */
    width?: string | undefined;
    /** Accessibility label if label is a component */
    ariaLabel?: string;
}

interface MobileSortHeaderProps {
    columns: MobileSortColumn[];
    sortKey: string;
    ascending: boolean;
    onSort: (key: string) => void;
    className?: string;
}

/**
 * MobileSortHeader — Sticky header row for mobile card lists.
 * Renders column labels; sortable columns show ▲/▼ and respond to taps.
 */
export function MobileSortHeader({
    columns,
    sortKey,
    ascending,
    onSort,
    className = '',
}: MobileSortHeaderProps) {
    return (
        <div
            className={`sticky top-0 z-10 flex items-center gap-x-2 px-3 py-3
        bg-blue-100/80 dark:bg-blue-900/60 border-b border-blue-200 dark:border-white/10
        backdrop-blur-md
        text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-blue-100
        select-none shadow-sm ${className}`}
        >
            {columns.map((col) => {
                const isActive = sortKey === col.key;
                const isSortable = col.sortable !== false;
                const alignClass =
                    col.align === 'right' ? 'justify-end text-right' :
                        col.align === 'center' ? 'justify-center text-center' :
                            'justify-start text-left';
                const widthClass = col.width || 'flex-1';

                return (
                    <button
                        key={col.key}
                        type="button"
                        disabled={!isSortable}
                        onClick={() => isSortable && onSort(col.key)}
                        className={`flex items-center gap-0.5 min-w-0 ${widthClass} ${alignClass}
              ${isSortable ? 'cursor-pointer active:opacity-60' : 'cursor-default'}
              ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}
              transition-colors`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        aria-label={isSortable ? `Sort by ${col.ariaLabel || col.key}` : (col.ariaLabel || col.key)}
                    >
                        <span className="flex items-center">{col.label}</span>
                        {isSortable && isActive && (
                            <span className="text-[8px] ml-0.5 opacity-80">{ascending ? '▲' : '▼'}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

'use client';

import React from 'react';

export interface MobileSortColumn {
    key: string;
    label: string;
    sortable?: boolean;
    align?: 'left' | 'center' | 'right';
    /** Width hint (Tailwind class like 'w-16' or 'flex-1') */
    width?: string;
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
            className={`sticky top-0 z-10 flex items-center gap-x-2 px-3 py-2
        bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
        text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400
        select-none ${className}`}
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
                        aria-label={isSortable ? `Sort by ${col.label}` : col.label}
                    >
                        <span className="truncate">{col.label}</span>
                        {isSortable && isActive && (
                            <span className="text-[8px] ml-0.5 opacity-80">{ascending ? '▲' : '▼'}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

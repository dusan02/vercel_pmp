'use client';

import React from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionLoader } from './SectionLoader';

export interface ColumnDef<T> {
    key: string;
    header: React.ReactNode;
    /* 
     * Accessor: function to get the cell content. 
     * returns ReactNode so it can be text or a component.
     */
    render: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    /* Tailwind classes to apply to BOTH header and cell (e.g. 'hidden md:table-cell') */
    className?: string;
    /* Inline style width (optional) */
    width?: string;
}

interface UniversalTableProps<T> {
    data: T[];
    columns: ColumnDef<T>[];
    keyExtractor: (item: T) => string;
    isLoading?: boolean;
    emptyMessage?: React.ReactNode;
    /* Sorting props */
    sortKey?: SortKey | null;
    ascending?: boolean;
    onSort?: (key: SortKey) => void;
    /* Mobile View: Render a custom card instead of table rows on mobile if provided */
    renderMobileCard?: (item: T) => React.ReactNode;
    /* If true, forces table view even on mobile (if no renderMobileCard provided) */
    forceTable?: boolean;
    /* Optional footer row(s) to be rendered at the bottom of tbody */
    footer?: React.ReactNode;
}

export function UniversalTable<T>({
    data,
    columns,
    keyExtractor,
    isLoading = false,
    emptyMessage = 'No data available.',
    sortKey,
    ascending,
    onSort,
    renderMobileCard,
    forceTable = false,
    footer
}: UniversalTableProps<T>) {

    if (isLoading) {
        return <SectionLoader message="Loading..." />;
    }

    const handleSort = (key: string) => {
        if (onSort) {
            onSort(key as SortKey);
        }
    };

    // If renderMobileCard is provided, we hide table on mobile and show cards
    // unless forceTable is true
    const showMobileCards = !!renderMobileCard && !forceTable;

    return (
        <div className="universal-table-container">
            {/* Mobile Card View (lg:hidden) */}
            {showMobileCards && (
                <div className="lg:hidden flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                    {data.length === 0 ? (
                        <div className="p-8 text-center text-[var(--clr-subtext)]">
                            {emptyMessage}
                        </div>
                    ) : (
                        data.map(item => (
                            <React.Fragment key={keyExtractor(item)}>
                                {renderMobileCard(item)}
                            </React.Fragment>
                        ))
                    )}
                </div>
            )}

            {/* Desktop Table View (hidden on mobile if cards are shown, otherwise full) */}
            <div className={`${showMobileCards ? 'hidden lg:block' : ''} overflow-x-auto`}>
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={`
                    py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap
                    bg-blue-100 text-slate-900 border-b border-blue-200/80
                    dark:bg-blue-900/60 dark:text-white dark:border-white/10
                    ${col.sortable ? 'cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none' : ''}
                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                    ${col.className || ''}
                    ${col.sortable && sortKey === col.key ? 'active-sort' : ''}
                  `.trim()}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                    style={{ width: col.width }}
                                >
                                    <div className={`flex items-center gap-1 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                                        {col.header}
                                        {col.sortable && sortKey === col.key && (
                                            <span className="text-[10px] opacity-70">
                                                {ascending ? '▲' : '▼'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="p-8 text-center text-[var(--clr-subtext)]">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {data.map((item) => (
                                    <tr key={keyExtractor(item)} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        {columns.map((col) => (
                                            <td
                                                key={`${keyExtractor(item)}-${col.key}`}
                                                className={`
                        py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)]
                        ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                        ${col.className || ''}
                      `.trim()}
                                            >
                                                {col.render(item)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {footer}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

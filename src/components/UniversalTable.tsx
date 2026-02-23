'use client';

import React from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { MobileSortHeader } from './mobile/MobileSortHeader';

export interface ColumnDef<T> {
    key: string;
    header: React.ReactNode;
    render: (item: T) => React.ReactNode;
    align?: 'left' | 'center' | 'right';
    sortable?: boolean;
    className?: string;
    width?: string;
    showInMobileSort?: boolean;
    mobileWidth?: string;
}

interface UniversalTableProps<T> {
    data: T[];
    columns: ColumnDef<T>[];
    keyExtractor: (item: T) => string;
    isLoading?: boolean;
    emptyMessage?: React.ReactNode;
    sortKey?: SortKey | null;
    ascending?: boolean;
    onSort?: (key: SortKey) => void;
    renderMobileCard?: (item: T) => React.ReactNode;
    forceTable?: boolean;
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
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    const handleSort = (key: string) => {
        if (onSort) {
            onSort(key as SortKey);
        }
    };

    const showMobileCards = !!renderMobileCard && !forceTable;

    return (
        <div className="universal-table-container">
            {/* Mobile Card View (lg:hidden) */}
            {showMobileCards && (
                <div className="lg:hidden w-full">
                    {/* Sort header for mobile cards */}
                    {onSort && sortKey !== undefined && (
                        <MobileSortHeader
                            columns={columns
                                .filter(c => c.sortable !== false && (c.showInMobileSort || !c.className?.includes('hidden')))
                                .map(col => ({
                                    key: col.key,
                                    label: col.header,
                                    sortable: col.sortable !== false,
                                    align: col.align || 'left',
                                    width: col.mobileWidth || col.width,
                                    ariaLabel: typeof col.header === 'string' ? col.header : col.key
                                }))}
                            sortKey={sortKey as string}
                            ascending={ascending ?? false}
                            onSort={handleSort}
                        />
                    )}
                    {data.length === 0 ? (
                        <div className="p-8 text-center text-[var(--clr-subtext)]">
                            {emptyMessage}
                        </div>
                    ) : (
                        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                            {data.map(item => (
                                <React.Fragment key={keyExtractor(item)}>
                                    {renderMobileCard!(item)}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    {/* Mobile Footer (e.g. SEO text) */}
                    {footer && (
                        <div className="mobile-table-footer">
                            {footer}
                        </div>
                    )}
                </div>
            )}

            {/* Desktop Table View */}
            <div className={`${showMobileCards ? 'hidden lg:block' : ''} overflow-x-auto`}>
                <table className="pmp-universal-table w-full border-collapse">
                    <colgroup>
                        {columns.map((col) => (
                            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
                        ))}
                    </colgroup>
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
                                {footer && (
                                    <tr>
                                        <td colSpan={columns.length} className="p-0 border-none">
                                            {footer}
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
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
    /** If true, clicking this cell won't trigger the row's onRowClick */
    disableRowClick?: boolean;
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
    /** Raw <tr> elements to append directly into tbody (avoids td-wrapping a tr) */
    tfootRows?: React.ReactNode;
    /** Callback for when a row is clicked */
    onRowClick?: (item: T) => void;
    /** Pin the first column while scrolling horizontally */
    stickyFirst?: boolean;
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
    footer,
    tfootRows,
    onRowClick,
    stickyFirst = false
}: UniversalTableProps<T>) {

    const scrollRef = useRef<HTMLDivElement>(null);
    // Whether more columns exist beyond the scrollport's right edge —
    // drives the right-edge fade that advertises horizontal scroll.
    const [canScrollRight, setCanScrollRight] = useState(false);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => { ro.disconnect(); window.removeEventListener('resize', update); };
    }, [data]);

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
                                .filter(c => (c.sortable !== false || c.showInMobileSort) && (c.showInMobileSort || !c.className?.includes('hidden')))
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

                    {/* Mobile Footer (e.g. SEO text) - ALWAYS SHOW */}
                    {footer && (
                        <div className="mobile-table-footer">
                            {footer}
                        </div>
                    )}
                </div>
            )}

            {/* Desktop Table View — relative wrapper hosts the scroll fade;
                the inner div is the actual horizontal scrollport */}
            <div className={`${showMobileCards ? 'hidden lg:block' : ''} relative`}>
            <div
                ref={scrollRef}
                onScroll={() => setCanScrollRight(scrollRef.current != null && scrollRef.current.scrollLeft + scrollRef.current.clientWidth < scrollRef.current.scrollWidth - 2)}
                className="overflow-x-auto pmp-table-scroll"
            >
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
                                        ${stickyFirst ? 'first:sticky first:left-0 first:z-20' : ''}
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
                                    <tr
                                        key={keyExtractor(item)}
                                        className={`group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                        onClick={() => onRowClick && onRowClick(item)}
                                    >
                                        {columns.map((col) => (
                                            <td
                                                key={`${keyExtractor(item)}-${col.key}`}
                                                className={`
                                                    py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)]
                                                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                                                    ${stickyFirst ? 'first:sticky first:left-0 first:z-10 first:bg-white first:dark:bg-slate-800 first:border-r first:border-gray-100 first:dark:border-gray-700 first:group-hover:bg-gray-50 first:dark:group-hover:bg-white/5' : ''}
                                                    ${col.className || ''}
                                                `.trim()}
                                                onClick={(e) => {
                                                    if (col.disableRowClick) {
                                                        e.stopPropagation();
                                                    }
                                                }}
                                            >
                                                {col.render(item)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </>
                        )}
                        {footer && (
                            <tr>
                                <td colSpan={columns.length} className="p-0 border-none">
                                    {footer}
                                </td>
                            </tr>
                        )}
                        {tfootRows}
                    </tbody>
                </table>
            </div>
            {/* Right-edge fade — visible only while more columns exist beyond
                the scrollport; advertises that the table scrolls */}
            {canScrollRight && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 w-12 z-30 bg-gradient-to-l from-white dark:from-slate-800 to-transparent"
                />
            )}
            </div>
        </div>
    );
}

'use client';

import React from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { SectionLoader } from './SectionLoader';
import { useVirtualizer } from '@tanstack/react-virtual';

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

/**
 * Virtualized mobile card list for large datasets (>50 items).
 * Uses @tanstack/react-virtual to keep DOM small.
 */
function MobileVirtualList<T>({
    data,
    keyExtractor,
    renderMobileCard,
}: {
    data: T[];
    keyExtractor: (item: T) => string;
    renderMobileCard: (item: T) => React.ReactNode;
}) {
    const parentRef = React.useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 56,
        overscan: 12,
    });

    return (
        <div
            ref={parentRef}
            className="overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: 'relative',
                    width: '100%',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = data[virtualRow.index];
                    if (!item) return null;
                    return (
                        <div
                            key={keyExtractor(item)}
                            ref={virtualizer.measureElement}
                            data-index={virtualRow.index}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            {renderMobileCard(item)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
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

    // Perf: for very large datasets, virtualize desktop rows to keep DOM small.
    // We only do this for desktop table view, and only when there's no footer row.
    const shouldVirtualizeDesktop = !showMobileCards && !footer && data.length > 200;
    const scrollParentRef = React.useRef<HTMLDivElement | null>(null);

    const rowVirtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => 56,
        overscan: 12,
    });

    return (
        <div className="universal-table-container">
            {/* Mobile Card View (lg:hidden) — virtualized for large lists */}
            {showMobileCards && (
                <div className="lg:hidden">
                    {data.length === 0 ? (
                        <div className="p-8 text-center text-[var(--clr-subtext)]">
                            {emptyMessage}
                        </div>
                    ) : data.length > 50 ? (
                        <MobileVirtualList
                            data={data}
                            keyExtractor={keyExtractor}
                            renderMobileCard={renderMobileCard!}
                        />
                    ) : (
                        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                            {data.map(item => (
                                <React.Fragment key={keyExtractor(item)}>
                                    {renderMobileCard!(item)}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Desktop Table View (hidden on mobile if cards are shown, otherwise full) */}
            <div
                ref={scrollParentRef}
                className={`${showMobileCards ? 'hidden lg:block' : ''} overflow-x-auto ${shouldVirtualizeDesktop ? 'overflow-y-auto max-h-[70vh]' : ''}`}
            >
                <table
                    className="pmp-universal-table w-full border-collapse"
                    style={shouldVirtualizeDesktop ? { tableLayout: 'fixed' } : undefined}
                >
                    {/* Keep column widths consistent between header + body (especially for virtualized rows) */}
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
                    ${shouldVirtualizeDesktop ? 'sticky top-0 z-20' : ''}
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
                    <tbody
                        className={shouldVirtualizeDesktop ? '' : 'divide-y divide-gray-100 dark:divide-gray-800'}
                        style={shouldVirtualizeDesktop ? {
                            display: 'block',
                            position: 'relative',
                            height: `${rowVirtualizer.getTotalSize()}px`,
                        } : undefined}
                    >
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="p-8 text-center text-[var(--clr-subtext)]">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {shouldVirtualizeDesktop ? (
                                    rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const item = data[virtualRow.index];
                                        if (!item) return null;
                                        const rowKey = keyExtractor(item);
                                        return (
                                            <tr
                                                key={rowKey}
                                                ref={rowVirtualizer.measureElement}
                                                data-index={virtualRow.index}
                                                className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-gray-800"
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                    display: 'table',
                                                    tableLayout: 'fixed',
                                                }}
                                            >
                                                {columns.map((col) => (
                                                    <td
                                                        key={`${rowKey}-${col.key}`}
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
                                        );
                                    })
                                ) : (
                                    data.map((item) => (
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
                                    ))
                                )}
                                {footer}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

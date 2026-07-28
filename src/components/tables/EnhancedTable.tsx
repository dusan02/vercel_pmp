'use client';

import React from 'react';
import { SortKey } from '@/hooks/useSortableData';
import { MobileSortHeader } from '../mobile/MobileSortHeader';
import { cn } from '@/lib/utils/utils';

// Helper function for safe nested property access
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export interface ColumnDef<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  className?: string;
  width?: string;
  minWidth?: string;
  showInMobileSort?: boolean;
  mobileWidth?: string;
  /** If true, clicking this cell won't trigger row's onRowClick */
  disableRowClick?: boolean;
  /** Custom cell renderer for advanced formatting */
  cell?: (item: T) => React.ReactNode;
  /** Header tooltip */
  tooltip?: string;
  /** Column priority for responsive display */
  priority?: 'high' | 'medium' | 'low';
}

interface EnhancedTableProps<T> {
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
  /** Raw <tr> elements to append directly into tbody */
  tfootRows?: React.ReactNode;
  /** Callback for when a row is clicked */
  onRowClick?: (item: T) => void;
  /** Table variant for different styling */
  variant?: 'default' | 'compact' | 'bordered' | 'striped';
  /** Enable sticky header */
  stickyHeader?: boolean;
  /** Enable hover effects */
  enableHover?: boolean;
  /** Custom loading skeleton */
  loadingSkeleton?: React.ReactNode;
  /** Maximum height for scrollable table */
  maxHeight?: string;
}

export function EnhancedTable<T>({
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
  variant = 'default',
  stickyHeader = false,
  enableHover = true,
  loadingSkeleton,
  maxHeight
}: EnhancedTableProps<T>) {

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        {loadingSkeleton || (
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
            <span className="text-sm text-gray-500">Loading data...</span>
          </div>
        )}
      </div>
    );
  }

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key as SortKey);
    }
  };

  const showMobileCards = !!renderMobileCard && !forceTable;

  // Filter columns based on priority for responsive design
  const getResponsiveColumns = (isMobile: boolean) => {
    if (isMobile) {
      return columns.filter(col => 
        col.priority === 'high' || 
        col.showInMobileSort || 
        !col.className?.includes('hidden')
      );
    }
    return columns;
  };

  const tableClasses = [
    'enhanced-table w-full border-collapse transition-all duration-200',
    variant === 'compact' && 'enhanced-table--compact',
    variant === 'bordered' && 'enhanced-table--bordered',
    variant === 'striped' && 'enhanced-table--striped',
    stickyHeader && 'enhanced-table--sticky-header',
    maxHeight && 'max-h-[600px] overflow-y-auto'
  ].filter(Boolean).join(' ');

  const headerClasses = [
    'text-xs md:text-sm font-semibold transition-colors',
    variant === 'default' && 'bg-gray-50 text-gray-900 border-b border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700',
    variant === 'bordered' && 'bg-blue-50 text-blue-900 border-b border-blue-200 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800'
  ].filter(Boolean).join(' ');

  const rowClasses = [
    'transition-all duration-150',
    enableHover && 'hover:bg-gray-50 dark:hover:bg-white/5',
    (variant === 'bordered' || variant === 'striped') && 'border-b border-gray-100 dark:border-gray-800'
  ].filter(Boolean).join(' ');

  return (
    <div className="enhanced-table-container">
      {/* Mobile Card View */}
      {showMobileCards && (
        <div className="lg:hidden w-full">
          {/* Sort header for mobile cards */}
          {onSort && sortKey !== undefined && (
            <MobileSortHeader
              columns={getResponsiveColumns(true)
                .filter(c => c.sortable !== false || c.showInMobileSort)
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
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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

          {footer && (
            <div className="mobile-table-footer mt-4">
              {footer}
            </div>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      <div className={`${showMobileCards ? 'hidden lg:block' : ''} ${maxHeight ? 'overflow-x-auto' : ''}`}>
        <table className={tableClasses}>
          <colgroup>
            {getResponsiveColumns(false).map((col) => (
              <col 
                key={col.key} 
                style={{ 
                  width: col.width,
                  minWidth: col.minWidth
                }} 
              />
            ))}
          </colgroup>
          
          <thead className={[headerClasses, stickyHeader && 'sticky top-0 z-10'].filter(Boolean).join(' ')}>
            <tr>
              {getResponsiveColumns(false).map((col) => (
                <th
                  key={col.key}
                    className={[
                      'px-3 py-3 first:pl-4 last:pr-4 whitespace-nowrap',
                      'border-b border-gray-200 dark:border-gray-700',
                      col.sortable && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700',
                      col.align === 'left' && 'text-left',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.className
                    ].filter(Boolean).join(' ')}
                  onClick={() => col.sortable && handleSort(col.key)}
                  title={col.tooltip}
                  style={{ width: col.width }}
                >
                  <div className={[
                      'flex items-center gap-1',
                      col.align === 'center' && 'justify-center',
                      col.align === 'right' && 'justify-end',
                      col.align === 'left' && 'justify-start'
                    ].filter(Boolean).join(' ')}>
                    <span className="truncate">{col.header}</span>
                    {col.sortable && sortKey === col.key && (
                      <span className="text-[10px] opacity-70 flex-shrink-0">
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
                <td colSpan={getResponsiveColumns(false).length} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              <>
                {data.map((item, index) => (
                  <tr
                    key={keyExtractor(item)}
                    className={[
                      rowClasses,
                      onRowClick && 'cursor-pointer',
                      variant === 'striped' && index % 2 === 1 && 'bg-gray-50 dark:bg-gray-800/50'
                    ].filter(Boolean).join(' ')}
                    onClick={() => onRowClick && onRowClick(item)}
                  >
                    {getResponsiveColumns(false).map((col) => (
                      <td
                        key={`${keyExtractor(item)}-${col.key}`}
                    className={[
                      'px-3 py-3 first:pl-4 last:pr-4 text-sm',
                      col.align === 'left' && 'text-left',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.className
                    ].filter(Boolean).join(' ')}
                        onClick={(e) => {
                          if (col.disableRowClick) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {col.cell ? col.cell(item) : (col.render ? col.render(item) : String(getNestedValue(item, col.key) ?? ''))}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            
            {footer && (
              <tr>
                <td colSpan={getResponsiveColumns(false).length} className="p-0 border-none">
                  {footer}
                </td>
              </tr>
            )}
            
            {tfootRows}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';

type SortDirection = "asc" | "desc" | null;

interface UseSortableTableOptions<T> {
  data: T[];
  defaultSortColumn?: keyof T;
  defaultSortDirection?: SortDirection;
}

export function useSortableTable<T>({
  data,
  defaultSortColumn,
  defaultSortDirection = "desc"
}: UseSortableTableOptions<T>) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(defaultSortColumn || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const handleSort = (column: keyof T) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to desc
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const valueA = a[sortColumn];
      const valueB = b[sortColumn];

      if (typeof valueA === "number" && typeof valueB === "number") {
        return sortDirection === "asc" ? valueA - valueB : valueB - valueA;
      }

      if (typeof valueA === "string" && typeof valueB === "string") {
        return sortDirection === "asc"
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      }

      return 0;
    });
  }, [data, sortColumn, sortDirection]);

  const getSortIcon = (column: keyof T) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? "▲" : "▼";
  };

  return {
    sortedData,
    sortColumn,
    sortDirection,
    handleSort,
    getSortIcon
  };
} 
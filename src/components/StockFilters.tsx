/**
 * Stock Filters Component
 * Handles category and sector filtering
 */

import React from 'react';
import { CustomDropdown } from './CustomDropdown';
import { formatSectorName } from '@/lib/utils/format';

interface StockFiltersProps {
  filterCategory: 'all' | 'gainers' | 'losers' | 'movers' | 'bigMovers';
  selectedSector: string;
  uniqueSectors: string[];
  favoritesOnly: boolean;
  onCategoryChange: (category: 'all' | 'gainers' | 'losers' | 'movers' | 'bigMovers') => void;
  onSectorChange: (sector: string) => void;
  onFavoritesOnlyChange: (value: boolean) => void;
}

export function StockFilters({
  filterCategory,
  selectedSector,
  uniqueSectors,
  favoritesOnly,
  onCategoryChange,
  onSectorChange,
  onFavoritesOnlyChange
}: StockFiltersProps) {
  const categoryOptions = [
    { value: 'all', label: 'All Stocks' },
    { value: 'gainers', label: 'Gainers' },
    { value: 'losers', label: 'Losers' },
    { value: 'movers', label: 'Movers (>2%)' },
    { value: 'bigMovers', label: 'Big Movers (>10B$)' }
  ];

  const sectorOptions = [
    { value: 'all', label: 'All Sectors' },
    ...uniqueSectors.map(sector => ({ value: sector, label: formatSectorName(sector) }))
  ];

  return (
    <div className="filters-section">
      <div className="filter-group">
        <label htmlFor="category-filter" className="filter-label">
          Category:
        </label>
        <CustomDropdown
          options={categoryOptions}
          value={filterCategory}
          onChange={(value) => onCategoryChange(value as typeof filterCategory)}
          className="filter-dropdown"
          ariaLabel="Filter by category"
        />
      </div>

      <div className="filter-group">
        <label htmlFor="sector-filter" className="filter-label">
          Sector:
        </label>
        <CustomDropdown
          options={sectorOptions}
          value={selectedSector}
          onChange={onSectorChange}
          className="filter-dropdown"
          ariaLabel="Filter by sector"
        />
      </div>

      <div className="filter-group">
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => onFavoritesOnlyChange(e.target.checked)}
          />
          <span>Favorites Only</span>
        </label>
      </div>
    </div>
  );
}


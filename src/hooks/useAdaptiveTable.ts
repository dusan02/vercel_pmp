'use client';
import { useState, useEffect } from 'react';

export interface TableConfig {
  columns: string[];
  priority: number; // 1 = highest priority, 5 = lowest
  minWidth: number; // minimum width needed for this column
  mobile: boolean; // show on mobile
  tablet: boolean; // show on tablet
  desktop: boolean; // show on desktop
}

export interface AdaptiveTableState {
  visibleColumns: string[];
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
}

export const useAdaptiveTable = (configs: TableConfig[]) => {
  const [state, setState] = useState<AdaptiveTableState>({
    visibleColumns: [],
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    screenWidth: 0,
    screenHeight: 0
  });

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      const isMobile = width <= 768;
      const isTablet = width > 768 && width <= 1024;
      const isDesktop = width > 1024;

      // Calculate available width for columns
      const availableWidth = width - 40; // Account for padding/margins
      
      // Sort configs by priority (1 = highest)
      const sortedConfigs = [...configs].sort((a, b) => a.priority - b.priority);
      
      const visibleColumns: string[] = [];
      let usedWidth = 0;

      for (const config of sortedConfigs) {
        // Check if column should be visible on current device
        const shouldShow = (isMobile && config.mobile) || 
                          (isTablet && config.tablet) || 
                          (isDesktop && config.desktop);

        if (shouldShow && (usedWidth + config.minWidth) <= availableWidth) {
          visibleColumns.push(...config.columns);
          usedWidth += config.minWidth;
        }
      }

      setState({
        visibleColumns,
        isMobile,
        isTablet,
        isDesktop,
        screenWidth: width,
        screenHeight: height
      });
    };

    // Initial update
    updateLayout();

    // Update on resize
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);

    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('orientationchange', updateLayout);
    };
  }, [configs]);

  return state;
};

// Predefined table configurations for stock data
export const STOCK_TABLE_CONFIGS: TableConfig[] = [
  {
    columns: ['logo'],
    priority: 1,
    minWidth: 60,
    mobile: true,
    tablet: true,
    desktop: true
  },
  {
    columns: ['ticker'],
    priority: 1,
    minWidth: 80,
    mobile: true,
    tablet: true,
    desktop: true
  },
  {
    columns: ['companyName'],
    priority: 2,
    minWidth: 120,
    mobile: false, // Hide on mobile to save space
    tablet: true,
    desktop: true
  },
  {
    columns: ['currentPrice'],
    priority: 1,
    minWidth: 100,
    mobile: true,
    tablet: true,
    desktop: true
  },
  {
    columns: ['percentChange'],
    priority: 1,
    minWidth: 90,
    mobile: true,
    tablet: true,
    desktop: true
  },
  {
    columns: ['marketCap'],
    priority: 3,
    minWidth: 110,
    mobile: false, // Hide on mobile
    tablet: true,
    desktop: true
  },
  {
    columns: ['marketCapDiff'],
    priority: 4,
    minWidth: 120,
    mobile: false, // Hide on mobile
    tablet: false, // Hide on tablet
    desktop: true
  },
  {
    columns: ['favorites'],
    priority: 1,
    minWidth: 60,
    mobile: true,
    tablet: true,
    desktop: true
  }
];

// Hook for stock table specifically
export const useStockTable = () => {
  return useAdaptiveTable(STOCK_TABLE_CONFIGS);
}; 
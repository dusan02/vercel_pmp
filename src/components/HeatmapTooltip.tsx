/**
 * HeatmapTooltip Component
 * Tooltip for displaying company information on hover
 */

'use client';

import React from 'react';
import type { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatMarketCap, formatPercent, formatMarketCapDiff } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import styles from '@/styles/heatmap.module.css';

interface HeatmapTooltipProps {
  company: CompanyNode;
  position: { x: number; y: number };
  timeframe: 'day' | 'week' | 'month';
  metric: 'percent' | 'mcap';
}

export function HeatmapTooltip({ company, position, timeframe, metric }: HeatmapTooltipProps) {
  // Determine position based on viewport width and height
  // Tooltip should be close to cursor but not cover the block
  const HORIZONTAL_OFFSET = 15; // Distance from cursor horizontally
  const VERTICAL_OFFSET = 10; // Small offset below cursor to keep block visible
  const TOOLTIP_ESTIMATED_WIDTH = 280;
  const TOOLTIP_ESTIMATED_HEIGHT = 200; // Estimated tooltip height
  
  let x = position.x + HORIZONTAL_OFFSET;
  let y = position.y + VERTICAL_OFFSET;
  let placement = 'right';
  let verticalPlacement = 'below';
  
  if (typeof window !== 'undefined') {
    // Check if tooltip would overflow right edge
    if (position.x + HORIZONTAL_OFFSET + TOOLTIP_ESTIMATED_WIDTH > window.innerWidth) {
      x = position.x - HORIZONTAL_OFFSET;
      placement = 'left';
    }
    
    // Check if tooltip would overflow bottom edge - place above cursor instead
    if (position.y + VERTICAL_OFFSET + TOOLTIP_ESTIMATED_HEIGHT > window.innerHeight) {
      y = position.y - VERTICAL_OFFSET;
      verticalPlacement = 'above';
    }
    
    // Ensure tooltip doesn't go off screen
    x = Math.max(10, Math.min(x, window.innerWidth - TOOLTIP_ESTIMATED_WIDTH - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - TOOLTIP_ESTIMATED_HEIGHT - 10));
  }

  // Transform based on placement
  let transformX = '0';
  let transformY = '0';
  
  if (placement === 'left') {
    transformX = '-100%';
  }
  
  // For vertical placement, we want tooltip to start at cursor position
  // (no centering, so it doesn't jump around)
  if (verticalPlacement === 'above') {
    transformY = '-100%';
  }

  const tooltipStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    transform: `translate(${transformX}, ${transformY})`,
    position: 'fixed',
    zIndex: 1000,
    pointerEvents: 'none',
  };

  return (
    <div className={styles.heatmapTooltip} style={tooltipStyle}>
      <div className={styles.heatmapTooltipTitle}>
        {company.symbol} - {company.name}
      </div>
      <div className={styles.heatmapTooltipRow}>
        <span className={styles.heatmapTooltipLabel}>Sector:</span>
        <span className={styles.heatmapTooltipValue}>{formatSectorName(company.sector)}</span>
      </div>
      <div className={styles.heatmapTooltipRow}>
        <span className={styles.heatmapTooltipLabel}>Industry:</span>
        <span className={styles.heatmapTooltipValue}>{company.industry}</span>
      </div>
      {company.currentPrice !== undefined && (
        <div className={styles.heatmapTooltipRow}>
          <span className={styles.heatmapTooltipLabel}>Price:</span>
          <span className={styles.heatmapTooltipValue}>{formatPrice(company.currentPrice)}</span>
        </div>
      )}
      <div className={styles.heatmapTooltipRow}>
        <span className={styles.heatmapTooltipLabel}>Market Cap:</span>
        <span className={styles.heatmapTooltipValue}>{formatMarketCap(company.marketCap)}</span>
      </div>
      {metric === 'percent' ? (
        <div className={styles.heatmapTooltipRow}>
          <span className={styles.heatmapTooltipLabel}>Change ({timeframe}):</span>
          <span
            className={styles.heatmapTooltipValue}
            style={{
              color: company.changePercent >= 0 ? '#22c55e' : '#ef4444',
            }}
          >
            {formatPercent(company.changePercent)}
          </span>
        </div>
      ) : (
        <div className={styles.heatmapTooltipRow}>
          <span className={styles.heatmapTooltipLabel}>Mcap Change:</span>
          <span
            className={styles.heatmapTooltipValue}
            style={{
              color: (company.marketCapDiff || 0) >= 0 ? '#22c55e' : '#ef4444',
            }}
          >
            {formatMarketCapDiff(company.marketCapDiff)}
          </span>
        </div>
      )}
    </div>
  );
}


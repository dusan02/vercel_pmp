/**
 * HeatmapTooltip Component
 * Tooltip for displaying company information on hover
 */

'use client';

import React from 'react';
import type { CompanyNode } from './MarketHeatmap';
import { formatPrice, formatMarketCap, formatPercent, formatMarketCapDiff } from '@/lib/utils/heatmapFormat';
import styles from '@/styles/heatmap.module.css';

interface HeatmapTooltipProps {
  company: CompanyNode;
  position: { x: number; y: number };
  timeframe: 'day' | 'week' | 'month';
  metric: 'percent' | 'mcap';
}

export function HeatmapTooltip({ company, position, timeframe, metric }: HeatmapTooltipProps) {
  // Determine position based on viewport width
  // Default to right, flip to left if close to right edge
  const OFFSET = 20;
  const TOOLTIP_ESTIMATED_WIDTH = 280;
  
  let x = position.x + OFFSET;
  let placement = 'right';
  
  if (typeof window !== 'undefined') {
    if (position.x + OFFSET + TOOLTIP_ESTIMATED_WIDTH > window.innerWidth) {
      x = position.x - OFFSET;
      placement = 'left';
    }
  }

  const tooltipStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${position.y}px`,
    transform: placement === 'right' ? 'translate(0, -50%)' : 'translate(-100%, -50%)',
    position: 'fixed',
    zIndex: 100,
    pointerEvents: 'none',
  };

  return (
    <div className={styles.heatmapTooltip} style={tooltipStyle}>
      <div className={styles.heatmapTooltipTitle}>
        {company.symbol} - {company.name}
      </div>
      <div className={styles.heatmapTooltipRow}>
        <span className={styles.heatmapTooltipLabel}>Sector:</span>
        <span className={styles.heatmapTooltipValue}>{company.sector}</span>
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


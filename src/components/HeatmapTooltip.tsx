/**
 * HeatmapTooltip Component
 * Tooltip for displaying company information on hover
 */

'use client';

import React from 'react';
import type { CompanyNode } from '@/lib/heatmap/types';
import { formatPrice, formatMarketCap, formatPercent, formatMarketCapDiff } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import styles from '@/styles/heatmap.module.css';
import CompanyLogo from './CompanyLogo';

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
  const TOOLTIP_ESTIMATED_WIDTH = 250;
  const TOOLTIP_ESTIMATED_HEIGHT = 180; // Estimated tooltip height

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
  if (verticalPlacement === 'above') {
    transformY = '-100%';
  }

  const tooltipStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    transform: `translate(${transformX}, ${transformY})`,
  };

  // Calculate sentiment color
  const changeValue = metric === 'mcap' ? (company.marketCapDiff || 0) : company.changePercent;
  const isPositive = changeValue >= 0;
  const sentimentColor = isPositive ? '#22c55e' : '#ef4444';

  // Use custom display value if available (e.g. for Dollar mode P&L)
  const displayValue = company.displayValue;

  return (
    <div className={styles.heatmapTooltip} style={tooltipStyle}>
      {/* Accent Strip */}
      <div
        className={styles.heatmapTooltipAccent}
        style={{ backgroundColor: sentimentColor }}
      />

      <div className={styles.heatmapTooltipContent}>
        <div className={styles.heatmapTooltipTitle}>
          <div className="flex items-center gap-2 min-w-0">
            <CompanyLogo ticker={company.symbol} size={28} />
            <div className="min-w-0">
              <div className="text-white text-sm font-bold leading-tight truncate max-w-[160px]">
                {company.symbol}
              </div>
              {company.name && company.name.trim() !== company.symbol && (
                <div className="text-gray-400 text-[10px] leading-tight truncate max-w-[160px]">
                  {company.name}
                </div>
              )}
            </div>
          </div>
          <span style={{ color: sentimentColor, fontSize: '0.9em' }}>
            {metric === 'percent' ? formatPercent(company.changePercent) : formatMarketCapDiff(company.marketCapDiff)}
          </span>
        </div>

        {displayValue ? (
          // Special display for Dollar/Portfolio modes if displayValue is present
          <div className={styles.heatmapTooltipRow}>
            <span className={styles.heatmapTooltipLabel}>Daily P&L:</span>
            <span
              className={styles.heatmapTooltipValue}
              style={{ color: sentimentColor, fontSize: '1.1em' }}
            >
              {displayValue}
            </span>
          </div>
        ) : (
          <div className={styles.heatmapTooltipRow}>
            <span className={styles.heatmapTooltipLabel}>Price:</span>
            <span className={styles.heatmapTooltipValue}>
              {company.currentPrice !== undefined ? formatPrice(company.currentPrice) : '—'}
            </span>
          </div>
        )}

        <div className={styles.heatmapTooltipRow}>
          <span className={styles.heatmapTooltipLabel}>Market Cap:</span>
          <span className={styles.heatmapTooltipValue}>{formatMarketCap(company.marketCap)}</span>
        </div>

        <div className={styles.heatmapTooltipRow}>
          <span className={styles.heatmapTooltipLabel}>Sector:</span>
          <span className={styles.heatmapTooltipValue} style={{ maxWidth: '120px', textAlign: 'right' }}>
            {formatSectorName(company.sector)}
          </span>
        </div>
      </div>
    </div>
  );
}


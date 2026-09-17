'use client';

import React from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { HEATMAP_METRICS } from '@/lib/heatmap/metricValue';
import { BrandLogo } from '../BrandLogo';
import { LoginButton } from '../LoginButton';

interface MobileHeatmapHeaderProps {
  metric: HeatmapMetric;
  onMetricChange?: ((metric: HeatmapMetric) => void) | undefined;
}

/**
 * Glassmorphism header bar for the mobile heatmap.
 * Contains branding, metric toggle (% / $), and login button.
 */
export const MobileHeatmapHeader: React.FC<MobileHeatmapHeaderProps> = ({
  metric,
  onMetricChange,
}) => (
  <div
    style={{
      position: 'relative',
      zIndex: 100,
      background: 'rgba(10,10,10,0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '8px 12px',
      paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    }}
  >
    {/* Brand */}
    <div className="flex items-center gap-2 flex-shrink-0">
      <BrandLogo size={22} />
      <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px', letterSpacing: '-0.01em' }}>
        PreMarketPrice
      </span>
    </div>

    <div className="flex-1" />

    {/* Metric dropdown */}
    {onMetricChange && (
      <select
        value={metric}
        onChange={(e) => onMetricChange(e.target.value as HeatmapMetric)}
        aria-label="Heatmap metric"
        style={{
          height: 28, paddingLeft: 10, paddingRight: 22, borderRadius: 8,
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.85)',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5' viewBox='0 0 9 5'%3E%3Cpath d='M1 1l3.5 3.5L8 1' stroke='%23ffffff' stroke-opacity='0.6' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 7px center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {HEATMAP_METRICS.map((m) => (
          <option key={m.id} value={m.id} style={{ color: '#1e293b', background: '#fff' }}>
            {m.label}
          </option>
        ))}
      </select>
    )}

    {/* Login */}
    <div className="flex-shrink-0 ml-1">
      <LoginButton />
    </div>
  </div>
);

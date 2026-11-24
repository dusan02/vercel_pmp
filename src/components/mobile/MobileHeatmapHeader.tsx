'use client';

import React from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
import { HEATMAP_METRICS, HEATMAP_METRIC_GROUPS } from '@/lib/heatmap/metricValue';
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

    {/* Metric dropdown — custom visual pill with invisible native <select> overlay
        so Chromium/Safari never render a duplicate shadow-DOM triangle next to the chevron. */}
    {onMetricChange && (
      <div
        className="relative inline-flex items-center gap-1.5"
        style={{
          height: 28,
          paddingLeft: 10,
          paddingRight: 8,
          borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        <span className="pointer-events-none text-[11px] font-bold leading-none whitespace-nowrap">
          {(() => {
            const cur = HEATMAP_METRICS.find((m) => m.id === metric);
            return cur?.short ?? cur?.label ?? metric;
          })()}
        </span>
        <svg
          className="pointer-events-none shrink-0 opacity-60"
          width="9"
          height="5"
          viewBox="0 0 9 5"
          aria-hidden="true"
        >
          <path d="M1 1l3.5 3.5L8 1" stroke="#ffffff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
        <select
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as HeatmapMetric)}
          aria-label="Heatmap metric"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {HEATMAP_METRIC_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {HEATMAP_METRICS.filter((m) => m.group === g).map((m) => (
                <option key={m.id} value={m.id} style={{ color: '#1e293b', background: '#fff' }}>
                  {m.short ?? m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    )}

    {/* Login */}
    <div className="flex-shrink-0 ml-1">
      <LoginButton />
    </div>
  </div>
);

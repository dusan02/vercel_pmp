'use client';

import React from 'react';
import type { HeatmapMetric } from '@/lib/heatmap/types';
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

    {/* Metric toggle */}
    {onMetricChange && (
      <div
        style={{
          display: 'flex', alignItems: 'center',
          background: 'rgba(255,255,255,0.06)', borderRadius: '8px',
          padding: '3px', border: '1px solid rgba(255,255,255,0.1)', gap: 2,
        }}
      >
        <MetricButton label="%" active={metric === 'percent'} onClick={() => onMetricChange('percent')} />
        <MetricButton label="$" active={metric === 'mcap'} onClick={() => onMetricChange('mcap')} />
      </div>
    )}

    {/* Login */}
    <div className="flex-shrink-0 ml-1">
      <LoginButton />
    </div>
  </div>
);

function MetricButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px', height: '28px', borderRadius: '6px',
        fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: active ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
        color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
        boxShadow: active ? '0 2px 8px rgba(37,99,235,0.4)' : 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

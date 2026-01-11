'use client';
// Force update: v3 segmented control layout

import React from 'react';
import { event } from '@/lib/ga';
import type { HeatmapMetric } from './MarketHeatmap';

interface HeatmapToggleMinimalProps {
    metric: HeatmapMetric;
    onMetricChange: (metric: HeatmapMetric) => void;
    className?: string;
}

export function HeatmapToggleMinimal({
    metric,
    onMetricChange,
    className = '',
}: HeatmapToggleMinimalProps) {
    const isPercent = metric === 'percent';

    const handleToggle = (newMetric: HeatmapMetric) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (metric !== newMetric) {
            onMetricChange(newMetric);
            event('heatmap_change', {
                metric: newMetric,
                timeframe: 'day'
            });
        }
    };

    return (
        <div className={`relative inline-flex items-center bg-[#1a1a1a] rounded-lg border border-white/10 h-[44px] p-1 ${className}`}>
            {/* Jednoduchý obdĺžnikový prepínač - jedna alebo druhá možnosť vybratá */}
            <button
                type="button"
                onClick={handleToggle('percent')}
                className={`
          relative z-10 flex items-center justify-center
          min-w-[40px] flex-1 h-full
          text-sm font-bold rounded-md
          transition-all duration-200
          ${isPercent
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-[#6b7280] hover:text-white bg-transparent'
                    }
        `}
                aria-label="Percent Change"
                title="Percentage Change"
            >
                %
            </button>
            <button
                type="button"
                onClick={handleToggle('mcap')}
                className={`
          relative z-10 flex items-center justify-center
          min-w-[40px] flex-1 h-full
          text-sm font-bold rounded-md
          transition-all duration-200
          ${!isPercent
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-[#6b7280] hover:text-white bg-transparent'
                    }
        `}
                aria-label="Market Cap Change"
                title="Market Cap Change"
            >
                $
            </button>
        </div>
    );
}

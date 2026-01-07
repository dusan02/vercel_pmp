'use client';

import React from 'react';

/**
 * Lightweight skeleton screens pre mobile
 * Optimalizované pre rýchle renderovanie
 */
export function HeatmapSkeleton() {
  return (
    <div className="h-full w-full bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading heatmap...</div>
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-20 bg-gray-200 rounded-lg animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function TreemapSkeleton() {
  return (
    <div className="h-full w-full bg-black p-2">
      <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: 'minmax(72px, auto)' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-800 rounded animate-pulse"
            style={{
              gridColumn: i < 2 ? 'span 2' : 'span 1',
              gridRow: i < 2 ? 'span 2' : 'span 1',
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

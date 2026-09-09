import React from 'react';

interface MobileSkeletonProps {
  type: 'heatmap' | 'list' | 'cards' | 'earnings';
  className?: string;
  count?: number; // For list/cards items
}

export function MobileSkeleton({ type, className = '', count = 2 }: MobileSkeletonProps) {
  if (type === 'heatmap') {
    return (
      <div className={`h-full w-full bg-black p-2 ${className}`}>
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

  if (type === 'earnings' || type === 'list') {
    return (
      <div className={`p-4 space-y-3 ${className}`} style={{ background: '#0f0f0f' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded animate-pulse"
            style={{ background: 'rgba(255, 255, 255, 0.08)' }}
          />
        ))}
      </div>
    );
  }

  // Default / Cards
  return (
    <div className={`p-4 space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      ))}
    </div>
  );
}

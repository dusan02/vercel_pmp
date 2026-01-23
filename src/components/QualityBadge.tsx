'use client';

import React from 'react';

interface QualityBadgeProps {
  quality?: 'delayed_15m' | 'rest' | 'snapshot';
  as_of?: string;
  source?: string;
  pollInterval?: number; // in seconds, default 60
}

export function QualityBadge({ quality, as_of, source, pollInterval = 60 }: QualityBadgeProps) {
  if (!quality && !as_of) return null;

  const isStale = as_of ? (Date.now() - new Date(as_of).getTime()) > (pollInterval + 300) * 1000 : false;
  
  const getQualityLabel = () => {
    switch (quality) {
      case 'delayed_15m':
        return 'Delayed ~15m';
      case 'rest':
        return 'Real-time';
      case 'snapshot':
        return 'Snapshot';
      default:
        return 'Unknown';
    }
  };

  const getQualityColor = () => {
    if (isStale) return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
    switch (quality) {
      case 'delayed_15m':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'rest':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'snapshot':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const formatAsOf = (timestamp?: string) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const tooltipText = [
    `Quality: ${getQualityLabel()}`,
    as_of && `As of: ${formatAsOf(as_of)}`,
    source && `Source: ${source}`,
    isStale && '⚠️ Data may be stale'
  ].filter(Boolean).join('\n');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getQualityColor()}`}
      title={tooltipText}
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {isStale && <span className="mr-1">⚠️</span>}
      <span className="font-semibold">{getQualityLabel()}</span>
      {as_of && (
        <span className="ml-1.5 text-[10px] opacity-70">
          {formatAsOf(as_of)}
        </span>
      )}
    </span>
  );
}


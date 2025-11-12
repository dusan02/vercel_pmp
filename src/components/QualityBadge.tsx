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
    if (isStale) return 'text-orange-600 bg-orange-50';
    switch (quality) {
      case 'delayed_15m':
        return 'text-yellow-600 bg-yellow-50';
      case 'rest':
        return 'text-green-600 bg-green-50';
      case 'snapshot':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
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
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getQualityColor()}`}
      title={tooltipText}
    >
      {isStale && '⚠️ '}
      {getQualityLabel()}
      {as_of && (
        <span className="ml-1 text-xs opacity-75">
          ({formatAsOf(as_of)})
        </span>
      )}
    </span>
  );
}


'use client';

import React from 'react';

interface MobileEmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Unified empty state component for mobile
 * Consistent design across all screens
 */
export function MobileEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: MobileEmptyStateProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center"
      style={{
        background: '#0f0f0f',
      }}
    >
      <div 
        className="text-6xl mb-2"
        style={{
          opacity: 0.3,
        }}
      >
        {icon}
      </div>
      <span 
        className="text-base font-semibold"
        style={{
          color: '#ffffff',
        }}
      >
        {title}
      </span>
      {description && (
        <span 
          className="text-sm max-w-xs"
          style={{
            color: 'rgba(255, 255, 255, 0.6)',
          }}
        >
          {description}
        </span>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors"
          style={{ 
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

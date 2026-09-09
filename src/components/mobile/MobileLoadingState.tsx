'use client';

import React from 'react';

interface MobileLoadingStateProps {
  message?: string;
}

/**
 * Unified loading state component for mobile
 * Consistent spinner and message
 */
export function MobileLoadingState({ message = 'Loading...' }: MobileLoadingStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      height: '100%',
      background: '#0f0f0f',
      padding: '2rem',
    }}>
      <div 
        className="animate-spin rounded-full border-b-2 border-white"
        style={{
          width: '32px',
          height: '32px',
        }}
      />
      <span style={{
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '14px',
      }}>
        {message}
      </span>
    </div>
  );
}

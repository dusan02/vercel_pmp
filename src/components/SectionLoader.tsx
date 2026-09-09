/**
 * Shared Section Loader Component
 * Used across all sections for consistent loading states
 */

import React from 'react';

interface SectionLoaderProps {
  message?: string;
}

export function SectionLoader({ message = 'Loading...' }: SectionLoaderProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center gap-3 p-8"
      style={{
        background: '#0f0f0f',
      }}
    >
      <div 
        className="animate-spin rounded-full border-b-2 border-white"
        style={{
          width: '32px',
          height: '32px',
        }}
        aria-hidden="true"
      />
      <span 
        style={{
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '14px',
        }}
      >
        {message}
      </span>
    </div>
  );
}


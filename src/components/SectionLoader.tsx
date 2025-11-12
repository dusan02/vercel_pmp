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
    <div className="flex items-center justify-center p-8">
      <span className="text-gray-600">{message}</span>
    </div>
  );
}


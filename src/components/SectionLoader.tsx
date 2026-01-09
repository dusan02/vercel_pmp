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
    <div className="flex items-center justify-center gap-3 p-8">
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-200"
        aria-hidden="true"
      />
      <span className="text-gray-700 dark:text-gray-300">{message}</span>
    </div>
  );
}


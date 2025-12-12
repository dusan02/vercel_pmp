/**
 * Heatmap View Button Component
 * Primary action button for navigating to full heatmap
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { BUTTON_PRIMARY_SM } from '@/lib/utils/buttonStyles';

interface HeatmapViewButtonProps {
  className?: string;
}

export function HeatmapViewButton({ className = '' }: HeatmapViewButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/heatmap')}
      className={`${BUTTON_PRIMARY_SM} ${className}`}
      aria-label="View full heatmap"
    >
      View Full Heatmap →
    </button>
  );
}


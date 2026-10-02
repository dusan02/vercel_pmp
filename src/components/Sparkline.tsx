'use client';

import React, { useMemo } from 'react';

interface SparklineProps {
  /** Close prices, oldest → newest. */
  data: number[] | null;
  width?: number;
  height?: number;
}

/**
 * Minimal SVG sparkline — no chart lib, just a polyline.
 * Color follows overall trend (first → last close): green up, red down.
 */
export function Sparkline({ data, width = 72, height = 24 }: SparklineProps) {
  const { points, up } = useMemo(() => {
    if (!data || data.length < 2) return { points: '', up: true };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const pad = 1;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
      // Flat series → midline; otherwise normalized to viewBox height
      const y = range === 0
        ? height / 2
        : pad + (1 - (v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { points: pts.join(' '), up: data[data.length - 1]! >= data[0]! };
  }, [data, width, height]);

  if (!points) return <span className="text-gray-300 dark:text-gray-600">—</span>;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={up ? 'stroke-emerald-500' : 'stroke-rose-500'}
      />
    </svg>
  );
}

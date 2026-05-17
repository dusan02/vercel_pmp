import React, { useMemo } from 'react';
import { toET } from '@/lib/utils/dateET';

interface Point {
  ts: string; // ISO string
  price: number;
}

interface MiniIntradayChartProps {
  points: Point[];
  width?: number;
  height?: number;
}

const PRE_START = 4 * 60; // 04:00 ET
const OPEN = 9 * 60 + 30; // 09:30 ET
const CLOSE = 16 * 60; // 16:00 ET
const AFTER_END = 20 * 60; // 20:00 ET
const TOTAL_SPAN = AFTER_END - PRE_START;

function minutesSinceMidnightET(date: Date): number {
  const et = toET(date);
  return et.hour * 60 + et.minute;
}

export function MiniIntradayChart({ points, width = 160, height = 64 }: MiniIntradayChartProps) {
  const { path, min, max } = useMemo(() => {
    if (!points || points.length === 0) return { path: '', min: 0, max: 0 };
    const prices = points.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const span = Math.max(maxPrice - minPrice || 1, 0.0001);

    const d = points.map((p, idx) => {
      const date = new Date(p.ts);
      const mins = minutesSinceMidnightET(date);
      const x = Math.max(0, Math.min(width, ((mins - PRE_START) / TOTAL_SPAN) * width));
      const y = height - ((p.price - minPrice) / span) * height;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return { path: d, min: minPrice, max: maxPrice };
  }, [points, width, height]);

  return (
    <svg width={width} height={height} className="block">
      {/* Session backgrounds */}
      <rect x={0} y={0} width={(OPEN - PRE_START) / TOTAL_SPAN * width} height={height} fill="rgba(59,130,246,0.06)" />
      <rect x={(OPEN - PRE_START) / TOTAL_SPAN * width} y={0} width={(CLOSE - OPEN) / TOTAL_SPAN * width} height={height} fill="rgba(16,185,129,0.06)" />
      <rect x={(CLOSE - PRE_START) / TOTAL_SPAN * width} y={0} width={(AFTER_END - CLOSE) / TOTAL_SPAN * width} height={height} fill="rgba(249,115,22,0.06)" />

      {/* Axis baseline */}
      <line x1={0} y1={height} x2={width} y2={height} stroke="rgba(148,163,184,0.4)" strokeWidth={1} />

      {/* Sparkline */}
      {path && (
        <path
          d={path}
          fill="none"
          stroke="url(#mini-gradient)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}

      <defs>
        <linearGradient id="mini-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
    </svg>
  );
}

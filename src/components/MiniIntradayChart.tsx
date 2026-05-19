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
  positive?: boolean;
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

export function MiniIntradayChart({ points, width = 120, height = 40, positive = true }: MiniIntradayChartProps) {
  const { linePath, areaPath } = useMemo(() => {
    if (!points || points.length === 0) return { linePath: '', areaPath: '' };
    const prices = points.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const span = Math.max(maxPrice - minPrice || 1, 0.0001);
    const pad = 2;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;

    const coords = points.map((p, idx) => {
      const date = new Date(p.ts);
      const mins = minutesSinceMidnightET(date);
      const x = pad + Math.max(0, Math.min(drawW, ((mins - PRE_START) / TOTAL_SPAN) * drawW));
      const y = pad + drawH - ((p.price - minPrice) / span) * drawH;
      return { x, y };
    });

    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const lastCoord = coords[coords.length - 1];
    const firstCoord = coords[0];
    const area = line + ` L${lastCoord!.x.toFixed(1)},${height} L${firstCoord!.x.toFixed(1)},${height} Z`;

    return { linePath: line, areaPath: area };
  }, [points, width, height]);

  const id = `spark-${positive ? 'up' : 'dn'}-${width}`;
  const strokeColor = positive ? '#10b981' : '#ef4444';
  const fillStart = positive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  const fillEnd = positive ? 'rgba(16,185,129,0)' : 'rgba(239,68,68,0)';

  return (
    <svg width={width} height={height} className="block" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillStart} />
          <stop offset="100%" stopColor={fillEnd} />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#${id})`} />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

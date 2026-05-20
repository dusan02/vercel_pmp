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

// Full trading day: premarket → midnight ET
const PRE_START  = 4 * 60;       // 04:00 ET — premarket open
const OPEN       = 9 * 60 + 30; // 09:30 ET — regular open
const CLOSE      = 16 * 60;     // 16:00 ET — regular close
const AFTER_END  = 24 * 60;     // 24:00 ET — midnight
const TOTAL_SPAN = AFTER_END - PRE_START; // 1200 min

function minutesSinceMidnightET(date: Date): number {
  const et = toET(date);
  return et.hour * 60 + et.minute;
}

export function MiniIntradayChart({ points, width = 148, height = 48, positive = true }: MiniIntradayChartProps) {
  const { linePath, areaPath } = useMemo(() => {
    if (!points || points.length === 0) return { linePath: '', areaPath: '' };

    const prices = points.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const span = Math.max(maxPrice - minPrice, 0.0001);

    // Vertical padding: 8% top + bottom so the line is never clipped
    const PAD_X = 1;
    const PAD_Y = height * 0.1;
    const drawW = width - PAD_X * 2;
    const drawH = height - PAD_Y * 2;

    const coords = points.map(p => {
      const mins = minutesSinceMidnightET(new Date(p.ts));
      // Clamp X to [0, drawW]
      const x = PAD_X + Math.max(0, Math.min(drawW, ((mins - PRE_START) / TOTAL_SPAN) * drawW));
      // Invert Y: higher price → smaller y; pad top+bottom
      const y = PAD_Y + drawH - ((p.price - minPrice) / span) * drawH;
      return { x, y };
    });

    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');

    const last  = coords[coords.length - 1]!;
    const first = coords[0]!;
    const area  = `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`;

    return { linePath: line, areaPath: area };
  }, [points, width, height]);

  const gradId      = `spark-${positive ? 'up' : 'dn'}-${width}`;
  const strokeColor = positive ? '#10b981' : '#ef4444';
  const fillTop     = positive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)';
  const fillBot     = positive ? 'rgba(16,185,129,0)'    : 'rgba(239,68,68,0)';

  // Zone x positions
  const xOpen  = ((OPEN  - PRE_START) / TOTAL_SPAN) * width;
  const xClose = ((CLOSE - PRE_START) / TOTAL_SPAN) * width;

  return (
    <svg width={width} height={height} className="block w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={fillTop} />
          <stop offset="100%" stopColor={fillBot} />
        </linearGradient>
      </defs>

      {/* Session zones: premarket / regular / after-hours */}
      <rect x={0}      y={0} width={xOpen}         height={height} fill="rgba(99,102,241,0.04)" />
      <rect x={xOpen}  y={0} width={xClose - xOpen} height={height} fill="rgba(16,185,129,0.04)" />
      <rect x={xClose} y={0} width={width - xClose} height={height} fill="rgba(249,115,22,0.04)" />

      {/* Area fill */}
      {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

      {/* Price line */}
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

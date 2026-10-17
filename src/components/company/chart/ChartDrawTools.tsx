'use client';

import React, { useState } from 'react';
import {
  useXAxisScale,
  useYAxisScale,
  useXAxisInverseDataSnapScale,
  useYAxisInverseScale,
  usePlotArea,
} from 'recharts';

/**
 * XTB-style drawing tools for the price chart: drag-to-measure (Δ$, Δ%, bars)
 * and trendlines. Rendered as a direct child of <ComposedChart> — recharts 3
 * supplies the real axis scales + plot area via hooks, so drawing coordinates
 * are always pixel-perfect with zero margin guessing.
 *
 * A transparent <rect> over the plot area captures pointer events only while
 * a tool is armed, so normal chart hover/tooltip behavior is untouched.
 */

export interface DrawPoint { date: string; v: number }
export interface Drawing { kind: 'measure' | 'trend'; a: DrawPoint; b: DrawPoint }
export type DrawTool = 'measure' | 'trend' | null;

export interface ChartDrawLayerProps {
  tool: DrawTool;
  drawings: Drawing[];
  onAdd: (d: Drawing) => void;
  /** Visible-window date order — for band-index → "N bars" in measure labels. */
  dates: string[];
}

const UP = '#16a34a';
const DOWN = '#dc2626';
const TREND = '#8b5cf6'; // violet — distinct from candle/indicator colors

export function ChartDrawLayer({ tool, drawings, onAdd, dates }: ChartDrawLayerProps) {
  const xs = useXAxisScale();                       // (date, {position:'middle'}) → px
  const ys = useYAxisScale();                       // value → px
  const xInv = useXAxisInverseDataSnapScale();      // px → nearest date
  const yInv = useYAxisInverseScale();              // px → value
  const plot = usePlotArea();                       // {x,y,width,height} in svg px
  const [draft, setDraft] = useState<Drawing | null>(null);

  if (!xs || !ys || !xInv || !yInv || !plot) return null;
  const L = plot.x, T = plot.y, R = plot.x + plot.width, B = plot.y + plot.height;

  const xOf = (date: string): number | null => {
    const px = xs(date, { position: 'middle' });
    return typeof px === 'number' ? px : null;
  };
  const yOf = (v: number): number | null => {
    const py = ys(v);
    return typeof py === 'number' ? py : null;
  };

  const toPoint = (e: React.PointerEvent): DrawPoint | null => {
    const svg = (e.currentTarget as SVGRectElement).ownerSVGElement;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = Math.min(Math.max(e.clientX - r.left, L), R);
    const py = Math.min(Math.max(e.clientY - r.top, T), B);
    const date = xInv(px);
    const v = yInv(py);
    return typeof date === 'string' && typeof v === 'number' && Number.isFinite(v) ? { date, v } : null;
  };

  const down = (e: React.PointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    const p = toPoint(e);
    if (!p) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDraft({ kind: tool, a: p, b: p });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = toPoint(e);
    if (p) setDraft({ ...draft, b: p });
  };
  const up = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = toPoint(e);
    const final = p ? { ...draft, b: p } : draft;
    // Ignore plain clicks (no drag) — a zero-width annotation is noise.
    if (Math.abs(dates.indexOf(final.b.date) - dates.indexOf(final.a.date)) >= 1) {
      onAdd(final);
    }
    setDraft(null);
  };

  const all = draft ? [...drawings, draft] : drawings;

  return (
    <g>
      {tool && (
        <rect
          x={L}
          y={T}
          width={plot.width}
          height={plot.height}
          fill="transparent"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
        />
      )}
      {all.map((d, i) => {
        const x1 = xOf(d.a.date), x2 = xOf(d.b.date);
        const y1 = yOf(d.a.v), y2 = yOf(d.b.v);
        if (x1 == null || x2 == null || y1 == null || y2 == null) return null; // endpoint outside the visible window/domain
        const isDraft = draft != null && i === all.length - 1;

        if (d.kind === 'trend') {
          // Extend through the plot bounds in both directions.
          const dx = x2 - x1, dy = y2 - y1;
          let ex1 = x1, ey1 = y1, ex2 = x2, ey2 = y2;
          if (dx !== 0) {
            const m = dy / dx;
            ex1 = L; ey1 = y1 + m * (L - x1);
            ex2 = R; ey2 = y1 + m * (R - x1);
            ey1 = Math.min(Math.max(ey1, T), B);
            ey2 = Math.min(Math.max(ey2, T), B);
            if (m !== 0) {
              ex1 = x1 + (ey1 - y1) / m;
              ex2 = x1 + (ey2 - y1) / m;
            }
          }
          return (
            <g key={i} opacity={isDraft ? 0.7 : 1}>
              <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke={TREND} strokeWidth={1.5} strokeDasharray={isDraft ? '4 3' : undefined} />
              <circle cx={x1} cy={y1} r={3} fill={TREND} stroke="#fff" strokeWidth={1} />
              <circle cx={x2} cy={y2} r={3} fill={TREND} stroke="#fff" strokeWidth={1} />
            </g>
          );
        }

        // measure — XTB-style box: shaded rect + edge line + Δ label
        const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1);
        const ry = Math.min(y1, y2), rh = Math.abs(y2 - y1);
        const pct = d.a.v !== 0 ? (d.b.v / d.a.v - 1) * 100 : 0;
        const bars = Math.abs(dates.indexOf(d.b.date) - dates.indexOf(d.a.date));
        const color = pct >= 0 ? UP : DOWN;
        const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%  $${Math.abs(d.b.v - d.a.v).toFixed(2)}  ·  ${bars} bars`;
        const labelY = ry > T + 18 ? ry - 5 : ry + rh + 14;
        const labelX = Math.min(Math.max(rx + rw / 2, L + 60), R - 60);
        return (
          <g key={i} opacity={isDraft ? 0.85 : 1}>
            <rect x={rx} y={ry} width={rw} height={rh} fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.5} strokeDasharray="4 3" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} />
            <circle cx={x1} cy={y1} r={3} fill={color} stroke="#fff" strokeWidth={1} />
            <circle cx={x2} cy={y2} r={3} fill={color} stroke="#fff" strokeWidth={1} />
            <text x={labelX} y={labelY} textAnchor="middle" fontSize={11} fontWeight={600} fill={color} style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3 }}>
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const STORAGE_PREFIX = 'pmp:chart:draw:';

export function loadDrawings(ticker: string): Drawing[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ticker);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((d: any) => d?.a?.date && d?.b?.date && (d.kind === 'measure' || d.kind === 'trend')) : [];
  } catch { return []; }
}

export function saveDrawings(ticker: string, drawings: Drawing[]) {
  try { localStorage.setItem(STORAGE_PREFIX + ticker, JSON.stringify(drawings.slice(-20))); } catch { /* quota/private mode */ }
}

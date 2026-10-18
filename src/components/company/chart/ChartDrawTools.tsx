'use client';

import React, { useEffect, useRef, useState } from 'react';
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
 * Two modes:
 *  - draw  (tool armed): a transparent rect over the plot captures drags
 *  - edit  (no tool):    endpoint handles + fat body hit-areas let the user
 *                        drag endpoints, translate whole shapes, or delete
 *                        the selected drawing via its × handle
 */

export interface DrawPoint { date: string; v: number }
export interface Drawing {
  kind: 'measure' | 'trend' | 'ray' | 'hline' | 'zone' | 'fibo';
  a: DrawPoint;
  b: DrawPoint;
}
export type DrawTool = Drawing['kind'] | null;

export interface ChartDrawLayerProps {
  tool: DrawTool;
  drawings: Drawing[];
  onAdd: (d: Drawing) => void;
  onUpdate: (idx: number, d: Drawing) => void;
  onDelete: (idx: number) => void;
  /** Visible-window date order — for band-index → "N bars" in measure labels. */
  dates: string[];
}

const UP = '#16a34a';
const DOWN = '#dc2626';
const TREND = '#8b5cf6'; // violet — distinct from candle/indicator colors
const HLINE = '#0891b2'; // teal — horizontal S/R levels
const ZONE = '#d97706';  // amber — supply/demand zones
const FIBO = '#7c3aed';  // purple — fibonacci levels
const FIBO_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

type DragRef = {
  idx: number;
  part: 'a' | 'b' | 'all';
  px0: { x1: number; y1: number; x2: number; y2: number };
  cx: number;
  cy: number;
};

export function ChartDrawLayer({ tool, drawings, onAdd, onUpdate, onDelete, dates }: ChartDrawLayerProps) {
  const xs = useXAxisScale();                       // (date, {position:'middle'}) → px
  const ys = useYAxisScale();                       // value → px
  const xInv = useXAxisInverseDataSnapScale();      // px → nearest date
  const yInv = useYAxisInverseScale();              // px → value
  const plot = usePlotArea();                       // {x,y,width,height} in svg px
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ idx: number; d: Drawing } | null>(null);
  const dragRef = useRef<DragRef | null>(null);

  // Leaving draw mode clears any stale selection; indices shift on delete.
  useEffect(() => { setSel(null); setEdit(null); dragRef.current = null; }, [tool]);

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

  const snapPoint = (svg: SVGSVGElement | null, clientX: number, clientY: number): DrawPoint | null => {
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = Math.min(Math.max(clientX - r.left, L), R);
    const py = Math.min(Math.max(clientY - r.top, T), B);
    const date = xInv(px);
    const v = yInv(py);
    return typeof date === 'string' && typeof v === 'number' && Number.isFinite(v) ? { date, v } : null;
  };
  const toPoint = (e: React.PointerEvent) =>
    snapPoint((e.currentTarget as SVGElement).ownerSVGElement, e.clientX, e.clientY);

  // ---- draw mode ------------------------------------------------------------
  const down = (e: React.PointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    const p = toPoint(e);
    if (!p) return;
    // Horizontal level is a single click — place it immediately.
    if (tool === 'hline') { onAdd({ kind: 'hline', a: p, b: p }); return; }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDraft({ kind: tool, a: p, b: p });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    e.stopPropagation(); // keep the chart tooltip out of the way while dragging
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

  // ---- edit mode ------------------------------------------------------------
  const invert = (px: number, py: number): DrawPoint | null => {
    const date = xInv(Math.min(Math.max(px, L), R));
    const v = yInv(Math.min(Math.max(py, T), B));
    return typeof date === 'string' && typeof v === 'number' && Number.isFinite(v) ? { date, v } : null;
  };

  const editDown = (e: React.PointerEvent, idx: number, part: 'a' | 'b' | 'all') => {
    e.stopPropagation();
    e.preventDefault();
    const d = drawings[idx];
    if (!d) return;
    const px0 = { x1: xOf(d.a.date), y1: yOf(d.a.v), x2: xOf(d.b.date), y2: yOf(d.b.v) };
    if (px0.x1 == null || px0.y1 == null || px0.x2 == null || px0.y2 == null) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { idx, part, px0: { x1: px0.x1, y1: px0.y1, x2: px0.x2, y2: px0.y2 }, cx: e.clientX, cy: e.clientY };
    setSel(idx);
  };
  const editMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (!dr) return;
    e.stopPropagation();
    const dx = e.clientX - dr.cx, dy = e.clientY - dr.cy;
    const d = drawings[dr.idx];
    if (!d) return;
    let a = d.a, b = d.b;
    if (dr.part === 'all') {
      const na = invert(dr.px0.x1 + dx, dr.px0.y1 + dy);
      const nb = invert(dr.px0.x2 + dx, dr.px0.y2 + dy);
      if (na && nb) { a = na; b = nb; }
    } else {
      const p = dr.part === 'a'
        ? invert(dr.px0.x1 + dx, dr.px0.y1 + dy)
        : invert(dr.px0.x2 + dx, dr.px0.y2 + dy);
      if (p) { if (dr.part === 'a') a = p; else b = p; }
    }
    setEdit({ idx: dr.idx, d: { kind: d.kind, a, b } });
  };
  const editUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (edit) onUpdate(edit.idx, edit.d);
    setEdit(null);
  };

  // Render list: drawings with in-flight edit override + draft appended last.
  const shown = drawings.map((d, i) => (edit && edit.idx === i ? edit.d : d));
  const all = draft ? [...shown, draft] : shown;

  return (
    <g>
      {tool ? (
        <rect
          x={L} y={T} width={plot.width} height={plot.height}
          fill="transparent" style={{ cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up}
        />
      ) : drawings.length > 0 ? (
        // Click on empty plot deselects; hover events bubble through to the
        // chart so the price tooltip keeps working.
        <rect
          x={L} y={T} width={plot.width} height={plot.height}
          fill="transparent" onPointerDown={() => setSel(null)}
        />
      ) : null}
      {all.map((d, i) => {
        const x1 = xOf(d.a.date), x2 = xOf(d.b.date);
        const y1 = yOf(d.a.v), y2 = yOf(d.b.v);
        if (x1 == null || x2 == null || y1 == null || y2 == null) return null; // endpoint outside the visible window/domain
        const isDraft = draft != null && i === all.length - 1;
        const editable = !tool && !isDraft;
        const selected = sel === i;
        const color = d.kind === 'trend' || d.kind === 'ray' ? TREND
          : d.kind === 'hline' ? HLINE
          : d.kind === 'zone' ? ZONE
          : d.kind === 'fibo' ? FIBO
          : (d.b.v / d.a.v - 1) >= 0 ? UP : DOWN;

        const handles = editable && (
          <g style={{ pointerEvents: 'all' }}>
            {(['a', 'b'] as const).map((part) => (
              <circle
                key={part}
                cx={part === 'a' ? x1 : x2} cy={part === 'a' ? y1 : y2}
                r={10} fill="transparent"
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={(e) => editDown(e, i, part)}
                onPointerMove={editMove} onPointerUp={editUp}
              />
            ))}
            <circle cx={x1} cy={y1} r={3.5} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />
            <circle cx={x2} cy={y2} r={3.5} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />
          </g>
        );
        const delX = d.kind === 'hline' ? x1 : (x1 + x2) / 2;
        const deleteBtn = editable && selected && (
          <g
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => { e.stopPropagation(); onDelete(i); setSel(null); }}
          >
            <circle cx={delX} cy={Math.min(y1, y2) - 12} r={8} fill="#fff" stroke={color} strokeWidth={1.2} />
            <text x={delX} y={Math.min(y1, y2) - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>×</text>
          </g>
        );

        if (d.kind === 'hline') {
          // Single-point level line across the whole plot with a price label.
          return (
            <g key={i}>
              {editable && (
                <line x1={L} y1={y1} x2={R} y2={y1} stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'ns-resize', touchAction: 'none' }}
                  onPointerDown={(e) => editDown(e, i, 'all')}
                  onPointerMove={editMove} onPointerUp={editUp} />
              )}
              <line x1={L} y1={y1} x2={R} y2={y1} stroke={color}
                strokeWidth={selected ? 2.5 : 1.5} strokeDasharray="6 4" style={{ pointerEvents: 'none' }} />
              <text x={R - 4} y={y1 - 4} textAnchor="end" fontSize={10} fontWeight={600} fill={color}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
                ${d.a.v.toFixed(2)}
              </text>
              {deleteBtn}
            </g>
          );
        }

        if (d.kind === 'zone') {
          // Supply/demand rectangle — shaded band between two price levels
          // over the dragged date range, no diagonal or Δ label.
          const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1);
          const ry = Math.min(y1, y2), rh = Math.abs(y2 - y1);
          const lo = Math.min(d.a.v, d.b.v), hi = Math.max(d.a.v, d.b.v);
          return (
            <g key={i} opacity={isDraft ? 0.8 : 1}>
              {editable && (
                <rect x={rx - 5} y={ry - 5} width={rw + 10} height={rh + 10} fill="transparent"
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={(e) => editDown(e, i, 'all')}
                  onPointerMove={editMove} onPointerUp={editUp} />
              )}
              <rect x={rx} y={ry} width={rw} height={rh} fill={color}
                fillOpacity={selected ? 0.18 : 0.1} stroke={color}
                strokeOpacity={selected ? 0.9 : 0.55} strokeWidth={1}
                style={{ pointerEvents: 'none' }} />
              <text x={rx + 4} y={ry - 4} fontSize={9.5} fontWeight={600} fill={color}
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
                ${lo.toFixed(0)}–${hi.toFixed(0)}
              </text>
              {handles}
              {deleteBtn}
            </g>
          );
        }

        if (d.kind === 'ray') {
          // Ray — a→b direction only, extends past b to the plot edge.
          const dx = x2 - x1, dy = y2 - y1;
          let ex = x2, ey = y2;
          if (dx !== 0) {
            const m = dy / dx;
            const edge = dx > 0 ? R : L;
            ey = Math.min(Math.max(y1 + m * (edge - x1), T), B);
            ex = m !== 0 ? x1 + (ey - y1) / m : edge;
          } else {
            ey = dy > 0 ? B : T; // vertical ray
          }
          return (
            <g key={i} opacity={isDraft ? 0.7 : 1}>
              {editable && (
                <line x1={x1} y1={y1} x2={ex} y2={ey} stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={(e) => editDown(e, i, 'all')}
                  onPointerMove={editMove} onPointerUp={editUp} />
              )}
              <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color}
                strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={isDraft ? '4 3' : undefined}
                style={{ pointerEvents: 'none' }} />
              {handles}
              {deleteBtn}
            </g>
          );
        }

        if (d.kind === 'fibo') {
          // Fibonacci retracement — levels between a (0%) and b (100%) drawn
          // horizontally over the dragged date range.
          const x0 = Math.min(x1, x2), xE = Math.max(x1, x2);
          return (
            <g key={i} opacity={isDraft ? 0.75 : 1}>
              {editable && (
                <rect x={x0} y={Math.min(y1, y2)} width={xE - x0} height={Math.abs(y2 - y1)}
                  fill="transparent"
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={(e) => editDown(e, i, 'all')}
                  onPointerMove={editMove} onPointerUp={editUp} />
              )}
              {/* golden-pocket shading between 38.2% and 61.8% */}
              <rect x={x0} y={y1 + (y2 - y1) * 0.382} width={xE - x0}
                height={Math.abs((y2 - y1) * (0.618 - 0.382))}
                fill={color} fillOpacity={0.06} style={{ pointerEvents: 'none' }} />
              {FIBO_LEVELS.map((lvl) => {
                const py = y1 + (y2 - y1) * lvl;
                const pv = d.a.v + (d.b.v - d.a.v) * lvl;
                return (
                  <g key={lvl}>
                    <line x1={x0} y1={py} x2={xE} y2={py} stroke={color}
                      strokeWidth={lvl === 0 || lvl === 1 ? 1.5 : 0.75}
                      strokeDasharray={lvl === 0 || lvl === 1 ? undefined : '4 3'}
                      strokeOpacity={lvl === 0 || lvl === 1 ? 0.9 : 0.55}
                      style={{ pointerEvents: 'none' }} />
                    <text x={x0 + 3} y={py - 2} fontSize={9} fontWeight={600} fill={color}
                      fillOpacity={lvl === 0 || lvl === 1 ? 1 : 0.8}
                      style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
                      {(lvl * 100).toFixed(1)}% · ${pv.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              {handles}
              {deleteBtn}
            </g>
          );
        }

        if (d.kind === 'trend') {
          // Bounded segment — exactly between the two points the user picked.
          return (
            <g key={i} opacity={isDraft ? 0.7 : 1}>
              {editable && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={(e) => editDown(e, i, 'all')}
                  onPointerMove={editMove} onPointerUp={editUp} />
              )}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color}
                strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={isDraft ? '4 3' : undefined}
                style={{ pointerEvents: 'none' }} />
              {isDraft && (
                <>
                  <circle cx={x1} cy={y1} r={3} fill={color} stroke="#fff" strokeWidth={1} />
                  <circle cx={x2} cy={y2} r={3} fill={color} stroke="#fff" strokeWidth={1} />
                </>
              )}
              {handles}
              {deleteBtn}
            </g>
          );
        }

        // measure — XTB-style box: shaded rect + edge line + Δ label
        const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1);
        const ry = Math.min(y1, y2), rh = Math.abs(y2 - y1);
        const pct = d.a.v !== 0 ? (d.b.v / d.a.v - 1) * 100 : 0;
        const bars = Math.abs(dates.indexOf(d.b.date) - dates.indexOf(d.a.date));
        const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%  $${Math.abs(d.b.v - d.a.v).toFixed(2)}  ·  ${bars} bars`;
        const labelY = ry > T + 18 ? ry - 5 : ry + rh + 14;
        const labelX = Math.min(Math.max(rx + rw / 2, L + 60), R - 60);
        return (
          <g key={i} opacity={isDraft ? 0.85 : 1}>
            {editable && (
              <rect x={rx - 5} y={ry - 5} width={rw + 10} height={rh + 10} fill="transparent"
                style={{ cursor: 'move', touchAction: 'none' }}
                onPointerDown={(e) => editDown(e, i, 'all')}
                onPointerMove={editMove} onPointerUp={editUp} />
            )}
            <rect x={rx} y={ry} width={rw} height={rh} fill={color}
              fillOpacity={selected ? 0.15 : 0.08} stroke={color}
              strokeOpacity={selected ? 0.9 : 0.5} strokeDasharray={isDraft ? '4 3' : '4 3'}
              style={{ pointerEvents: 'none' }} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={selected ? 2.5 : 1.5} style={{ pointerEvents: 'none' }} />
            <text x={labelX} y={labelY} textAnchor="middle" fontSize={11} fontWeight={600} fill={color}
              style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
              {label}
            </text>
            {handles}
            {deleteBtn}
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
    return Array.isArray(arr) ? arr.filter((d: any) =>
      d?.a?.date && d?.b?.date &&
      ['measure', 'trend', 'ray', 'hline', 'zone', 'fibo'].includes(d.kind)) : [];
  } catch { return []; }
}

export function saveDrawings(ticker: string, drawings: Drawing[]) {
  try { localStorage.setItem(STORAGE_PREFIX + ticker, JSON.stringify(drawings.slice(-20))); } catch { /* quota/private mode */ }
}

'use client';

import React, { useEffect, useImperativeHandle, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Line,
  Cell,
  ReferenceLine,
  useXAxisScale,
  useYAxisScale,
  usePlotArea,
} from 'recharts';
import { CHART_FONT } from '@/components/charts/chartTheme';
import { event as gaEvent } from '@/lib/ga';
import type { NavDimension, NavNeighbor } from '@/lib/analysis/tickerNav';
import { formatFairDollar } from '@/lib/valuation/fairValue';
import {
  type ChartPoint,
  type MetricDef,
  type MetricField,
  type MetricStats,
  type IndKey,
  METRIC_BY_KEY,
  fmtMetric,
  impliedPerShare,
  fmtVol,
  UP,
  DOWN,
  FWD_CONS,
  MA20,
  MA50,
  MA200,
  FAIR_COLOR,
  PE_LINE,
  VOL_SPIKE,
  BB_COLOR,
  RSI_COLOR,
  MACD_COLOR,
} from './priceChartMath';

interface LineLabelProps {
  index?: number | undefined;
  value?: string | number | boolean | null | undefined;
  x?: number | string | undefined;
  y?: number | string | undefined;
}

/** Compare-mode line-end tag rendered at the last valid data point. */
export function lineEndTag(text: string, color: string, endIdx: number, dy: number) {
  return function LineEndTag(props: LineLabelProps) {
    if (
      props.index !== endIdx ||
      props.value == null ||
      typeof props.x !== 'number' ||
      typeof props.y !== 'number'
    ) {
      return null;
    }
    return (
      <text
        x={props.x + 6}
        y={props.y + dy}
        fontSize={10}
        fontWeight={700}
        fill={color}
        stroke="none"
        style={{ pointerEvents: 'none' }}
      >
        {text}
      </text>
    );
  };
}

/** Custom candlestick + volume bar rendered via Recharts 3 axis/plot hooks. */
export function CandleShape({
  x,
  width,
  payload,
  volFrac,
  maxVolume,
  showVolSpike,
  fallbackDomain,
  fallbackPlotHeight,
}: {
  x?: number;
  width?: number;
  payload?: ChartPoint;
  volFrac: number;
  maxVolume: number;
  showVolSpike: boolean;
  fallbackDomain: [number, number];
  fallbackPlotHeight: number;
}) {
  const ys = useYAxisScale();
  const plot = usePlotArea();
  const d = payload;
  if (!d || x == null || width == null) return null;

  const top = plot?.y ?? 8;
  const plotHeight = plot?.height ?? fallbackPlotHeight;
  const [minY, maxY] = fallbackDomain;
  const range = maxY - minY;
  const getY = (val: number) => {
    if (ys) {
      const py = ys(val);
      if (typeof py === 'number' && Number.isFinite(py)) return py;
    }
    if (range === 0) return top + plotHeight / 2;
    return top + plotHeight * (1 - (val - minY) / range);
  };

  const cx = x + width / 2;
  const up = d.c >= d.o;
  const color = up ? UP : DOWN;

  const yHigh = getY(d.h);
  const yLow = getY(d.l);
  const yOpen = getY(d.o);
  const yClose = getY(d.c);
  const bodyTop = Math.min(yOpen, yClose);
  const bodyH = Math.max(1, Math.abs(yClose - yOpen));

  const volTop = top + plotHeight * (1 - volFrac);
  const yBottom = top + plotHeight;
  const vH = maxVolume > 0 ? ((d.v || 0) / maxVolume) * (yBottom - volTop) : 0;

  const bodyW = Math.max(1, Math.min(width * 0.7, 14));
  const spike = showVolSpike && d.volSpike;

  return (
    <g key={d.t}>
      <rect
        x={cx - bodyW / 2}
        y={yBottom - vH}
        width={bodyW}
        height={vH}
        fill={spike ? VOL_SPIKE : color}
        opacity={spike ? 0.55 : 0.18}
      />
      <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
}

/** Green (price <= fair) and red (price > fair) stepAfter zone fills. */
export function FairValueZoneLayer({ data }: { data: ChartPoint[] }) {
  const xs = useXAxisScale();
  const ys = useYAxisScale();
  if (!xs || !ys || data.length < 2) return null;

  const xOf = (date: string): number | null => {
    const px = xs(date, { position: 'middle' });
    return typeof px === 'number' && Number.isFinite(px) ? px : null;
  };
  const yOf = (v: number): number | null => {
    const py = ys(v);
    return typeof py === 'number' && Number.isFinite(py) ? py : null;
  };

  const buyParts: string[] = [];
  const sellParts: string[] = [];
  const pushPoly = (dest: string[], pts: [number, number][]) => {
    dest.push(`M${pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join('L')}Z`);
  };

  for (let i = 0; i < data.length - 1; i++) {
    const d0 = data[i]!;
    const d1 = data[i + 1]!;
    if (d0.fv == null || !(d0.fv > 0) || d1.fv == null || !(d1.fv > 0)) continue;
    const x0 = xOf(d0.date);
    const x1 = xOf(d1.date);
    const yFv = yOf(d0.fv);
    const y0 = yOf(d0.c);
    const y1 = yOf(d1.c);
    if (x0 == null || x1 == null || yFv == null || y0 == null || y1 == null) continue;

    const diff0 = d0.c - d0.fv;
    const diff1 = d1.c - d1.fv;
    if (diff0 <= 0 && diff1 <= 0) {
      pushPoly(buyParts, [[x0, yFv], [x0, y0], [x1, y1], [x1, yFv]]);
    } else if (diff0 >= 0 && diff1 >= 0) {
      pushPoly(sellParts, [[x0, yFv], [x0, y0], [x1, y1], [x1, yFv]]);
    } else {
      const frac = Math.abs(diff0) / (Math.abs(diff0) + Math.abs(diff1));
      const xMid = x0 + frac * (x1 - x0);
      pushPoly(diff0 < 0 ? buyParts : sellParts, [[x0, yFv], [x0, y0], [xMid, yFv]]);
      pushPoly(diff1 < 0 ? buyParts : sellParts, [[xMid, yFv], [x1, y1], [x1, yFv]]);
    }
  }

  return (
    <g style={{ pointerEvents: 'none' }} data-testid="fair-value-zones">
      {buyParts.length > 0 && <path d={buyParts.join('')} fill={UP} fillOpacity={0.14} stroke="none" />}
      {sellParts.length > 0 && <path d={sellParts.join('')} fill={DOWN} fillOpacity={0.12} stroke="none" />}
    </g>
  );
}

interface MetricTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  metric: MetricField;
  stats: MetricStats | null;
}

/** Valuation-metric view tooltip — shows multiple value, denominator, and median delta. */
export function MetricTooltip({ active, payload, metric, stats }: MetricTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const m: MetricDef = METRIC_BY_KEY[metric];
  const raw = p[m.field];
  const val = raw != null && (m.allowNegative || raw > 0) ? raw : null;
  const ps = val != null ? impliedPerShare(p, m.field) : null;

  const denomRows: { label: string; text: string }[] = [];
  if (val != null) {
    if (metric === 'pe' && ps != null) denomRows.push({ label: 'TTM EPS', text: `$${ps.toFixed(2)}` });
    if (metric === 'peFwd' && ps != null) denomRows.push({ label: 'NTM EPS', text: `$${ps.toFixed(2)} (realized)` });
    if (metric === 'ps' && ps != null) denomRows.push({ label: 'TTM rev/sh', text: `$${ps.toFixed(2)}` });
    if (metric === 'pb' && ps != null) denomRows.push({ label: 'Book/sh', text: `$${ps.toFixed(2)}` });
    if (metric === 'evEbit' && p.mcap != null) denomRows.push({ label: 'Mkt cap', text: `$${fmtVol(p.mcap)}` });
    if (metric === 'fcfYield' && p.mcap != null) denomRows.push({ label: 'TTM FCF', text: `$${fmtVol(val * p.mcap)}` });
  }
  const cons = metric === 'peFwd' && p.peCons != null && p.peCons > 0 ? p.peCons : null;
  const seriesLabel = m.seriesLabel ?? m.label;

  const betterVsMedian = val != null && stats
    ? (m.lowerIsBetter ? val <= stats.median : val >= stats.median)
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <div className="text-gray-500 dark:text-gray-400 mb-2 font-medium">
        {new Date(p.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        {val != null ? (
          <>
            <span style={{ color: PE_LINE }}>{seriesLabel}</span>
            <span className="text-right font-semibold text-gray-900 dark:text-white">{fmtMetric(val, m.unit)}</span>
          </>
        ) : (
          <>
            <span className="text-gray-500 dark:text-gray-400">{seriesLabel}</span>
            <span className="text-right text-gray-400 dark:text-gray-500">n/m</span>
          </>
        )}
        {cons != null && (
          <>
            <span style={{ color: FWD_CONS }}>Consensus fwd P/E</span>
            <span className="text-right font-medium" style={{ color: FWD_CONS }}>{fmtMetric(cons, '×')}</span>
          </>
        )}
        {denomRows.map(r => (
          <React.Fragment key={r.label}>
            <span className="text-gray-500 dark:text-gray-400">{r.label}</span>
            <span className="text-right text-gray-700 dark:text-gray-300">{r.text}</span>
          </React.Fragment>
        ))}
        {val != null && stats && (
          <>
            <span className="text-gray-500 dark:text-gray-400">vs median</span>
            <span className="text-right" style={{ color: betterVsMedian ? UP : DOWN }}>
              {((val - stats.median) / Math.abs(stats.median)) * 100 >= 0 ? '+' : ''}
              {(((val - stats.median) / Math.abs(stats.median)) * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const NAV_ARROW_CLS =
  'inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-100 transition-colors';

/** Prev/next stepper for the in-chart ticker slider. */
export function ChartNavArrow({ direction, neighbor, navMode, fromTicker }: {
  direction: 'previous' | 'next';
  neighbor: NavNeighbor | null;
  navMode: NavDimension;
  fromTicker: string;
}) {
  const arrow = direction === 'previous' ? '←' : '→';
  const word = direction === 'previous' ? 'Previous' : 'Next';
  if (!neighbor) {
    return (
      <span className={`${NAV_ARROW_CLS} opacity-30 cursor-not-allowed`} aria-disabled="true" title={`No ${word.toLowerCase()} stock`}>
        <span aria-hidden="true">{arrow}</span>
      </span>
    );
  }
  return (
    <Link
      href={`/analysis/${neighbor.symbol}?nav=${navMode}`}
      scroll={false}
      prefetch
      title={`${word} stock${neighbor.name ? ` — ${neighbor.name}` : ''}`}
      aria-label={`${word} stock: ${neighbor.symbol}`}
      onClick={() => gaEvent('stock_navigator_click', { ticker_from: fromTicker, ticker_to: neighbor.symbol, dimension: navMode, direction, location: 'chart' })}
      className={NAV_ARROW_CLS}
    >
      {direction === 'previous'
        ? <><span aria-hidden="true">{arrow}</span><span>{neighbor.symbol}</span></>
        : <><span>{neighbor.symbol}</span><span aria-hidden="true">{arrow}</span></>}
    </Link>
  );
}

/** Labeled group of similar-ticker chips (cap peers / sector / industry). */
export function SimilarChips({ label, dim, items, from }: {
  label: string;
  dim: NavDimension;
  items: NavNeighbor[];
  from: string;
}) {
  if (!items.length) return null;
  return (
    <span className="flex items-center gap-0.5 flex-wrap min-w-0">
      <span className="font-semibold text-gray-400 dark:text-gray-500 mr-0.5 shrink-0">{label}:</span>
      {items.map((n) => (
        <Link
          key={n.symbol}
          href={`/analysis/${n.symbol}?nav=${dim}`}
          scroll={false}
          prefetch
          title={n.name ?? n.symbol}
          onClick={() => gaEvent('stock_navigator_click', { ticker_from: from, ticker_to: n.symbol, dimension: dim, direction: 'similar', location: 'chart' })}
          className="px-1 py-0.5 rounded font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
        >
          {n.symbol}
        </Link>
      ))}
    </span>
  );
}

export interface PriceReadoutStripHandle {
  setHoverIndex: (idx: number | null) => void;
}

/** TradingView-style OHLC / benchmark / indicator readout strip above the plot. */
export const PriceReadoutStrip = React.forwardRef<
  PriceReadoutStripHandle,
  {
    data?: ChartPoint[] | undefined;
    hd: ChartPoint | undefined;
    ticker: string;
    bmActive: boolean;
    bmLabel: string;
    inds: Set<IndKey>;
    medianPe: number | null;
  }
>(function PriceReadoutStrip({
  data,
  hd,
  ticker,
  bmActive,
  bmLabel,
  inds,
  medianPe,
}, ref) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    setHoverIdx(null);
  }, [data, ticker]);

  useImperativeHandle(
    ref,
    () => ({
      setHoverIndex: (idx) => setHoverIdx((prev) => (prev === idx ? prev : idx)),
    }),
    [],
  );

  const point = (hoverIdx != null ? data?.[hoverIdx] : undefined) ?? hd;
  if (!point) return null;
  const up = point.c >= point.o;
  const chg = point.o > 0 ? ((point.c - point.o) / point.o) * 100 : 0;

  return (
    <div className="mb-0.5 flex items-baseline gap-x-2.5 overflow-x-auto whitespace-nowrap text-[11px] tabular-nums text-gray-500 dark:text-gray-400 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="font-medium">{new Date(point.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      {bmActive ? (
        <>
          <span className="font-semibold" style={{ color: (point.chgPct ?? 0) >= 0 ? UP : DOWN }}>{ticker} {(point.chgPct ?? 0) >= 0 ? '+' : ''}{(point.chgPct ?? 0).toFixed(1)}%</span>
          <span className="font-semibold" style={{ color: '#0ea5e9' }}>{bmLabel} {(point.bmPct ?? 0) >= 0 ? '+' : ''}{(point.bmPct ?? 0).toFixed(1)}%</span>
          {point.chgPct != null && point.bmPct != null && (
            <span>Δ {(point.chgPct - point.bmPct) >= 0 ? '+' : ''}{(point.chgPct - point.bmPct).toFixed(1)}pp</span>
          )}
        </>
      ) : (
        <>
          <span>O ${point.o.toFixed(2)}</span>
          <span>H ${point.h.toFixed(2)}</span>
          <span>L ${point.l.toFixed(2)}</span>
          <span>C <b className="font-semibold" style={{ color: up ? UP : DOWN }}>${point.c.toFixed(2)} ({chg >= 0 ? '+' : ''}{chg.toFixed(2)}%)</b></span>
          <span>Vol {fmtVol(point.v)}{point.volSpike ? ' ⚡' : ''}</span>
          {inds.has('ma20') && point.sma20 != null && <span style={{ color: MA20 }}>MA20 ${point.sma20.toFixed(2)}</span>}
          {inds.has('ma50') && point.sma50 != null && <span style={{ color: MA50 }}>MA50 ${point.sma50.toFixed(2)}</span>}
          {inds.has('ma200') && point.sma200 != null && <span style={{ color: MA200 }}>MA200 ${point.sma200.toFixed(2)}</span>}
          {inds.has('bb') && point.bbLo != null && point.bbUp != null && <span style={{ color: BB_COLOR }}>BB ${point.bbLo.toFixed(0)}–${point.bbUp.toFixed(0)}</span>}
          {point.pe != null && point.pe > 0 && (
            <span>P/E {point.pe.toFixed(1)}×{medianPe != null && medianPe !== 0 && (
              <span style={{ color: point.pe >= medianPe ? DOWN : UP }}> ({((point.pe - medianPe) / medianPe) * 100 >= 0 ? '+' : ''}{(((point.pe - medianPe) / medianPe) * 100).toFixed(0)}% vs med)</span>
            )}</span>
          )}
          {inds.has('fair') && point.fv != null && (
            <span style={{ color: FAIR_COLOR }}>
              Fair {formatFairDollar(point.fv)}
              {point.fvBear != null && point.fvBull != null && ` (${formatFairDollar(point.fvBear)}–${formatFairDollar(point.fvBull)})`}
              {(() => {
                const uv = ((point.fv - point.c) / point.fv) * 100;
                return (
                  <span style={{ color: uv >= 0 ? UP : DOWN }}>
                    {' '}({Math.abs(uv) < 1 ? 'fair' : uv > 0 ? `${uv.toFixed(0)}% under` : `${Math.abs(uv).toFixed(0)}% over`})
                  </span>
                );
              })()}
            </span>
          )}
          {inds.has('fair') && point.fvChanged && <span style={{ color: FAIR_COLOR }}>↑ earnings update</span>}
        </>
      )}
    </div>
  );
});

/** Synchronized RSI(14) and MACD(12,26,9) panes under the price chart. */
export function PriceOscillatorPanes({
  data,
  narrow,
  showRsi,
  showMacd,
}: {
  data: ChartPoint[];
  narrow: boolean;
  showRsi: boolean;
  showMacd: boolean;
}) {
  return (
    <>
      {showRsi && (
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} syncId="pmp-price" margin={{ top: 2, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" scale="band" hide />
            <YAxis domain={[0, 100]} orientation="right" ticks={[30, 50, 70]}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500" tickLine={false} axisLine={false}
              width={narrow ? 44 : 56} />
            <Tooltip content={() => null} cursor={{ stroke: 'rgba(148,163,184,0.4)' }} isAnimationActive={false} />
            <ReferenceLine y={70} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={50} stroke="rgba(148,163,184,0.35)" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="rsi14" name="RSI 14" stroke={RSI_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      {showMacd && (
        <ResponsiveContainer width="100%" height={80}>
          <ComposedChart data={data} syncId="pmp-price" margin={{ top: 2, right: narrow ? 4 : 16, left: narrow ? 0 : 8, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" scale="band" hide />
            <YAxis orientation="right" tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: CHART_FONT.axis, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-500" tickLine={false} axisLine={false}
              width={narrow ? 44 : 56} />
            <Tooltip content={() => null} cursor={{ stroke: 'rgba(148,163,184,0.4)' }} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
            <Bar dataKey="macdH" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={(d.macdH ?? 0) >= 0 ? UP : DOWN} fillOpacity={0.45} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macdL" name="MACD" stroke={MACD_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="macdS" name="Signal" stroke="#f59e0b" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </>
  );
}

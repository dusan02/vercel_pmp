'use client';

import React from 'react';
import { DualRangeSlider } from './analysis/DualRangeSlider';
import { PE_MEDIAN_WINDOWS, type PeMedianWindowId } from '@/lib/utils/screener';

type Range = { min?: number; max?: number } | undefined;

const QUICK: { label: string; range: NonNullable<Range> }[] = [
  { label: 'Below median', range: { max: 0 } },
  { label: '≥10 % below', range: { max: -10 } },
  { label: '≥20 % below', range: { max: -20 } },
  { label: '≥30 % below', range: { max: -30 } },
  { label: 'Above median', range: { min: 0 } },
];

const pct = (v: number) => `${Math.abs(v)} %`;

/** Plain-language reading of the active range ("P/E at least 20 % below its 3Y median"). */
export function describePeVsMedian(range: Range, windowLabel: string): string {
  const med = `its ${windowLabel} median`;
  const lo = range?.min;
  const hi = range?.max;
  if (lo === undefined && hi === undefined) return `No filter — any P/E vs ${med}`;
  if (lo === undefined && hi !== undefined) {
    if (hi === 0) return `P/E below ${med}`;
    return hi < 0 ? `P/E at least ${pct(hi)} below ${med}` : `P/E at most ${pct(hi)} above ${med}`;
  }
  if (hi === undefined && lo !== undefined) {
    if (lo === 0) return `P/E above ${med}`;
    return lo > 0 ? `P/E at least ${pct(lo)} above ${med}` : `P/E no more than ${pct(lo)} below ${med}`;
  }
  const side = (v: number) => (v === 0 ? 'at the median' : v < 0 ? `${pct(v)} below` : `${pct(v)} above`);
  return `P/E between ${side(lo!)} and ${side(hi!)} ${med}`;
}

interface Props {
  windowId: PeMedianWindowId;
  onWindowChange: (id: PeMedianWindowId) => void;
  range: Range;
  onRangeChange: (r: Range) => void;
  min: number;
  max: number;
}

/**
 * Single "P/E vs historical median" control: pick the median window, then
 * set how far below (cheaper) / above (pricier) that median today's P/E is.
 */
export function PeVsMedianFilter({ windowId, onWindowChange, range, onRangeChange, min, max }: Props) {
  const win = PE_MEDIAN_WINDOWS.find((w) => w.id === windowId) ?? PE_MEDIAN_WINDOWS[1];
  const apply = (side: 'min' | 'max', v: number) => {
    const next: { min?: number; max?: number } = { ...range };
    if (side === 'min') { if (v === min) delete next.min; else next.min = v; }
    else { if (v === max) delete next.max; else next.max = v; }
    onRangeChange(next.min === undefined && next.max === undefined ? undefined : next);
  };
  const zeroPct = ((0 - min) / (max - min)) * 100;
  const sameRange = (a: Range, b: Range) => a?.min === b?.min && a?.max === b?.max;

  return (
    <div className={`rounded-lg border p-2.5 ${range ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-slate-700'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          P/E vs historical median
          <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">— how far today’s P/E is from the stock’s own median</span>
        </span>
        <div className="inline-flex items-center gap-1 text-[11px]">
          <span className="text-gray-500 dark:text-gray-400 mr-0.5">Median over:</span>
          {PE_MEDIAN_WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={w.id === win.id}
              onClick={() => onWindowChange(w.id)}
              className={`px-2 py-0.5 rounded-md border font-medium transition-colors ${
                w.id === win.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <DualRangeSlider
        label={`P/E vs ${win.label} median (%)`}
        min={min} max={max} step={1}
        valueMin={range?.min ?? min}
        valueMax={range?.max ?? max}
        onChangeMin={(v) => apply('min', v)}
        onChangeMax={(v) => apply('max', v)}
        accentColor="sky"
      />
      <div className="relative h-4 mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 select-none">
        <span className="absolute left-0">◄ cheaper</span>
        <span className="absolute -translate-x-1/2 text-gray-500 dark:text-gray-400 font-medium" style={{ left: `${zeroPct}%` }}>| 0 = median</span>
        <span className="absolute right-0">pricier ►</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => {
          const on = sameRange(range, q.range);
          return (
            <button
              key={q.label}
              type="button"
              onClick={() => onRangeChange(on ? undefined : q.range)}
              className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                on
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-50 dark:bg-gray-900/70 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
              }`}
            >
              {q.label}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] font-medium text-gray-600 dark:text-gray-300" data-testid="pe-median-summary">
          {describePeVsMedian(range, win.label)}
        </span>
      </div>
    </div>
  );
}

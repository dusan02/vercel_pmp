'use client';

import React from 'react';
import { FAIR_METHOD_LABEL, formatFairDollar, type FairMethod } from '@/lib/valuation/fairValue';

export interface FairValueMeta {
  method: FairMethod;
  asOf: string;
  gated?: boolean;
  skipDcf?: boolean;
  components?: {
    rel: number | null;
    relKind: 'pe' | 'ps' | null;
    relMultiple: number | null;
    relMedian: number | null;
    relPerShare: number | null;
    dcf: number | null;
    fcfPerShare: number | null;
    growth: number | null;
  };
}

interface FairValueBreakdownProps {
  meta: FairValueMeta | null;
  fair: number | null;
  bear: number | null;
  bull: number | null;
  onClose: () => void;
}

export function FairValueBreakdown({ meta, fair, bear, bull, onClose }: FairValueBreakdownProps) {
  const c = meta?.components;
  const hasDcf = c?.dcf != null && c.dcf > 0;
  const hasRel = c?.rel != null && c.rel > 0;
  const relWeight = hasRel && hasDcf ? '50%' : hasRel ? '100%' : '0%';
  const dcfWeight = hasRel && hasDcf ? '50%' : hasDcf ? '100%' : '0%';
  const growthPct = c?.growth != null ? `${(c.growth * 100).toFixed(1)}%` : null;

  return (
    <div
      role="region"
      aria-label="Fair value calculation breakdown"
      className="mb-3 rounded-lg border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 px-3.5 py-2.5 text-xs text-gray-700 dark:text-gray-300"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 dark:text-white">How Fair Value is calculated</span>
          {meta?.method && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100/80 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              {FAIR_METHOD_LABEL[meta.method]}
            </span>
          )}
          {meta?.asOf && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">as of {meta.asOf}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fair value calculation info"
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1 text-sm leading-none"
        >
          ×
        </button>
      </div>

      {meta?.gated && (
        <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded px-2.5 py-1.5">
          Sanity gate active: computed fair value sits outside 0.3×–2.5× of current price (distorted earnings or extreme multiple), so the line is hidden.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] leading-relaxed">
        {/* 1. Relative Multiple */}
        <div className="rounded-md bg-white/80 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700/60 p-2.5">
          <div className="flex items-baseline justify-between gap-1 mb-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              1. Historical Multiple ({relWeight})
            </span>
            {hasRel && (
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {formatFairDollar(c!.rel!)}
              </span>
            )}
          </div>
          {c?.relKind === 'pe' && c.relPerShare != null && c.relMultiple != null ? (
            <p className="text-gray-600 dark:text-gray-400">
              TTM EPS <span className="font-mono">${c.relPerShare.toFixed(2)}</span> ×{' '}
              <span className="font-mono">{c.relMultiple.toFixed(1)}×</span>
              {c.relMedian != null && c.relMedian > c.relMultiple + 0.1
                ? ` (5Y med ${c.relMedian.toFixed(1)}×, capped at 15 + ${growthPct ?? 'g%'})`
                : c.relMedian != null
                  ? ` (trailing 5Y median P/E)`
                  : ''}.
            </p>
          ) : c?.relKind === 'ps' && c.relPerShare != null && c.relMultiple != null ? (
            <p className="text-gray-600 dark:text-gray-400">
              TTM rev/sh <span className="font-mono">${c.relPerShare.toFixed(2)}</span> ×{' '}
              <span className="font-mono">{c.relMultiple.toFixed(1)}×</span> (trailing 5Y median P/S — P/E fallback).
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              TTM EPS × trailing 5Y median P/E capped at 15 + growth% (falls back to P/S when P/E is negative or distorted).
            </p>
          )}
        </div>

        {/* 2. 10Y FCF DCF */}
        <div className="rounded-md bg-white/80 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700/60 p-2.5">
          <div className="flex items-baseline justify-between gap-1 mb-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              2. 10Y FCF DCF ({dcfWeight})
            </span>
            {hasDcf && (
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {formatFairDollar(c!.dcf!)}
              </span>
            )}
          </div>
          {hasDcf && c?.fcfPerShare != null ? (
            <p className="text-gray-600 dark:text-gray-400">
              TTM FCF/sh <span className="font-mono">${c.fcfPerShare.toFixed(2)}</span> grown at{' '}
              <span className="font-mono">{growthPct ?? 'g'}</span> (5Y/1Y blended rev/sh CAGR, max 20%), fading linearly to 3% by yr 10; 10% discount, 2.5% terminal.
            </p>
          ) : meta?.skipDcf ? (
            <p className="text-gray-600 dark:text-gray-400">
              Skipped for Financial Services — bank/insurer operating cash flow reflects deposits and float, so multiple-only valuation is used.
            </p>
          ) : c && (c.fcfPerShare == null || c.fcfPerShare <= 0) ? (
            <p className="text-gray-600 dark:text-gray-400">
              Skipped (TTM FCF/sh is {c.fcfPerShare != null ? `$${c.fcfPerShare.toFixed(2)}` : 'unavailable'}); 100% weight shifts to the historical multiple.
            </p>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              10Y FCF/share projection using trailing rev/sh growth (max 20%) fading to 3%, discounted at 10% with 2.5% terminal growth.
            </p>
          )}
        </div>

        {/* 3. Composite & Rules */}
        <div className="rounded-md bg-white/80 dark:bg-gray-900/50 border border-gray-200/70 dark:border-gray-700/60 p-2.5">
          <div className="flex items-baseline justify-between gap-1 mb-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">3. Composite &amp; Zones</span>
            {fair != null && (
              <span className="font-mono font-bold text-gray-900 dark:text-white">
                {formatFairDollar(fair)}
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {hasRel && hasDcf ? '50% Multiple + 50% DCF' : 'Active model output'}
            {bear != null && bull != null && (
              <> (bear <span className="font-mono">{formatFairDollar(bear)}</span> – bull <span className="font-mono">{formatFairDollar(bull)}</span>)</>
            )}. Computed point-in-time (no future data); steps only on new filings. Green = Buy zone, Red = Sell zone.
          </p>
        </div>
      </div>
    </div>
  );
}

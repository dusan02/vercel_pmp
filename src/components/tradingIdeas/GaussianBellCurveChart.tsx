'use client';

import React, { useState, useMemo } from 'react';
import type { GaussianDistributionStats } from '@/lib/tradingIdeas/dipEngine';
import { normalPdf } from '@/lib/tradingIdeas/dipClientMath';

interface GaussianBellCurveChartProps {
  symbol: string;
  masterSymbol: string;
  distributions: {
    dailyRsi: GaussianDistributionStats;
    weeklyRsi: GaussianDistributionStats;
    weeklySma200Dist: GaussianDistributionStats;
    dailySma200Dist: GaussianDistributionStats;
    peRatio?: GaussianDistributionStats | null | undefined;
  };
  compact?: boolean;
}

type MetricTabKey = 'dailyRsi' | 'weeklyRsi' | 'weeklySma200Dist' | 'dailySma200Dist' | 'peRatio';

export function GaussianBellCurveChart({
  symbol,
  masterSymbol,
  distributions,
  compact = false,
}: GaussianBellCurveChartProps) {
  const [activeMetric, setActiveMetric] = useState<MetricTabKey>('dailyRsi');

  const availableTabs = useMemo(() => {
    const tabs: { key: MetricTabKey; label: string; shortLabel: string }[] = [
      { key: 'dailyRsi', label: 'Daily RSI (14)', shortLabel: 'Daily RSI' },
      { key: 'weeklyRsi', label: 'Weekly RSI (14)', shortLabel: 'Weekly RSI' },
      { key: 'weeklySma200Dist', label: 'Distance from 200W SMA (%)', shortLabel: '200W SMA' },
      { key: 'dailySma200Dist', label: 'Distance from 200D SMA (%)', shortLabel: '200D SMA' },
    ];
    if (distributions.peRatio && distributions.peRatio.sampleSize >= 20) {
      tabs.push({ key: 'peRatio', label: 'Historical P/E', shortLabel: 'P/E Hist.' });
    }
    return tabs;
  }, [distributions.peRatio]);

  const stats: GaussianDistributionStats = useMemo(() => {
    if (activeMetric === 'peRatio' && distributions.peRatio) return distributions.peRatio;
    if (activeMetric === 'weeklyRsi') return distributions.weeklyRsi;
    if (activeMetric === 'weeklySma200Dist') return distributions.weeklySma200Dist;
    if (activeMetric === 'dailySma200Dist') return distributions.dailySma200Dist;
    return distributions.dailyRsi;
  }, [activeMetric, distributions]);

  // SVG coordinate system for the Gaussian bell curve over Z in [-3.5, +3.5]
  const width = compact ? 340 : 680;
  const height = compact ? 152 : 240;
  const padLeft = compact ? 18 : 36;
  const padRight = compact ? 18 : 36;
  const padTop = compact ? 28 : 34;
  const padBottom = compact ? 42 : 50;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const zMin = -3.5;
  const zMax = 3.5;
  const maxPdf = normalPdf(0); // ~0.39894

  const zToX = (z: number) => {
    const clamped = Math.max(zMin, Math.min(zMax, z));
    return padLeft + ((clamped - zMin) / (zMax - zMin)) * plotW;
  };
  const pdfToY = (p: number) => padTop + plotH - (p / maxPdf) * plotH;
  const zToVal = (z: number) => stats.mean + z * stats.stdDev;

  const buildAreaPath = (zStart: number, zEnd: number, steps = 40) => {
    const s = Math.max(zMin, zStart);
    const e = Math.min(zMax, zEnd);
    if (e <= s) return '';
    const pts: string[] = [];
    pts.push(`M ${zToX(s).toFixed(1)} ${(padTop + plotH).toFixed(1)}`);
    for (let i = 0; i <= steps; i++) {
      const z = s + ((e - s) * i) / steps;
      const x = zToX(z);
      const y = pdfToY(normalPdf(z));
      pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    pts.push(`L ${zToX(e).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`);
    return pts.join(' ');
  };

  const fullCurvePath = useMemo(() => {
    const steps = compact ? 80 : 120;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const z = zMin + ((zMax - zMin) * i) / steps;
      const cmd = i === 0 ? 'M' : 'L';
      pts.push(`${cmd} ${zToX(z).toFixed(1)} ${pdfToY(normalPdf(z)).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [plotW, plotH, compact]);

  const curZ = stats.zScore ?? 0;
  const curX = zToX(curZ);
  const curY = pdfToY(normalPdf(Math.max(zMin, Math.min(zMax, curZ))));

  const minZ = stats.stdDev > 0 ? (stats.min - stats.mean) / stats.stdDev : -3.0;
  const maxZ = stats.stdDev > 0 ? (stats.max - stats.mean) / stats.stdDev : 3.0;

  const isRsi = activeMetric === 'dailyRsi' || activeMetric === 'weeklyRsi';
  const fmtVal = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return '–';
    if (stats.unit === '%') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (stats.unit === '×') return `${v.toFixed(1)}×`;
    return v.toFixed(1);
  };

  const zoneColorClasses = {
    EXTREME_BOTTOM: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    DEEP_OVERSOLD: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    CAPITULATION_1: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/40',
    APPROACHING_OVERSOLD: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40',
    NEUTRAL: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
    WARM: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
    EUPHORIA: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
  }[stats.zone];

  const markerDotColor =
    stats.zone === 'EXTREME_BOTTOM' || stats.zone === 'DEEP_OVERSOLD' || stats.zone === 'CAPITULATION_1'
      ? '#10b981'
      : stats.zone === 'EUPHORIA'
        ? '#f43f5e'
        : stats.zone === 'APPROACHING_OVERSOLD'
          ? '#0ea5e9'
          : '#3b82f6';

  const sigmaMarkers = compact
    ? [
        { z: -2.2, label: '-2.2σ', sub: fmtVal(zToVal(-2.2)), cls: 'text-emerald-600 dark:text-emerald-400' },
        { z: -1.0, label: '-1.0σ', sub: fmtVal(zToVal(-1.0)), cls: 'text-slate-400 dark:text-slate-500' },
        { z: 0, label: 'μ', sub: fmtVal(stats.mean), cls: 'text-slate-700 dark:text-slate-300' },
        { z: 1.0, label: '+1.0σ', sub: fmtVal(zToVal(1.0)), cls: 'text-slate-400 dark:text-slate-500' },
        { z: 2.0, label: '+2.0σ', sub: fmtVal(zToVal(2.0)), cls: 'text-rose-600 dark:text-rose-400' },
      ]
    : [
        { z: -2.6, label: '-2.6σ', sub: fmtVal(zToVal(-2.6)), cls: 'text-emerald-600 dark:text-emerald-400' },
        { z: -2.1, label: '-2.1σ', sub: fmtVal(zToVal(-2.1)), cls: 'text-lime-600 dark:text-lime-400' },
        { z: -1.0, label: '-1.0σ', sub: fmtVal(zToVal(-1.0)), cls: 'text-slate-400 dark:text-slate-500' },
        { z: 0, label: 'μ (Mean)', sub: fmtVal(stats.mean), cls: 'text-slate-700 dark:text-slate-300' },
        { z: 1.0, label: '+1.0σ', sub: fmtVal(zToVal(1.0)), cls: 'text-slate-400 dark:text-slate-500' },
        { z: 2.0, label: '+2.0σ', sub: fmtVal(zToVal(2.0)), cls: 'text-rose-600 dark:text-rose-400' },
      ];

  return (
    <div
      className={
        compact
          ? ''
          : 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4'
      }
    >
      {/* Header + Metric Switcher */}
      {compact ? (
        <div className="mb-2">
          <div className="grid grid-flow-col auto-cols-fr gap-0.5 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-lg">
            {availableTabs.map((tab) => {
              const active = activeMetric === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveMetric(tab.key)}
                  className={`px-1 py-1 rounded text-[10.5px] font-semibold truncate transition-all ${
                    active
                      ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {tab.shortLabel}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-1.5 py-1 border border-gray-200/70 dark:border-gray-700/60">
              <div className="text-[9px] text-gray-400 uppercase font-semibold">Now</div>
              <div className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                {fmtVal(stats.currentValue)}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-1.5 py-1 border border-gray-200/70 dark:border-gray-700/60">
              <div className="text-[9px] text-gray-400 uppercase font-semibold">Z-Score</div>
              <div className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                {stats.zScore != null ? `${stats.zScore >= 0 ? '+' : ''}${stats.zScore.toFixed(2)}σ` : '–'}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-1.5 py-1 border border-gray-200/70 dark:border-gray-700/60">
              <div className="text-[9px] text-gray-400 uppercase font-semibold">Percentile</div>
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {stats.gaussianPercentile != null ? `${stats.gaussianPercentile.toFixed(1)}%` : '–'}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-1.5 py-1 border border-gray-200/70 dark:border-gray-700/60">
              <div className="text-[9px] text-gray-400 uppercase font-semibold">Min / Max</div>
              <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                {fmtVal(stats.min)}/{fmtVal(stats.max)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Gaussian Probability Distribution ({masterSymbol})
                </h4>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${zoneColorClasses}`}>
                  {stats.zoneLabelSk}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Empirical ~10Y distribution ({stats.sampleSize.toLocaleString('en-US')} observations) ·{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  μ = {fmtVal(stats.mean)}, σ = {stats.stdDev.toFixed(1)}
                </span>
              </p>
            </div>

            {/* Metric Tabs */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg">
              {availableTabs.map((tab) => {
                const active = activeMetric === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveMetric(tab.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Key Gaussian Stat Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-xs">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Current Value</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {fmtVal(stats.currentValue)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Z-Score (σ)</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {stats.zScore != null ? `${stats.zScore >= 0 ? '+' : ''}${stats.zScore.toFixed(2)}σ` : '–'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Left-Tail Percentile</div>
              <div className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {stats.gaussianPercentile != null ? `${stats.gaussianPercentile.toFixed(2)}%` : '–'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Hist. Min / Max</div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                {fmtVal(stats.min)} / {fmtVal(stats.max)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">
                {isRsi ? 'Buy Zones (1st/2nd/3rd)' : 'Key Sigma Tails'}
              </div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ≤ {stats.thresholds.neg2_1Sigma} / {stats.thresholds.neg2_4Sigma} / {stats.thresholds.neg2_6Sigma}
              </div>
            </div>
          </div>
        </>
      )}

      {/* SVG Bell Curve */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label={`Gaussian bell curve for ${symbol} - ${stats.label}`}
        >
          {/* Shaded Gaussian tail zones */}
          <path d={buildAreaPath(-2.1, 2.0, 50)} fill="rgba(148, 163, 184, 0.14)" />
          <path d={buildAreaPath(-2.4, -2.1, 16)} fill="rgba(132, 204, 22, 0.35)" />
          <path d={buildAreaPath(-2.6, -2.4, 16)} fill="rgba(16, 185, 129, 0.45)" />
          <path d={buildAreaPath(zMin, -2.6, 20)} fill="rgba(5, 150, 105, 0.65)" />
          <path d={buildAreaPath(2.0, zMax, 25)} fill="rgba(244, 63, 94, 0.42)" />

          {/* Baseline axis */}
          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={width - padRight}
            y2={padTop + plotH}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
            strokeWidth={1.2}
          />

          {/* Vertical sigma reference lines */}
          {sigmaMarkers.map((m) => {
            const x = zToX(m.z);
            const yTop = pdfToY(normalPdf(m.z));
            return (
              <g key={m.z}>
                <line
                  x1={x}
                  y1={yTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="currentColor"
                  className={m.z === 0 ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-700'}
                  strokeDasharray={m.z === 0 ? '3 3' : '2 3'}
                  strokeWidth={m.z === 0 ? 1.3 : 0.9}
                />
                <text
                  x={x}
                  y={padTop + plotH + (compact ? 12 : 15)}
                  textAnchor="middle"
                  className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold fill-current ${m.cls}`}
                >
                  {m.sub}
                </text>
                <text
                  x={x}
                  y={padTop + plotH + (compact ? 22 : 28)}
                  textAnchor="middle"
                  className={`${compact ? 'text-[8px]' : 'text-[9px]'} fill-slate-400 dark:fill-slate-500`}
                >
                  {m.label}
                </text>
              </g>
            );
          })}

          {/* Historical Min & Max small ticks */}
          {Number.isFinite(minZ) && (
            <g>
              <circle cx={zToX(minZ)} cy={padTop + plotH} r={compact ? 2.5 : 3} fill="#059669" />
              {!compact && (
                <text
                  x={Math.max(padLeft + 20, zToX(minZ))}
                  y={padTop + plotH + 41}
                  textAnchor="middle"
                  className="text-[9px] font-medium fill-emerald-600 dark:fill-emerald-400"
                >
                  Min: {fmtVal(stats.min)}
                </text>
              )}
            </g>
          )}
          {Number.isFinite(maxZ) && (
            <g>
              <circle cx={zToX(maxZ)} cy={padTop + plotH} r={compact ? 2.5 : 3} fill="#e11d48" />
              {!compact && (
                <text
                  x={Math.min(width - padRight - 20, zToX(maxZ))}
                  y={padTop + plotH + 41}
                  textAnchor="middle"
                  className="text-[9px] font-medium fill-rose-600 dark:fill-rose-400"
                >
                  Max: {fmtVal(stats.max)}
                </text>
              )}
            </g>
          )}

          {/* Main Bell Curve stroke */}
          <path
            d={fullCurvePath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={compact ? 1.8 : 2.2}
            strokeLinecap="round"
          />

          {/* Current value vertical indicator + badge */}
          {stats.currentValue != null && (
            <g>
              <line
                x1={curX}
                y1={padTop - 4}
                x2={curX}
                y2={padTop + plotH}
                stroke={markerDotColor}
                strokeWidth={compact ? 1.6 : 2}
              />
              <circle
                cx={curX}
                cy={curY}
                r={compact ? 4.5 : 6}
                fill={markerDotColor}
                stroke="#ffffff"
                strokeWidth={1.8}
              />
              {/* Top callout pill */}
              <g
                transform={`translate(${Math.max(
                  padLeft + (compact ? 46 : 58),
                  Math.min(width - padRight - (compact ? 46 : 58), curX)
                )}, ${padTop - (compact ? 10 : 12)})`}
              >
                <rect
                  x={compact ? -46 : -56}
                  y={compact ? -12 : -14}
                  width={compact ? 92 : 112}
                  height={compact ? 16 : 20}
                  rx={5}
                  fill={markerDotColor}
                />
                <text
                  x={0}
                  y={compact ? -1 : 0}
                  textAnchor="middle"
                  className={`${compact ? 'text-[8.5px]' : 'text-[10px]'} font-bold fill-white`}
                >
                  Now: {fmtVal(stats.currentValue)} ({stats.gaussianPercentile?.toFixed(1)}%)
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* Legend strip */}
      <div
        className={`mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 ${
          compact ? 'text-[10px]' : 'text-[11px]'
        } text-slate-500 dark:text-slate-400`}
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-emerald-600 inline-block" />
            <span>&lt;0.3% (T3)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-emerald-400 inline-block" />
            <span>&lt;0.8% (T2)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-lime-400 inline-block" />
            <span>&lt;2.0% (T1)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-rose-500 inline-block" />
            <span>&gt;98.5% (Hedge)</span>
          </span>
        </div>
      </div>
    </div>
  );
}

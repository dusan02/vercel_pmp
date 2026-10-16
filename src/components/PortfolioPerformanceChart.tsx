'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { SectionLoader } from './SectionLoader';

interface PerfPoint { date: string; portfolio: number; spy: number }
interface Props { holdings: Record<string, number> }

const PERIODS = [
  { key: '3M', days: 95 },
  { key: '6M', days: 185 },
  { key: '1Y', days: 380 },
  { key: '3Y', days: 1130 },
] as const;

function fmtPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function PortfolioPerformanceChart({ holdings }: Props) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('1Y');
  const [data, setData] = useState<PerfPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const hParam = useMemo(() =>
    Object.entries(holdings)
      .filter(([, q]) => q > 0)
      .map(([t, q]) => `${t}:${q}`)
      .join(','),
  [holdings]);

  useEffect(() => {
    if (!hParam) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const days = PERIODS.find(p => p.key === period)?.days ?? 380;
    fetch(`/api/portfolio/performance?h=${encodeURIComponent(hParam)}&days=${days}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (!cancelled) setData(d.series || []); })
      .catch(() => { if (!cancelled) { setData(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hParam, period]);

  if (!hParam) return null;

  const last = data?.[data.length - 1];
  const portColor = (last?.portfolio ?? 0) >= 0 ? '#10b981' : '#ef4444';

  return (
    <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-[var(--clr-subtext)] uppercase tracking-wider">
          Performance vs S&P 500 <span className="normal-case font-normal">(current weights)</span>
        </h3>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                period === p.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <SectionLoader message="Loading performance..." />}
      {failed && !loading && (
        <p className="text-sm text-[var(--clr-subtext)] py-8 text-center">Performance data unavailable.</p>
      )}

      {data && data.length > 1 && (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(0, 7)}
                  minTickGap={48}
                  stroke="currentColor"
                  opacity={0.5}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  width={52}
                  stroke="currentColor"
                  opacity={0.5}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [
                    fmtPct(typeof v === 'number' ? v : 0),
                    name === 'portfolio' ? 'Portfolio' : 'S&P 500',
                  ] as [string, string]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="portfolio" stroke={portColor} strokeWidth={2} dot={false} isAnimationActive={false} name="portfolio" />
                <Line type="monotone" dataKey="spy" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="spy" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {last && (
            <div className="flex items-center gap-4 mt-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ background: portColor }} />
                <strong style={{ color: portColor }}>Portfolio {fmtPct(last.portfolio)}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="w-3 h-0.5 rounded bg-gray-500" style={{ borderTop: '1px dashed #6b7280' }} />
                S&P 500 {fmtPct(last.spy)}
              </span>
              <span className="ml-auto text-[var(--clr-subtext)]">
                {last.portfolio - last.spy >= 0 ? '+' : ''}{(last.portfolio - last.spy).toFixed(1)}pp vs benchmark
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Point {
  ts: string;
  price: number;
}

interface IntradayData {
  points: Point[];
  date: string | null;
  session: string;
}

/**
 * Today's intraday price series (5-minute bars) for one ticker — including
 * the pre-market session, which no other free source shows per-ticker.
 * Rendered on /analysis/[ticker] under the hero. Client-fetches
 * /api/analysis/[ticker]/intraday (Polygon 5-min aggs, cached 5 min).
 */
export function IntradayChart({ ticker }: { ticker: string }) {
  const [data, setData] = useState<IntradayData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analysis/${encodeURIComponent(ticker)}/intraday`)
      .then((r) => r.json())
      .then((d: IntradayData) => {
        if (cancelled) return;
        if (d?.points && d.points.length >= 2) setData(d);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (failed || !data || data.points.length < 2) return null;

  const chartData = data.points.map((p) => ({
    time: new Date(p.ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
    }),
    price: p.price,
    ts: p.ts,
  }));

  const first = data.points[0]!.price;
  const last = data.points[data.points.length - 1]!.price;
  const changePct = (last / first - 1) * 100;
  const up = changePct >= 0;
  const stroke = up ? '#059669' : '#e11d48';

  // Regular-session open marker (9:30 AM ET)
  const openTime = chartData.find((d) => {
    const et = new Date(d.ts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
    return et >= '09:30';
  })?.time;

  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Intraday — {data.date}
          <span className="ml-2 text-xs font-medium text-gray-400 dark:text-gray-500">5-minute bars, pre-market + regular</span>
        </h2>
        <span className={`text-sm font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {up ? '+' : ''}{changePct.toFixed(2)}% since session start
        </span>
      </div>
      <div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`intradayGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" minTickGap={48} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={62}
              tickFormatter={(v: number) => `$${v.toFixed(v < 10 ? 2 : 0)}`}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#6B7280', fontSize: 11 }}
              formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, 'Price'] as [string, string]}
            />
            {openTime && (
              <ReferenceLine
                x={openTime}
                stroke="#94A3B8"
                strokeDasharray="4 4"
                label={{ value: 'open 9:30', position: 'insideTopRight', fontSize: 10, fill: '#94A3B8' }}
              />
            )}
            <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2} fill={`url(#intradayGrad-${ticker})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

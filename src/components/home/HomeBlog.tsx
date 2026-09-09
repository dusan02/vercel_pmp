'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionIcon } from '@/components/SectionIcon';

interface Overview {
  totalStocks: number;
  gainers: number;
  losers: number;
  avgChange: number;
  totalMcapChange: number;
  sentiment: 'Bullish' | 'Bearish' | 'Mixed';
}

interface Snapshot {
  date: string;
  overviewJson: string;
}

const SENTIMENT_STYLE: Record<string, string> = {
  Bullish: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  Bearish: 'bg-red-100  dark:bg-red-900/30  text-red-700  dark:text-red-400',
  Mixed:   'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatBillions(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}T`;
  return `${n.toFixed(0)}B`;
}

export function HomeBlog() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/blog/snapshots')
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          <SectionIcon type="book" size={28} className="text-gray-900 dark:text-white shrink-0" />
          Premarket Daily Reports
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Daily premarket analysis — top gainers, losers, market cap movers, and earnings.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400">
          No reports yet. The first report will be published on the next trading day.
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map(snap => {
            let overview: Overview | null = null;
            try { overview = JSON.parse(snap.overviewJson); } catch {}

            const sentiment = overview?.sentiment ?? 'Mixed';
            const mcap = overview?.totalMcapChange ?? 0;

            return (
              <Link
                key={snap.date}
                href={`/blog/${snap.date}`}
                className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{snap.date}</p>
                    <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                      Premarket Report — {formatDate(snap.date)}
                    </p>
                    {overview && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Stocks tracked <strong className="text-gray-700 dark:text-gray-300">{overview.totalStocks}</strong></span>
                        <span className="text-green-600 dark:text-green-400">▲ {overview.gainers} gainers</span>
                        <span className="text-red-500 dark:text-red-400">▼ {overview.losers} losers</span>
                        <span>Avg move <strong className={overview.avgChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{overview.avgChange >= 0 ? '+' : ''}{overview.avgChange.toFixed(2)}%</strong></span>
                        <span>Market cap Δ <strong className={mcap >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{mcap >= 0 ? '+' : ''}{formatBillions(mcap)}</strong></span>
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${SENTIMENT_STYLE[sentiment] ?? SENTIMENT_STYLE.Mixed}`}>
                    {sentiment}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-6 text-center">
        <Link href="/blog" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          View all reports on blog page →
        </Link>
      </div>
    </div>
  );
}

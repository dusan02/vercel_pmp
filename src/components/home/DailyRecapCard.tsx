'use client';

import Link from 'next/link';
import { event } from '@/lib/ga';

export interface RecapTicker {
  ticker: string;
  name?: string;
  price?: number;
  percentChange?: number;
  marketCap?: number;
  marketCapDiff?: number;
}

export interface DailyRecapData {
  /** ET date key, e.g. "2026-10-05" — the /blog/[date] URL segment. */
  date: string;
  sentiment?: string;
  gainers: RecapTicker[];
  losers: RecapTicker[];
  /** Biggest market-cap mover — the "unusual" anchor item. */
  bigMover?: RecapTicker | null;
}

const TONE_CHIP: Record<string, string> = {
  Bullish: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  Bearish: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

function TickerChip({ t }: { t: RecapTicker }) {
  const pct = t.percentChange;
  return (
    <Link
      href={`/analysis/${encodeURIComponent(t.ticker)}`}
      onClick={() => event('ticker_click', { ticker: t.ticker, click_source: 'daily_recap' })}
      title={t.name || t.ticker}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-sm"
    >
      <span className="font-semibold text-gray-800 dark:text-gray-200">{t.ticker}</span>
      {pct != null && (
        <span className={`text-xs font-semibold tabular-nums ${pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
        </span>
      )}
    </Link>
  );
}

/**
 * "Today's Market Recap" — entry card to the daily /blog/[date] snapshot.
 * Promotes the existing daily blog as a landing node: chips link straight
 * to analysis pages, CTA opens the full recap.
 */
export function DailyRecapCard({ recap }: { recap: DailyRecapData }) {
  const up = recap.gainers.slice(0, 3);
  const down = recap.losers.slice(0, 3);
  if (!recap.date || (up.length === 0 && down.length === 0)) return null;

  const m = recap.bigMover;
  return (
    <section
      aria-label="Today's market recap"
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Today's Market Recap</h2>
        <span className="text-xs text-gray-400">{recap.date}</span>
        {recap.sentiment && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TONE_CHIP[recap.sentiment] ?? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'}`}>
            {recap.sentiment}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {up.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mr-0.5">Up</span>
            {up.map((t) => <TickerChip key={t.ticker} t={t} />)}
          </div>
        )}
        {down.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mr-0.5">Down</span>
            {down.map((t) => <TickerChip key={t.ticker} t={t} />)}
          </div>
        )}
        {m?.ticker && (
          <Link
            href={`/premarket/${encodeURIComponent(m.ticker)}`}
            onClick={() => event('ticker_click', { ticker: m.ticker, click_source: 'daily_recap' })}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          >
            Biggest cap move: <span className="font-semibold">{m.ticker}</span>
            {m.marketCapDiff != null && ` ${m.marketCapDiff >= 0 ? '+' : ''}$${Math.abs(m.marketCapDiff).toFixed(0)}B`}
          </Link>
        )}
        <Link
          href={`/blog/${recap.date}`}
          onClick={() => event('recap_open', { click_source: 'daily_recap_card' })}
          className="ml-auto text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          Read today's full recap →
        </Link>
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { event } from '@/lib/ga';

interface Props {
  symbol: string;
  name: string | null;
  changePct: number | null;
  badge: string | null;
  /** Current page ticker — sent as the `from` param for funnel attribution. */
  from: string;
}

/** Ticker chip in the Related-opportunities card. Fires analysis→related_analysis. */
export function RelatedTickerLink({ symbol, name, changePct, badge, from }: Props) {
  return (
    <Link
      href={`/analysis/${encodeURIComponent(symbol)}`}
      onClick={() =>
        event('ticker_click', { ticker: symbol, click_source: 'related_analysis', from_ticker: from })
      }
      title={name || symbol}
      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors inline-flex items-center gap-1.5"
    >
      <span className="font-semibold">{symbol}</span>
      {changePct != null && (
        <span
          className={`text-xs font-semibold tabular-nums ${
            changePct > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : changePct < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500'
          }`}
        >
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(1)}%
        </span>
      )}
      {badge && <span className="text-xs text-gray-500 dark:text-gray-400">{badge}</span>}
    </Link>
  );
}

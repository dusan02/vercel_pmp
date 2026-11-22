import Link from 'next/link';
import { formatPrice, formatPercent } from '@/lib/utils/format';

interface RecentMove {
  date: Date;
  session: string;
  changePct: number | null;
  zScore: number | null;
  lastPrice: number | null;
}

interface RecentMovesSectionProps {
  ticker: string;
  moves: RecentMove[];
  embedded?: boolean;
}

function formatSessionLabel(session: string): string {
  const map: Record<string, string> = {
    pre: 'Pre-market',
    live: 'Regular',
    after: 'After-hours',
    closed: 'Closed',
  };
  return map[session] ?? session;
}

export function RecentMovesSection({ ticker, moves, embedded = false }: RecentMovesSectionProps) {
  const marginClass = embedded ? '' : 'mb-6 ';
  if (moves.length === 0) {
    return (
      <div className={`${marginClass}bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-3 flex-wrap`}>
        <p className="text-sm text-gray-500 dark:text-gray-400">No significant market moves for {ticker} in the last 30 days.</p>
        <Link href={`/premarket/${ticker}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          See {ticker} move history →
        </Link>
      </div>
    );
  }

  return (
    <div className={`${marginClass}bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Market Moves</h2>
        <Link href={`/premarket/${ticker}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          See all {ticker} moves →
        </Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/80">
        <table className="pmp-clean-table w-full text-xs sm:text-sm">
          <thead className="bg-gray-50/90 dark:bg-gray-900/60 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 whitespace-nowrap">
            <tr>
              <th scope="col" className="px-2 sm:px-3 py-2 font-medium">Date</th>
              <th scope="col" className="px-2 sm:px-3 py-2 font-medium">Session</th>
              <th scope="col" className="px-2 sm:px-3 py-2 font-medium text-right">Price</th>
              <th scope="col" className="px-2 sm:px-3 py-2 font-medium text-right">Move</th>
              <th scope="col" className="px-2 sm:px-3 py-2 font-medium text-right">Z-Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {moves.map((m) => {
              // changePct can be null in the DB — null >= 0 is true in JS,
              // which rendered a green "0.00%" for missing data.
              const pct = m.changePct ?? null;
              const moveUp = (pct ?? 0) > 0;
              const dateStr = m.date.toISOString().split('T')[0];
              const isPremarket = m.session === 'pre';
              const archiveLink = isPremarket
                ? moveUp
                  ? `/premarket-gainers/${dateStr}`
                  : `/premarket-losers/${dateStr}`
                : null;
              return (
                <tr key={`${dateStr}-${m.session}`} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                  <td className="px-2 sm:px-3 py-2 tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
                    {archiveLink ? (
                      <Link href={archiveLink} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                        {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </Link>
                    ) : (
                      m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{formatSessionLabel(m.session)}</td>
                  <td className="px-2 sm:px-3 py-2 tabular-nums whitespace-nowrap text-right text-gray-700 dark:text-gray-300">
                    {m.lastPrice != null ? formatPrice(m.lastPrice) : '—'}
                  </td>
                  <td className={`px-2 sm:px-3 py-2 tabular-nums whitespace-nowrap text-right font-semibold ${pct == null ? 'text-gray-500' : moveUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {pct != null ? formatPercent(pct) : '—'}
                  </td>
                  <td className="px-2 sm:px-3 py-2 tabular-nums whitespace-nowrap text-right text-gray-700 dark:text-gray-300">
                    {m.zScore != null ? m.zScore.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { formatPrice, formatPercent } from '@/lib/utils/format';

interface RecentMove {
  date: Date;
  session: string;
  changePct: number;
  zScore: number | null;
  lastPrice: number | null;
}

interface RecentMovesSectionProps {
  ticker: string;
  moves: RecentMove[];
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

export function RecentMovesSection({ ticker, moves }: RecentMovesSectionProps) {
  if (moves.length === 0) return null;

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Market Moves</h2>
        <Link href={`/movers/${ticker}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          See all {ticker} moves →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th scope="col" className="px-3 py-2 font-medium">Date</th>
              <th scope="col" className="px-3 py-2 font-medium">Session</th>
              <th scope="col" className="px-3 py-2 font-medium">Price</th>
              <th scope="col" className="px-3 py-2 font-medium">Move</th>
              <th scope="col" className="px-3 py-2 font-medium">Z-Score</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => {
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
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                    {archiveLink ? (
                      <Link href={archiveLink} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                        {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </Link>
                    ) : (
                      m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{formatSessionLabel(m.session)}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                    {m.lastPrice != null ? formatPrice(m.lastPrice) : '—'}
                  </td>
                  <td className={`px-3 py-2 tabular-nums font-semibold ${pct == null ? 'text-gray-400' : moveUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {pct != null ? formatPercent(pct) : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
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

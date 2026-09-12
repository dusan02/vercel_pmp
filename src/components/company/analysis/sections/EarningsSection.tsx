import Link from 'next/link';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';

/** A recent row is only worth rendering if it carries at least one real number. */
function hasUsefulData(e: EarningsSSRRow): boolean {
  return (
    e.epsActual != null ||
    e.revenueActual != null ||
    e.epsEstimate != null ||
    e.revenueEstimate != null ||
    e.epsSurprisePercent != null
  );
}

/** Small centered bar visualizing EPS surprise (± scale, capped at ±25%). */
function SurpriseBar({ surprise }: { surprise: number }) {
  // Negative zero must not render as a green "+0.0%"
  const positive = surprise > 0 || (surprise === 0 && !Object.is(surprise, -0));
  const capped = Math.max(-25, Math.min(25, surprise));
  const halfWidth = (Math.abs(capped) / 25) * 50; // % of the bar width from center

  return (
    <div className="flex items-center gap-2">
      <div className="relative hidden sm:block w-24 h-2.5 rounded bg-gray-100 dark:bg-gray-700/50 overflow-hidden flex-shrink-0">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
        <div
          className={`absolute top-0 bottom-0 ${positive ? 'left-1/2 bg-emerald-500 rounded-r' : 'right-1/2 bg-rose-500 rounded-l'}`}
          style={{ width: `${halfWidth}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {positive ? '+' : ''}
        {surprise.toFixed(1)}%
      </span>
    </div>
  );
}

interface EarningsSectionProps {
  upcoming: EarningsSSRRow[];
  recent: EarningsSSRRow[];
}

export function EarningsSection({ upcoming, recent }: EarningsSectionProps) {
  const usefulRecent = recent.filter(hasUsefulData);
  if (upcoming.length === 0 && usefulRecent.length === 0) return null;

  const formatEpsShort = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
  const formatRevShort = (v: number | null) => {
    if (v == null) return '—';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toFixed(0)}`;
  };
  const timeLabel = (t: string) => (t === 'bmo' ? 'Pre-Mkt' : t === 'amc' ? 'After-Hrs' : t === 'dmt' ? 'During' : 'TBD');
  const formatDateShort = (d: string) => {
    // Handle both 'YYYY-MM-DD' and full ISO strings safely
    const date = d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Earnings</h2>
        <Link href="/earnings" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          View earnings calendar →
        </Link>
      </div>

      {upcoming.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Next Earnings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Time</th>
                  <th scope="col" className="px-3 py-2 font-medium">EPS Est.</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rev Est.</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((e, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatDateShort(e.date)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{timeLabel(e.time)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsEstimate)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueEstimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {usefulRecent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Earnings Results</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Time</th>
                  <th scope="col" className="px-3 py-2 font-medium">EPS Est.</th>
                  <th scope="col" className="px-3 py-2 font-medium">EPS Actual</th>
                  <th scope="col" className="px-3 py-2 font-medium">Surprise</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rev Est.</th>
                  <th scope="col" className="px-3 py-2 font-medium">Rev Actual</th>
                </tr>
              </thead>
              <tbody>
                {usefulRecent.map((e, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatDateShort(e.date)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{timeLabel(e.time)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsEstimate)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsActual)}</td>
                    <td className="px-3 py-2">
                      {e.epsSurprisePercent != null ? (
                        <SurpriseBar surprise={e.epsSurprisePercent} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueEstimate)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueActual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

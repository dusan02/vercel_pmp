/**
 * Early Winners score section — live data from EwScoreSnapshot.
 *
 * Renders the V5-B current-data composite score (fundamentals / momentum /
 * quality). The earnings pillar requires verified point-in-time analyst
 * consensus data — a documented research limitation — and renders as
 * BLOCKED, never as zero.
 *
 * This is a current-data screening score, NOT a backtested V5-C result.
 * Renders nothing when no snapshot has been imported for the ticker.
 */

import Link from 'next/link';

interface EwSnapshot {
  totalScore: number;
  maxPossible: number;
  fundamentalsScore: number | null;
  momentumScore: number | null;
  qualityScore: number | null;
  earningsScore: number | null;
  earningsBlocked: boolean;
  rank: number | null;
  asOfDate: Date | string;
  rationaleJson: string | null;
}

interface RationaleBullet {
  key: string;
  category: string;
  label: string;
  value: number | null;
  notes: string | null;
}

function parseRationale(json: string | null): RationaleBullet[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is RationaleBullet =>
        typeof b === 'object' && b !== null && typeof b.label === 'string',
    );
  } catch {
    return [];
  }
}

export function PmpScoreSection({ snapshot }: { snapshot: EwSnapshot | null }) {
  if (!snapshot) return null;

  const pillars = [
    { name: 'Fundamentals', weight: 30, score: snapshot.fundamentalsScore, blocked: false },
    { name: 'Momentum', weight: 25, score: snapshot.momentumScore, blocked: false },
    { name: 'Quality', weight: 10, score: snapshot.qualityScore, blocked: false },
    {
      name: 'Earnings',
      weight: 35,
      score: snapshot.earningsBlocked ? null : snapshot.earningsScore,
      blocked: snapshot.earningsBlocked,
    },
  ];

  const bullets = parseRationale(snapshot.rationaleJson).slice(0, 5);
  const asOf = new Date(snapshot.asOfDate).toISOString().slice(0, 10);

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Early Winners Score</h2>
        <span title="V5-B · current data" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 whitespace-nowrap">
          V5-B
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Composite score across fundamentals, momentum and quality — frozen V5 methodology.
        {snapshot.rank != null && ` Ranked #${snapshot.rank} in the Early Winners universe.`}
      </p>

      <div className="flex items-end gap-3 mb-5">
        <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
          {snapshot.totalScore.toFixed(1)}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-500 pb-1">
          / {snapshot.maxPossible.toFixed(0)} possible
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        {pillars.map((p) => (
          <div
            key={p.name}
            className={`rounded-lg p-3 border ${
              p.blocked
                ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
            }`}
          >
            <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-500 flex items-center justify-between gap-1">
              {p.name}
              <span className="font-bold text-gray-500 tabular-nums shrink-0">{p.weight}%</span>
            </dt>
            <dd
              className={`mt-1 text-lg font-bold tabular-nums ${
                p.blocked
                  ? 'text-gray-500 dark:text-gray-500'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {p.blocked ? (
                <span className="text-xs font-bold uppercase tracking-wider">Blocked</span>
              ) : p.score != null ? (
                p.score.toFixed(0)
              ) : (
                '—'
              )}
            </dd>
          </div>
        ))}
      </dl>

      {bullets.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Why this stock ranks here
          </h3>
          <ul className="space-y-1">
            {bullets.map((b) => (
              <li key={b.key} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span>
                  {b.label}
                  {b.value != null && (
                    <span className="ml-1 tabular-nums text-gray-500 dark:text-gray-500">
                      ({typeof b.value === 'number' ? b.value.toFixed(1) : b.value})
                    </span>
                  )}
                </span>
              </li>
            ))}
            {snapshot.earningsBlocked && (
              <li className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="text-amber-500 mt-0.5">⚠</span>
                <span>Earnings consensus unavailable — pillar excluded from the score, not counted as zero</span>
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-500">
            Parenthesized numbers are the raw metric values behind each rationale.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">
        Current-data score (V5-B methodology) as of {asOf}. This is a screening
        signal, not a backtested result — historical V5-C performance has not
        been established because verified point-in-time analyst consensus data
        is not available. Scores update in a daily batch. Not investment advice.
      </p>
      <p className="mt-3">
        <Link
          href="/screener/early-winners"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          View the full Early Winners leaderboard →
        </Link>
      </p>
    </section>
  );
}

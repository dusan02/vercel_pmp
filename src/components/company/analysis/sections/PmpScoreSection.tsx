/**
 * Placeholder for the future PMP EarlyWinner Score.
 *
 * The scoring framework (35% Earnings / 30% Fundamentals / 25% Momentum /
 * 10% Quality) is frozen; the earnings pillar awaits PIT-verified vendor
 * data. This section is the integration point — do not render a numeric
 * score until the vendor gate (P8.5) passes.
 */

const PILLARS = [
  { name: 'Earnings', weight: 35, status: 'pending' },
  { name: 'Fundamentals', weight: 30, status: 'live' },
  { name: 'Momentum', weight: 25, status: 'pending' },
  { name: 'Quality', weight: 10, status: 'pending' },
] as const;

export function PmpScoreSection() {
  return (
    <section className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">PMP Score</h2>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        A point-in-time composite score ranking future winners — built on the same data you see above.
      </p>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {PILLARS.map((p) => (
          <div
            key={p.name}
            className={`rounded-lg p-3 border ${
              p.status === 'live'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
                : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700'
            }`}
          >
            <dt className="text-xs uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 flex items-center justify-between">
              {p.name}
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">{p.weight}%</span>
            </dt>
            <dd className={`mt-1 text-xs font-medium ${p.status === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {p.status === 'live' ? 'Live — see scores above' : 'Awaiting PIT data'}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
        The earnings pillar requires timestamped analyst-consensus history (point-in-time verified) —
        currently in vendor procurement. No score is published until the data passes the PIT integrity gate.
      </p>
    </section>
  );
}

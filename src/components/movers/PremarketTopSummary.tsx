import Link from 'next/link';
import type { PremarketArchiveRow } from '@/lib/seo/premarketArchive';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';

interface PremarketTopSummaryProps {
  direction: 'gainers' | 'losers';
  displayDate: string;
  rows: PremarketArchiveRow[];
  eligibleAnalysis: Set<string>;
}

/**
 * Concise SSR Top-5 summary card for daily pre-market archive pages.
 * Gives human scanners and AI search engines direct structured takeaways above the table.
 */
export function PremarketTopSummary({
  direction,
  displayDate,
  rows,
  eligibleAnalysis,
}: PremarketTopSummaryProps) {
  const top5 = rows.slice(0, 5);
  if (top5.length === 0) return null;

  const isGainers = direction === 'gainers';
  const accentText = isGainers
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <section
      aria-label={`Key pre-market ${direction} summary`}
      className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 p-4"
    >
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        Key Pre-Market {isGainers ? 'Gainers' : 'Decliners'} — {displayDate}
      </h2>
      <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        {top5.map((r, i) => (
          <li key={r.symbol} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-xs font-semibold text-slate-400 w-4">{i + 1}.</span>
            {eligibleAnalysis.has(r.symbol) ? (
              <Link href={`/analysis/${r.symbol}`} className="font-bold text-slate-900 dark:text-white hover:underline">
                {r.symbol}
              </Link>
            ) : (
              <span className="font-bold text-slate-900 dark:text-white">{r.symbol}</span>
            )}
            {r.name && <span className="text-slate-500 dark:text-slate-400">({r.name})</span>}
            <span className={`font-semibold tabular-nums ${accentText}`}>
              {formatPercent(r.changePct ?? 0)}
            </span>
            {r.price != null && (
              <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                at {formatPrice(r.price)}
              </span>
            )}
            {r.rvol != null && r.rvol >= 1.5 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                · {r.rvol.toFixed(1)}× rel. vol
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

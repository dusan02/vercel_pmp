import Link from 'next/link';
import type { RelatedOpportunities } from '@/lib/analysis/relatedOpportunities';
import { RelatedTickerLink } from './RelatedTickerLink';

interface Props {
  ticker: string;
  related: RelatedOpportunities;
}

/**
 * "Related opportunities" card — grouped cross-links to other tickers.
 * Server-rendered crawlable <a href> links; click tracking lives in
 * RelatedTickerLink (client). Renders nothing when no groups exist.
 */
export function RelatedOpportunities({ ticker, related }: Props) {
  if (related.groups.length === 0) return null;

  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Related opportunities</h2>
      <div className="space-y-4">
        {related.groups.map((g) => (
          <div key={g.key}>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.items.map((s) => (
                <RelatedTickerLink
                  key={s.symbol}
                  symbol={s.symbol}
                  name={s.name}
                  changePct={s.changePct}
                  badge={s.badge}
                  from={ticker}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
        <Link
          href="/premarket-movers"
          className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
        >
          All movers today →
        </Link>
        {related.sector && related.sector !== 'ETF' && (
          <Link
            href={`/sectors/${encodeURIComponent(related.sector)}`}
            className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
          >
            {related.sector} sector overview →
          </Link>
        )}
      </div>
    </div>
  );
}

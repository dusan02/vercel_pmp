import Link from 'next/link';
import ShareButtons from '@/components/ShareButtons';

interface AnalysisCrossLinksProps {
  ticker: string;
  companyName: string;
  description: string | null | undefined;
}

/** Cross-links to the related per-ticker report pages + share buttons in a compact 4-column grid. */
export function AnalysisCrossLinks({ ticker, companyName, description }: AnalysisCrossLinksProps) {
  return (
    <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4" aria-label="Related ticker reports">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Deep-Dive Reports for {companyName} ({ticker})
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://stockcv.com/embed"
            rel="noopener"
            className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            Embed {ticker} CV card →
          </a>
          <ShareButtons
            url={`https://premarketprice.com/analysis/${ticker}`}
            title={`${companyName} (${ticker}) Stock Analysis | PreMarketPrice`}
            description={description?.slice(0, 100)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-sm">
        <Link
          href={`/valuation/${ticker}`}
          className="group flex flex-col justify-between rounded-lg border border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 px-3.5 py-2.5 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
        >
          <span className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {ticker} Valuation &amp; P/E History →
          </span>
          <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            10Y historical multiples &amp; percentiles
          </span>
        </Link>

        <Link
          href={`/financials/${ticker}`}
          className="group flex flex-col justify-between rounded-lg border border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 px-3.5 py-2.5 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
        >
          <span className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {ticker} Financial Statements →
          </span>
          <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Income, balance sheet &amp; cash flow
          </span>
        </Link>

        <Link
          href={`/premarket/${ticker}`}
          className="group flex flex-col justify-between rounded-lg border border-gray-200/80 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 px-3.5 py-2.5 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
        >
          <span className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {ticker} Premarket &amp; Session →
          </span>
          <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Extended-hours quote &amp; session gaps
          </span>
        </Link>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 px-3.5 py-2.5">
          <a
            href={`https://stockcv.com/${ticker}`}
            rel="noopener"
            className="min-w-0 flex-1 hover:underline"
          >
            <span className="block text-xs font-bold text-indigo-900 dark:text-indigo-200">
              {ticker} Stock CV ↗
            </span>
            <span className="block mt-0.5 text-[11px] text-indigo-600/80 dark:text-indigo-300/80 truncate">
              One-page résumé · stockcv.com
            </span>
          </a>
          <a
            href={`https://gainerslosers.com/ticker/${ticker}`}
            rel="noopener"
            title={`${ticker} Unusual Moves on GainersLosers`}
            className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:text-blue-600"
          >
            Movers ↗
          </a>
        </div>
      </div>
    </section>
  );
}


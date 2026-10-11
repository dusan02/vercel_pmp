import Link from 'next/link';
import ShareButtons from '@/components/ShareButtons';

interface AnalysisCrossLinksProps {
  ticker: string;
  companyName: string;
  description: string | null | undefined;
}

/** Cross-links to the related per-ticker report pages + share buttons. */
export function AnalysisCrossLinks({ ticker, companyName, description }: AnalysisCrossLinksProps) {
  return (
    <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-sm flex flex-col gap-3">
      <Link
        href={`/premarket/${ticker}`}
        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        {companyName} ({ticker}) Premarket Movers →
      </Link>
      <Link
        href={`/valuation/${ticker}`}
        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        {companyName} ({ticker}) Valuation &amp; P/E History →
      </Link>
      <Link
        href={`/financials/${ticker}`}
        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        {companyName} ({ticker}) Financial Statements →
      </Link>
      {/* StockCV cross-link — a document-tile button, not another text link,
          so the one-page résumé reads as its own product. */}
      <a
        href={`https://stockcv.com/${ticker}`}
        rel="noopener"
        className="group mt-1 flex w-full max-w-md items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 transition-colors hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/60 dark:hover:bg-blue-900/20"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">
            {ticker} Stock CV
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
            The whole company on one page — stockcv.com
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
      </a>
      <a
        href="https://stockcv.com/embed"
        rel="noopener"
        className="max-w-md pl-4 text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
      >
        Writing about {ticker}? Embed this CV card on your site →
      </a>
      <ShareButtons
        url={`https://premarketprice.com/analysis/${ticker}`}
        title={`${companyName} (${ticker}) Stock Analysis | PreMarketPrice`}
        description={description?.slice(0, 100)}
      />
    </div>
  );
}

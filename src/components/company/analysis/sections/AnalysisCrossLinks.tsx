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
      <ShareButtons
        url={`https://premarketprice.com/analysis/${ticker}`}
        title={`${companyName} (${ticker}) Stock Analysis | PreMarketPrice`}
        description={description?.slice(0, 100)}
      />
    </div>
  );
}

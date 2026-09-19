import Link from 'next/link';

interface EarningsBannerProps {
  companyName: string;
  ticker: string;
  date: string;
  time: string | null;
  earningsDays: number;
}

/** Amber countdown strip shown when the next report is within 14 days. */
export function EarningsBanner({ companyName, ticker, date, time, earningsDays }: EarningsBannerProps) {
  const timeLabel = time === 'bmo' ? 'before market open' : time === 'amc' ? 'after market close' : '';
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-sm">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200">
        Earnings
      </span>
      <span className="text-gray-700 dark:text-gray-300">
        {companyName} ({ticker}) reports{' '}
        <strong className="font-semibold">
          {earningsDays === 0 ? 'today' : earningsDays === 1 ? 'tomorrow' : `in ${earningsDays} days`}
        </strong>{' '}
        ({date}{timeLabel ? `, ${timeLabel}` : ''}).
      </span>
      <Link href="/earnings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
        Full calendar →
      </Link>
    </div>
  );
}

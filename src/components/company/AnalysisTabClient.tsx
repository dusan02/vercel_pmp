'use client';

import dynamic from 'next/dynamic';

const AnalysisTab = dynamic(
  () => import('./AnalysisTab'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
      </div>
    ),
  }
);

interface Props {
  ticker: string;
  hideSearch?: boolean;
}

export function AnalysisTabClient({ ticker, hideSearch }: Props) {
  return <AnalysisTab ticker={ticker} hideSearch={hideSearch === true} />;
}

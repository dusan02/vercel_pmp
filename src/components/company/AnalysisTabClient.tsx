'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { event } from '@/lib/ga';

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

export function AnalysisTabClient({ ticker, initialAnalysisData, initialHistoryData }: { ticker: string; initialAnalysisData?: any; initialHistoryData?: any }) {
  useEffect(() => {
    event('analysis_view', { ticker });
  }, [ticker]);

  return <AnalysisTab ticker={ticker} initialAnalysisData={initialAnalysisData} initialHistoryData={initialHistoryData} />;
}

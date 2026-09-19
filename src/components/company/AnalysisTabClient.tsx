'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { event } from '@/lib/ga';
import type { FlowPeriods } from './analysis/sections/FinancialFlowsSection';

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

interface EwScoreLite {
  totalScore: number | null;
  maxPossible: number | null;
  rank: number | null;
  asOfDate: Date | string | null;
}

export function AnalysisTabClient({ ticker, initialAnalysisData, initialHistoryData, flowPeriods, ewScore }: { ticker: string; initialAnalysisData?: unknown; initialHistoryData?: unknown; flowPeriods?: FlowPeriods | null; ewScore?: EwScoreLite | null }) {
  useEffect(() => {
    event('analysis_view', { ticker });
  }, [ticker]);

  return <AnalysisTab ticker={ticker} initialAnalysisData={initialAnalysisData} initialHistoryData={initialHistoryData} flowPeriods={flowPeriods} ewScore={ewScore} />;
}

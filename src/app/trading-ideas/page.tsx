import { Suspense } from 'react';
import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { evaluateTradingIdeasBoard } from '@/lib/tradingIdeas/dipEngine';
import { TradingIdeasBoard } from '@/components/tradingIdeas/TradingIdeasBoard';

export const revalidate = 60;

export const metadata: Metadata = generatePageMetadata({
  title: 'Trading Ideas (Long / Dip-Buying Engine) — RSI Gaussian & 3-Tranche Pyramid',
  description:
    'Contrarian dip-buying system for stocks, index ETFs and leveraged ETFs (SOXX/SOXL, QQQ/TQQQ, MSFT/MSFL, MELI/KMLI, NFLX/NFLU). Daily & Weekly Wilder RSI (14), Gaussian tail probability, Premarket Anti-FOMO Semafor and 28:28:44 weighted tranche calculator.',
  path: '/trading-ideas',
  keywords: [
    'trading ideas',
    'dip buying strategy',
    'rsi gaussian curve',
    'leveraged etf calculator',
    'soxl trading strategy',
    'tqqq dip buying',
    'weekly sma 200',
    'premarket anti fomo',
  ],
});

export default async function TradingIdeasPage() {
  const apiKey = process.env.POLYGON_API_KEY;
  const isCiBuild = !apiKey || apiKey === 'dummy_key_for_ci_build';
  const initialBoard = isCiBuild ? null : await evaluateTradingIdeasBoard().catch(() => null);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 py-6">
        <Suspense fallback={<div className="h-96 animate-pulse bg-slate-200 dark:bg-slate-900 rounded-2xl" />}>
          <TradingIdeasBoard initialData={initialBoard && initialBoard.items.length > 0 ? initialBoard : null} />
        </Suspense>
      </main>
    </div>
  );
}

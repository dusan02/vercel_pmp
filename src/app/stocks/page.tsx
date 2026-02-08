/**
 * ISR Stocks Page - Pre-rendered page 1 for instant display
 * Uses ISR (Incremental Static Regeneration) with 60s revalidate
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import StocksClient from '@/components/StocksClient';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 60; // Revalidate every 60 seconds

type ApiResp = {
  rows: Array<{ t: string; p: number; c: number; m: number; d?: number }>;
  nextCursor?: string | null;
  error?: string;
};

export const metadata: Metadata = generatePageMetadata({
  title: 'All Stocks',
  description: 'Browse real-time pre-market stock data for US equities. Sort by price, % change, market cap and market cap change. Fast, searchable, and optimized for mobile and desktop.',
  path: '/stocks',
  keywords: [
    'stocks',
    'stock list',
    'pre-market stocks',
    'market movers',
    'stock screener',
  ],
});

async function getInitialData(): Promise<ApiResp> {
  try {
    // Avoid internal HTTP fetches during build/ISR. Read directly from DB cache columns.
    const tickers = await prisma.ticker.findMany({
      where: { lastPrice: { gt: 0 } },
      orderBy: { lastMarketCap: 'desc' },
      take: 50,
      select: {
        symbol: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        lastMarketCapDiff: true,
      },
    });

    return {
      rows: tickers.map((t) => ({
        t: t.symbol,
        p: t.lastPrice ?? 0,
        c: t.lastChangePct ?? 0,
        m: t.lastMarketCap ?? 0,
        d: t.lastMarketCapDiff ?? 0,
      })),
      nextCursor: null,
    };
  } catch (error) {
    console.error('Error fetching initial data:', error);
    return { rows: [], nextCursor: null };
  }
}

export default async function StocksPage() {
  const initial = await getInitialData();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-bold mb-4 dark:text-white">All Stocks</h1>
        
        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse bg-gray-200 rounded border"
                />
              ))}
            </div>
          }
        >
          <StocksClient initial={initial} />
        </Suspense>
      </div>
    </div>
  );
}


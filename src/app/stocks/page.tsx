/**
 * ISR Stocks Page - Pre-rendered page 1 for instant display
 * Uses ISR (Incremental Static Regeneration) with 60s revalidate
 */

import { Suspense } from 'react';
import StocksClient from '@/components/StocksClient';

export const revalidate = 60; // Revalidate every 60 seconds
export const dynamic = 'force-dynamic'; // Allow dynamic rendering for now

type ApiResp = {
  rows: Array<{ t: string; p: number; c: number; m: number; d?: number }>;
  nextCursor?: string | null;
  error?: string;
};

async function getInitialData(): Promise<ApiResp> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const url = `${baseUrl}/api/stocks/optimized?sort=mcap&dir=desc&limit=50`;
    
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: {
        'x-internal': '1', // Internal request marker
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Initial data fetch failed: ${response.status}`);
      return { rows: [], nextCursor: null };
    }

    const data = await response.json();
    return data;
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


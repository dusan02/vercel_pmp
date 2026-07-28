/**
 * Optimized Stocks Client Component
 * Uses SWR for data fetching with fallbackData + debounced search + skeleton loading
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';

type MinimalRow = {
  t: string;  // ticker
  p: number;  // price
  c: number;  // changePct
  m: number;  // marketCap
  d?: number; // marketCapDiff (optional)
};

type ApiResp = {
  rows: MinimalRow[];
  nextCursor?: string | null;
  error?: string;
};

const fetcher = async (url: string): Promise<ApiResp> => {
  const response = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 304) {
      // Not Modified - return cached data
      return { rows: [], nextCursor: null };
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

interface StocksClientProps {
  initial: ApiResp;
}

export default function StocksClient({ initial }: StocksClientProps) {
  const [sort, setSort] = useState<'mcap' | 'chgPct' | 'price'>('mcap');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);

  // Debounced search (250ms)
  useMemo(() => {
    const id = setTimeout(() => {
      setQ(qInput.trim().toUpperCase());
      setCursor(null); // Reset cursor on search change
    }, 250);
    return () => clearTimeout(id);
  }, [qInput]);

  // Build API key
  const apiKey = useMemo(() => {
    const params = new URLSearchParams({
      sort,
      dir,
      limit: '50'
    });
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return `/api/stocks/optimized?${params.toString()}`;
  }, [sort, dir, q, cursor]);

  // SWR with fallbackData and auto-refresh
  const { data, error, isLoading, isValidating } = useSWR<ApiResp>(
    apiKey as any,
    fetcher as any,
    {
      ...(cursor ? {} : { fallbackData: initial }), // Only use initial for first page
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      refreshInterval: 30000 // Auto-refresh every 30 seconds (same as heatmap)
    } as any
  );

  const handleSortChange = useCallback((newSort: 'mcap' | 'chgPct' | 'price') => {
    setSort(newSort);
    setCursor(null); // Reset cursor on sort change
  }, []);

  const handleDirToggle = useCallback(() => {
    setDir(d => d === 'desc' ? 'asc' : 'desc');
    setCursor(null); // Reset cursor on dir change
  }, []);

  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  }, [data?.nextCursor]);

  const rows = data?.rows || [];
  const hasMore = !!data?.nextCursor;

  return (
    <div className="p-4">
      {/* Search and Controls */}
      <div className="mb-4 flex gap-2 items-center flex-wrap">
        <input
          className="pmp-input w-64"
          placeholder="Search ticker…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          type="text"
        />

        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as 'mcap' | 'chgPct' | 'price')}
          className="pmp-input w-40"
        >
          <option value="mcap">Market Cap</option>
          <option value="chgPct">% Change</option>
          <option value="price">Price</option>
        </select>

        <button
          className="pmp-input w-24 text-center font-medium"
          onClick={handleDirToggle}
          type="button"
        >
          {dir.toUpperCase()}
        </button>

        {isValidating && (
          <span className="text-sm text-gray-500 dark:text-gray-400">Updating...</span>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300">
          Error: {error instanceof Error ? error.message : 'Failed to load data'}
        </div>
      )}

      {/* Loading Skeleton */}
      {(!data || isLoading) && rows.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse bg-gray-200 dark:bg-slate-700 rounded border dark:border-slate-600"
            />
          ))}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-gray-900 dark:text-gray-100">
              <thead>
                <tr className="text-left border-b border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
                  <th className="py-2 px-3 font-semibold">Ticker</th>
                  <th className="py-2 px-3 font-semibold text-right">Price</th>
                  <th className="py-2 px-3 font-semibold text-right">%Chg</th>
                  <th className="py-2 px-3 font-semibold text-right">Mkt Cap</th>
                  {rows.some(r => r.d !== undefined) && (
                    <th className="py-2 px-3 font-semibold text-right">Mkt Cap Δ</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.t}
                    className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2 px-3 font-medium">{r.t}</td>
                    <td className="py-2 px-3 text-right">
                      {r.p > 0 ? r.p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-medium ${r.c > 0
                          ? 'text-green-600 dark:text-green-400'
                          : r.c < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                    >
                      {r.c !== 0 ? `${r.c > 0 ? '+' : ''}${r.c.toFixed(2)}%` : '0.00%'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.m > 0 ? `${Math.round(r.m / 1e9).toLocaleString()}B` : '-'}
                    </td>
                    {r.d !== undefined && (
                      <td className="py-2 px-3 text-right">
                        {r.d !== 0
                          ? `${r.d > 0 ? '+' : ''}${Math.round(r.d / 1e9).toLocaleString()}B`
                          : '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleLoadMore}
                disabled={isValidating}
                type="button"
              >
                {isValidating ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          {/* Results Count */}
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
            Showing {rows.length} {rows.length === 1 ? 'result' : 'results'}
            {data?.nextCursor && ' (more available)'}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && rows.length === 0 && !error && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No results found. Try adjusting your search or filters.
        </div>
      )}
    </div>
  );
}


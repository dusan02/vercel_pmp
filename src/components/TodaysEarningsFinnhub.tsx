'use client';

import React, { useState, useEffect } from 'react';
import { formatBillions } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import { SectionIcon } from './SectionIcon';
import { StockData } from '@/lib/types';
import CompanyLogo from './CompanyLogo';
import { EarningsCardMobile } from './EarningsCardMobile';
import { MobileSortHeader } from './mobile/MobileSortHeader';

interface EarningsData {
  ticker: string;
  companyName: string;
  marketCap: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
  percentChange: number | null;
  marketCapDiff: number | null;
  time: string;
  date: string;
  logoUrl?: string;
}

interface EarningsResponse {
  success: boolean;
  data: {
    preMarket: EarningsData[];
    afterMarket: EarningsData[];
  };
  message?: string;
  cached?: boolean;
}

// Helper funkcie
const getProjectFromHostname = (): string => {
  if (typeof window === 'undefined') return 'pmp';
  const hostname = window.location.hostname;
  if (hostname.includes('premarketprice.com')) return 'pmp';
  if (hostname.includes('capmovers.com')) return 'cm';
  if (hostname.includes('gainerslosers.com')) return 'gl';
  if (hostname.includes('stockcv.com')) return 'cv';
  return 'pmp';
};

const mergeStockDataWithEarnings = (
  earnings: EarningsData[],
  stockMap: Map<string, StockData>
): EarningsData[] => {
  return earnings.map(earning => {
    const stock = stockMap.get(earning.ticker);
    if (stock) {
      return {
        ...earning,
        marketCap: stock.marketCap,
        percentChange: stock.percentChange,
        marketCapDiff: stock.marketCapDiff
      };
    }
    return earning;
  });
};

const formatEarningsValue = (value: number | null, isPercent = false, isCurrency = false): string => {
  if (value === null || value === undefined) return '-';
  if (isPercent) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }
  if (isCurrency) {
    return `$${value.toFixed(2)}`;
  }
  // Default: 0 decimals with space as thousands separator
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).replace(/,/g, ' ');
};

// Custom hook pre earnings data
function useEarningsData(date: string, initialData?: EarningsResponse | null) {
  const [data, setData] = useState<EarningsResponse | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Skip initial load if we have data
  const hasInitialized = React.useRef(!!initialData);

  const fetchData = async (refresh = false) => {
    // If we have initial data and not refreshing, skip
    if (hasInitialized.current && !refresh) {
      hasInitialized.current = false;
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First get earnings schedule
      const earningsUrl = refresh
        ? `/api/earnings-finnhub?date=${date}&refresh=true`
        : `/api/earnings-finnhub?date=${date}`;

      // Use AbortController for better timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // Increased to 20s timeout to handle cold starts

      let earningsResponse: Response;
      try {
        earningsResponse = await fetch(earningsUrl, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          // Timeout - handle gracefully without throwing error
          setData({
            success: true,
            data: { preMarket: [], afterMarket: [] }
          });
          setIsLoading(false);
          return;
        }
        throw fetchError;
      }

      if (!earningsResponse.ok) {
        const errorText = await earningsResponse.text().catch(() => earningsResponse.statusText);
        const status = earningsResponse.status;

        // Handle specific error codes
        if (status === 503) {
          throw new Error('Service temporarily unavailable - please try again in a moment');
        } else if (status === 500) {
          throw new Error('Server error - please try again later');
        } else if (status === 429) {
          throw new Error('Too many requests - please wait a moment');
        } else {
          throw new Error(`HTTP ${status}: ${errorText || earningsResponse.statusText}`);
        }
      }

      const earningsResult: EarningsResponse = await earningsResponse.json();

      // Validate earnings response
      if (!earningsResult.success || !earningsResult.data) {
        throw new Error(earningsResult.message || 'Invalid earnings data received');
      }

      // Get current stock data from the same API as main table for consistency
      const project = getProjectFromHostname();

      // Extract unique tickers from earnings data
      const tickers = [
        ...new Set([
          ...earningsResult.data.preMarket.map(e => e.ticker),
          ...earningsResult.data.afterMarket.map(e => e.ticker)
        ])
      ];

      if (tickers.length > 0) {
        try {
          // Use shorter timeout for stocks API to avoid blocking earnings display
          const stocksUrl = `/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=3000&t=${Date.now()}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

          const stocksResponse = await fetch(stocksUrl, {
            cache: 'no-store',
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (stocksResponse.ok) {
            const stocksResult = await stocksResponse.json();

            // Merge stock data with earnings data for consistency
            if (stocksResult.data && Array.isArray(stocksResult.data) && stocksResult.data.length > 0) {
              const stockMap = new Map<string, StockData>(stocksResult.data.map((s: StockData) => [s.ticker, s]));

              const updatedPreMarket = mergeStockDataWithEarnings(earningsResult.data.preMarket, stockMap);
              const updatedAfterMarket = mergeStockDataWithEarnings(earningsResult.data.afterMarket, stockMap);

              setData({
                ...earningsResult,
                data: {
                  preMarket: updatedPreMarket,
                  afterMarket: updatedAfterMarket
                }
              });
              return;
            }
          } else {
            console.warn(`Stocks API returned ${stocksResponse.status} - using earnings data without stock updates`);
          }
        } catch (stockError) {
          // Log but don't fail - use earnings data without stock updates
          if (stockError instanceof Error && stockError.name === 'AbortError') {
            console.warn('Stocks API timeout - using earnings data without stock updates');
          } else {
            console.warn('Failed to fetch stock data for earnings:', stockError);
          }
        }
      }

      // Fallback to original earnings data if stock data fetch fails
      setData(earningsResult);
    } catch (err) {
      // Timeout errors are already handled in the inner catch block above
      // This catch block only handles other errors
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to fetch earnings data';
      setError(errorMessage);
      console.error('Error fetching earnings data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (date) {
      // If initialized, skip first fetch unless date changed significantly
      if (!hasInitialized.current) {
        fetchData();
      } else {
        // Reset flag for future date changes
        // If "date" prop is same as initial data date, this is fine.
        // Effectively we skip the very first effect run if we have initialData
      }

      // Auto-refresh for today's earnings every 10 minutes (reduced frequency to avoid rate limiting)
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        const interval = setInterval(() => {
          fetchData(true);
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(interval);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return { data, isLoading, error, refetch: () => fetchData(true) };
}

const EarningsHeader = () => (
  <div className="flex items-center justify-between mb-4 px-4">
    <div className="flex items-center">
      <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--clr-text)] m-0 relative -top-1.5">
        <SectionIcon type="calendar" size={24} className="text-[var(--clr-text)]" />
        <span>Earnings</span>
      </h2>
    </div>
  </div>
);

// Loading component for earnings
const EarningsLoader = () => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
      <span className="text-gray-600 dark:text-gray-400">Loading today&apos;s earnings...</span>
    </div>
  </section>
);

// Error component for earnings - REFAKTOROVANÝ
const EarningsError = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
      <div className="text-6xl mb-2 opacity-50 grayscale">
        ⚠️
      </div>
      <span className="text-base font-semibold text-gray-900 dark:text-white">
        Error loading earnings data
      </span>
      <span className="text-sm max-w-xs mb-4 text-gray-500 dark:text-gray-400">
        {error}
      </span>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-colors hover:bg-blue-700"
      >
        Try Again
      </button>
    </div>
  </section>
);

// Empty state component for earnings - REFAKTOROVANÝ
const EarningsEmpty = () => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
      <div className="text-6xl mb-2 opacity-50 grayscale">
        📅
      </div>
      <span className="text-base font-semibold text-gray-900 dark:text-white">
        No earnings scheduled for today
      </span>
      <p className="text-sm max-w-xs text-gray-500 dark:text-gray-400">
        For the full list, visit{' '}
        <a
          href="https://www.earningstable.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-blue-600 hover:text-blue-700"
        >
          www.earningstable.com
        </a>
      </p>
    </div>
  </section>
);

export default function TodaysEarningsFinnhub({ initialData }: { initialData?: any }) {
  const [currentDate, setCurrentDate] = useState('');
  const [sortKey, setSortKey] = useState<keyof EarningsData>('marketCap');
  const [ascending, setAscending] = useState(false);

  // Set current date in Eastern Time
  useEffect(() => {
    const updateDate = () => {
      // Use ET calendar date derived via Intl (no localized string parsing).
      import('@/lib/utils/dateET').then(({ getDateET }) => {
        setCurrentDate(getDateET(new Date()));
      });
    };

    updateDate();

    // Set up midnight refresh (Eastern Time)
    let midnightTimeout: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      const { createETDate, getDateET, toET } = await import('@/lib/utils/dateET');
      const now = new Date();

      const pad2 = (n: number) => String(n).padStart(2, '0');
      const addETCalendarDays = (base: Date, days: number) => {
        const p = toET(base);
        const utcNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
        utcNoon.setUTCDate(utcNoon.getUTCDate() + days);
        return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
      };

      const tomorrowYMD = addETCalendarDays(now, 1);
      const tomorrowETMidnight = createETDate(tomorrowYMD);
      const timeUntilMidnight = tomorrowETMidnight.getTime() - now.getTime();

      midnightTimeout = setTimeout(() => updateDate(), Math.max(1000, timeUntilMidnight));
    })();

    return () => {
      if (midnightTimeout) {
        clearTimeout(midnightTimeout);
      }
    };
  }, []);

  const { data, isLoading, error, refetch } = useEarningsData(currentDate, initialData);

  const handleSort = (key: keyof EarningsData) => {
    if (sortKey === key) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(false); // Start with DESC (false = descending)
    }
  };

  const sortData = (data: EarningsData[]) => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return ascending ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  };

  // Show loading state
  if (isLoading) {
    return <EarningsLoader />;
  }

  // Show error state
  if (error) {
    return <EarningsError error={error} onRetry={refetch} />;
  }

  // Show empty state
  if (!data || (!data.data.preMarket.length && !data.data.afterMarket.length)) {
    return <EarningsEmpty />;
  }

  const sortedPreMarket = sortData(data.data.preMarket);
  const sortedAfterMarket = sortData(data.data.afterMarket);

  // Combine pre-market and after-market into one table
  const allEarnings = [...sortedPreMarket, ...sortedAfterMarket];

  return (
    <section className="todays-earnings border-none outline-none ring-0">
      <EarningsHeader />

      {allEarnings.length > 0 ? (
        <>



          {/* Mobile: Card Layout with Sort Header */}
          <div className="lg:hidden flex flex-col">
            <MobileSortHeader
              columns={[
                { key: 'ticker', label: 'Ticker', sortable: true, width: 'w-28', align: 'left' },
                { key: 'spacer', label: '', sortable: false, width: 'flex-1', align: 'left' }, // Spacer
                { key: 'epsEstimate', label: 'EPS', sortable: true, width: 'w-12', align: 'right' },
                { key: 'revenueEstimate', label: 'Rev', sortable: true, width: 'w-14', align: 'right' },
                { key: 'percentChange', label: '%', sortable: true, width: 'w-14', align: 'right' },
              ]}
              sortKey={sortKey}
              ascending={ascending}
              onSort={(key) => handleSort(key as keyof EarningsData)}
            />
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {allEarnings.map((earning, index) => (
                <EarningsCardMobile
                  key={`${earning.ticker}-mobile-${index}`}
                  earning={earning}
                  priority={index < 10}
                />
              ))}
            </div>
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="pmp-universal-table w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-left hidden lg:table-cell">Logo</th>
                  <th onClick={() => handleSort('ticker')} className={`py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-left cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none ${sortKey === 'ticker' ? 'active-sort' : ''}`}>
                    <div className="flex items-center gap-1">
                      Ticker
                      {sortKey === 'ticker' && <span className="text-[10px] opacity-70">{ascending ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                  <th onClick={() => handleSort('companyName')} className={`py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-left hidden lg:table-cell cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none ${sortKey === 'companyName' ? 'active-sort' : ''}`}>
                    <div className="flex items-center gap-1">
                      Company Name
                      {sortKey === 'companyName' && <span className="text-[10px] opacity-70">{ascending ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                  <th onClick={() => handleSort('marketCap')} className={`py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-right hidden lg:table-cell cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none ${sortKey === 'marketCap' ? 'active-sort' : ''}`}>
                    <div className="flex items-center gap-1 justify-end">
                      Market Cap
                      {sortKey === 'marketCap' && <span className="text-[10px] opacity-70">{ascending ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                  <th className="py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-center">
                    <div>EPS</div>
                    <div className="flex items-center justify-center gap-2 text-[10px] opacity-80 font-normal">
                      <span onClick={() => handleSort('epsEstimate')} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-300">Est</span>
                      <span className="opacity-50">/</span>
                      <span onClick={() => handleSort('epsActual')} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-300">Rep</span>
                    </div>
                  </th>
                  <th className="py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-center">
                    <div>Revenue</div>
                    <div className="flex items-center justify-center gap-2 text-[10px] opacity-80 font-normal">
                      <span onClick={() => handleSort('revenueEstimate')} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-300">Est</span>
                      <span className="opacity-50">/</span>
                      <span onClick={() => handleSort('revenueActual')} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-300">Rep</span>
                    </div>
                  </th>
                  <th onClick={() => handleSort('percentChange')} className={`py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-right cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none ${sortKey === 'percentChange' ? 'active-sort' : ''}`}>
                    <div className="flex items-center gap-1 justify-end">
                      % Change
                      {sortKey === 'percentChange' && <span className="text-[10px] opacity-70">{ascending ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                  <th onClick={() => handleSort('marketCapDiff')} className={`py-3 px-3 first:pl-4 last:pr-4 font-semibold text-xs md:text-sm whitespace-nowrap bg-blue-100 text-slate-900 border-b border-blue-200/80 dark:bg-blue-900/60 dark:text-white dark:border-white/10 text-right hidden lg:table-cell cursor-pointer hover:bg-blue-200/70 dark:hover:bg-white/10 transition-colors select-none ${sortKey === 'marketCapDiff' ? 'active-sort' : ''}`}>
                    <div className="flex items-center gap-1 justify-end">
                      Cap Diff
                      {sortKey === 'marketCapDiff' && <span className="text-[10px] opacity-70">{ascending ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {allEarnings.map((earning, index) => {
                  // Helper pre získanie CSS triedy pre pozitívne/negatívne hodnoty
                  const getValueClass = (value: number | null, isPositive: boolean): string => {
                    if (value === null) return '';
                    return isPositive ? 'positive' : 'negative';
                  };

                  // Helper pre formátovanie percent change
                  const formatPercentChange = (value: number | null): string => {
                    if (value === null) return '-';
                    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                  };

                  // Helper pre formátovanie market cap diff
                  const formatMarketCapDiff = (value: number | null): string => {
                    if (value === null) return '-';
                    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
                  };

                  return (
                    <tr key={`${earning.ticker}-${index}-desktop`} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)] hidden lg:table-cell text-center">
                        <div className="flex justify-center items-center w-full">
                          <CompanyLogo
                            ticker={earning.ticker.trim().toUpperCase()}
                            size={32}
                            priority={index < 15}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)]"><strong>{earning.ticker}</strong></td>
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)] hidden lg:table-cell">{getCompanyName(earning.ticker)}</td>
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)] hidden lg:table-cell text-right tabular-nums">{earning.marketCap !== null ? formatBillions(earning.marketCap) : '-'}</td>
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)] text-center">
                        <div className="flex items-center justify-center gap-2 tabular-nums">
                          <span className="text-gray-500 dark:text-gray-400">{formatEarningsValue(earning.epsEstimate, false, true)}</span>
                          <span className="opacity-30">/</span>
                          <span className={`${earning.epsActual !== null && earning.epsEstimate !== null ? (earning.epsActual >= earning.epsEstimate ? 'text-green-500 font-medium' : 'text-red-500 font-medium') : ''}`}>
                            {formatEarningsValue(earning.epsActual, false, true)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 first:pl-4 last:pr-4 text-sm text-[var(--clr-text)] text-center">
                        <div className="flex items-center justify-center gap-2 tabular-nums">
                          <span className="text-gray-500 dark:text-gray-400">{formatEarningsValue(earning.revenueEstimate ? earning.revenueEstimate / 1000000 : null)}</span>
                          <span className="opacity-30">/</span>
                          <span className={`${earning.revenueActual !== null && earning.revenueEstimate !== null ? (earning.revenueActual >= earning.revenueEstimate ? 'text-green-500 font-medium' : 'text-red-500 font-medium') : ''}`}>
                            {formatEarningsValue(earning.revenueActual ? earning.revenueActual / 1000000 : null)}
                          </span>
                        </div>
                      </td>
                      <td className={`py-3 px-3 first:pl-4 last:pr-4 text-sm text-right tabular-nums ${earning.percentChange !== null && earning.percentChange >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}`}>
                        {formatPercentChange(earning.percentChange)}
                      </td>
                      <td className={`py-3 px-3 first:pl-4 last:pr-4 text-sm hidden lg:table-cell text-right tabular-nums ${earning.marketCapDiff !== null && earning.marketCapDiff >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}`}>
                        {formatMarketCapDiff(earning.marketCapDiff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center p-8 text-gray-500">
          <p className="whitespace-nowrap">No earnings reports today from tracked companies</p>
        </div>
      )}

    </section>
  );
} 
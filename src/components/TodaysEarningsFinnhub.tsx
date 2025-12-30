'use client';

import React, { useState, useEffect } from 'react';
import { formatBillions } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import { SectionIcon } from './SectionIcon';
import { StockData } from '@/lib/types';
import CompanyLogo from './CompanyLogo';

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
        marketCapDiff: stock.marketCapDiff,
        ...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})
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
  return value.toFixed(2);
};

// Custom hook pre earnings data
function useEarningsData(date: string) {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (refresh = false) => {
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
      fetchData();

      // Auto-refresh for today's earnings every 10 minutes (reduced frequency to avoid rate limiting)
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        const interval = setInterval(() => {
          fetchData(true);
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(interval);
      }
    }
  }, [date]);

  return { data, isLoading, error, refetch: () => fetchData(true) };
}

const EarningsHeader = () => (
  <div className="section-header">
    <div className="header-main">
      <h2>
        <SectionIcon type="calendar" size={20} className="section-icon" />
        <span>Today&apos;s Earnings</span>
      </h2>
    </div>
  </div>
);

// Loading component for earnings
const EarningsLoader = () => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="flex items-center justify-center p-8">
      <span className="text-gray-600">Loading today&apos;s earnings...</span>
    </div>
  </section>
);

// Error component for earnings
const EarningsError = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="text-center p-8">
      <p className="text-red-600 mb-4">Error loading earnings data: {error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Try Again
      </button>
    </div>
  </section>
);

// Empty state component for earnings
const EarningsEmpty = () => (
  <section className="todays-earnings">
    <EarningsHeader />
    <div className="text-center p-8 text-gray-500">
      <p>
        No major company earnings scheduled for today. For the full list, visit{' '}
        <a
          href="https://www.earningstable.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          www.earningstable.com
        </a>
        .
      </p>
    </div>
  </section>
);

export default function TodaysEarningsFinnhub() {
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

  const { data, isLoading, error, refetch } = useEarningsData(currentDate);

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
    <section className="todays-earnings">
      <EarningsHeader />

      {allEarnings.length > 0 ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Logo</th>
                <th onClick={() => handleSort('ticker')} className={`sortable ${sortKey === 'ticker' ? 'active-sort' : ''}`}>
                  Ticker
                </th>
                <th onClick={() => handleSort('companyName')} className={`sortable ${sortKey === 'companyName' ? 'active-sort' : ''}`}>
                  Company Name
                </th>
                <th onClick={() => handleSort('marketCap')} className={`sortable ${sortKey === 'marketCap' ? 'active-sort' : ''}`}>
                  Market Cap
                </th>
                <th className="grouped-header">
                  <div>EPS</div>
                  <div className="sub-header">
                    <span onClick={() => handleSort('epsEstimate')} className="sortable sub-sortable">Est</span>
                    <span className="separator">/</span>
                    <span onClick={() => handleSort('epsActual')} className="sortable sub-sortable">Rep</span>
                  </div>
                </th>
                <th className="grouped-header">
                  <div>Revenue</div>
                  <div className="sub-header">
                    <span onClick={() => handleSort('revenueEstimate')} className="sortable sub-sortable">Est</span>
                    <span className="separator">/</span>
                    <span onClick={() => handleSort('revenueActual')} className="sortable sub-sortable">Rep</span>
                  </div>
                </th>
                <th onClick={() => handleSort('percentChange')} className={`sortable ${sortKey === 'percentChange' ? 'active-sort' : ''}`}>
                  % Change
                </th>
                <th onClick={() => handleSort('marketCapDiff')} className={`sortable ${sortKey === 'marketCapDiff' ? 'active-sort' : ''}`}>
                  Cap Diff
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
                  <tr key={`${earning.ticker}-${index}`}>
                    <td>
                      <div className="logo-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {/* Priority loading for first 15 logos (above the fold) */}
                        <CompanyLogo
                          ticker={earning.ticker}
                          {...(earning.logoUrl ? { logoUrl: earning.logoUrl } : {})}
                          size={40}
                          priority={index < 15}
                        />
                      </div>
                    </td>
                    <td><strong>{earning.ticker}</strong></td>
                    <td className="company-name">{getCompanyName(earning.ticker)}</td>
                    <td>{earning.marketCap !== null ? formatBillions(earning.marketCap) : '-'}</td>
                    <td className="grouped-cell">
                      <div className="cell-value">{formatEarningsValue(earning.epsEstimate, false, true)}</div>
                      <div className={`cell-value ${earning.epsActual !== null && earning.epsEstimate !== null ? (earning.epsActual >= earning.epsEstimate ? 'positive' : 'negative') : ''}`}>
                        {formatEarningsValue(earning.epsActual, false, true)}
                      </div>
                    </td>
                    <td className="grouped-cell">
                      <div className="cell-value">{formatEarningsValue(earning.revenueEstimate ? earning.revenueEstimate / 1000000 : null)}</div>
                      <div className={`cell-value ${earning.revenueActual !== null && earning.revenueEstimate !== null ? (earning.revenueActual >= earning.revenueEstimate ? 'positive' : 'negative') : ''}`}>
                        {formatEarningsValue(earning.revenueActual ? earning.revenueActual / 1000000 : null)}
                      </div>
                    </td>
                    <td className={getValueClass(earning.percentChange, earning.percentChange !== null && earning.percentChange >= 0)}>
                      {formatPercentChange(earning.percentChange)}
                    </td>
                    <td className={getValueClass(earning.marketCapDiff, earning.marketCapDiff !== null && earning.marketCapDiff >= 0)}>
                      {formatMarketCapDiff(earning.marketCapDiff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center p-8 text-gray-500">
          <p className="whitespace-nowrap">No earnings reports today from tracked companies</p>
        </div>
      )}

    </section>
  );
} 
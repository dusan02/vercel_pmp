'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { formatBillions } from '@/lib/format';
import { getCompanyName } from '@/lib/companyNames';

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated?: string;
}

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
        
      const earningsResponse = await fetch(earningsUrl, {
        signal: AbortSignal.timeout(15000)
      });
      
      if (!earningsResponse.ok) {
        throw new Error(`HTTP ${earningsResponse.status}: ${earningsResponse.statusText}`);
      }
      
      const earningsResult: EarningsResponse = await earningsResponse.json();
      
      // Get current stock data from the same API as main table for consistency
      const project = window.location.hostname.includes('premarketprice.com') ? 'pmp' : 
                     window.location.hostname.includes('capmovers.com') ? 'cm' :
                     window.location.hostname.includes('gainerslosers.com') ? 'gl' :
                     window.location.hostname.includes('stockcv.com') ? 'cv' : 'pmp';
      
      // Extract tickers from earnings data
      const tickers = [
        ...earningsResult.data.preMarket.map(e => e.ticker),
        ...earningsResult.data.afterMarket.map(e => e.ticker)
      ];
      
      if (tickers.length > 0) {
        const stocksUrl = `/api/stocks?tickers=${tickers.join(',')}&project=${project}&limit=3000&t=${Date.now()}`;
        const stocksResponse = await fetch(stocksUrl, { cache: 'no-store' });
        
        if (stocksResponse.ok) {
          const stocksResult = await stocksResponse.json();
          
          // Merge stock data with earnings data for consistency
          if (stocksResult.data && stocksResult.data.length > 0) {
            const stockMap = new Map<string, StockData>(stocksResult.data.map((s: StockData) => [s.ticker, s]));
            
            // Update earnings data with current stock prices
            const updatedPreMarket = earningsResult.data.preMarket.map(earning => {
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
            
            const updatedAfterMarket = earningsResult.data.afterMarket.map(earning => {
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
            
            setData({
              ...earningsResult,
              data: {
                preMarket: updatedPreMarket,
                afterMarket: updatedAfterMarket
              }
            });
            return;
          }
        }
      }
      
      // Fallback to original earnings data if stock data fetch fails
      setData(earningsResult);
    } catch (err) {
      console.error('Error fetching earnings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch earnings data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (date) {
      fetchData();
      
      // Auto-refresh for today's earnings every 5 minutes
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        const interval = setInterval(() => {
          console.log('🔄 Auto-refreshing today\'s earnings data...');
          fetchData(true);
        }, 5 * 60 * 1000); // 5 minutes
        
        return () => clearInterval(interval);
      }
    }
  }, [date]);

  return { data, isLoading, error, refetch: () => fetchData(true) };
}

// Virtualized table component
function VirtualizedTable({ 
  data, 
  title, 
  onSort, 
  sortKey, 
  ascending 
}: {
  data: EarningsData[];
  title: string;
  onSort: (key: keyof EarningsData) => void;
  sortKey: keyof EarningsData;
  ascending: boolean;
}) {
  const renderSortIcon = (key: keyof EarningsData) => {
    if (key === sortKey) {
      return ascending ? <ChevronUp size={14} className="inline ml-1" /> : <ChevronDown size={14} className="inline ml-1" />;
    }
    return null;
  };

  const formatValue = (value: number | null, isPercent = false, isCurrency = false) => {
    if (value === null || value === undefined) return '-';
    
    if (isPercent) {
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    }
    
    if (isCurrency) {
      return `$${value.toFixed(2)}`;
    }
    
    return value.toFixed(2);
  };

  if (data.length === 0) {
    return (
      <div className="text-center p-4 text-gray-500">
        No {title.toLowerCase()} earnings found for today
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left py-2 px-1 font-medium text-gray-700 w-12">Logo</th>
            <th onClick={() => onSort('ticker')} className="text-left py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-16">
              Ticker {renderSortIcon('ticker')}
            </th>
            <th onClick={() => onSort('companyName')} className="text-left py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-32">
              Company Name {renderSortIcon('companyName')}
            </th>
            <th onClick={() => onSort('time')} className="text-left py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-24">
              Report Time {renderSortIcon('time')}
            </th>
            <th onClick={() => onSort('marketCap')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-20">
              Market Cap {renderSortIcon('marketCap')}
            </th>
            <th onClick={() => onSort('epsEstimate')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-16">
              EPS Est {renderSortIcon('epsEstimate')}
            </th>
            <th onClick={() => onSort('epsActual')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-16">
              EPS Rep {renderSortIcon('epsActual')}
            </th>
            <th onClick={() => onSort('revenueEstimate')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-16">
              Rev Est {renderSortIcon('revenueEstimate')}
            </th>
            <th onClick={() => onSort('revenueActual')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-16">
              Rev Rep {renderSortIcon('revenueActual')}
            </th>
            <th onClick={() => onSort('percentChange')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-20">
              % Change {renderSortIcon('percentChange')}
            </th>
            <th onClick={() => onSort('marketCapDiff')} className="text-right py-2 px-1 font-medium text-gray-700 sortable cursor-pointer hover:bg-gray-100 w-24">
              Market Cap Diff {renderSortIcon('marketCapDiff')}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((earning, index) => (
            <tr key={`${earning.ticker}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-1">
                <div className="flex justify-center">
                  <CompanyLogo ticker={earning.ticker} size={28} />
                </div>
              </td>
              <td className="py-2 px-1"><strong>{earning.ticker}</strong></td>
              <td className="py-2 px-1 text-gray-700 truncate">{getCompanyName(earning.ticker)}</td>
              <td className="py-2 px-1 text-gray-700 text-xs">
                {earning.time === 'bmo' ? 'Before market' : 'After market'}
              </td>
              <td className="py-2 px-1 text-right">{earning.marketCap !== null ? formatBillions(earning.marketCap) : '-'}</td>
              <td className="py-2 px-1 text-right">{formatValue(earning.epsEstimate, false, true)}</td>
              <td className={`py-2 px-1 text-right font-medium ${earning.epsActual !== null && earning.epsEstimate !== null ? (earning.epsActual >= earning.epsEstimate ? 'positive' : 'negative') : ''}`}>
                {formatValue(earning.epsActual, false, true)}
              </td>
              <td className="py-2 px-1 text-right">{formatValue(earning.revenueEstimate ? earning.revenueEstimate / 1000000 : null)}</td>
              <td className={`py-2 px-1 text-right font-medium ${earning.revenueActual !== null && earning.revenueEstimate !== null ? (earning.revenueActual >= earning.revenueEstimate ? 'positive' : 'negative') : ''}`}>
                {formatValue(earning.revenueActual ? earning.revenueActual / 1000000 : null)}
              </td>
              <td className={`py-2 px-1 text-right font-medium ${earning.percentChange !== null && earning.percentChange >= 0 ? 'positive' : earning.percentChange !== null && earning.percentChange < 0 ? 'negative' : ''}`}>
                {earning.percentChange !== null ? (earning.percentChange >= 0 ? '+' : '') + earning.percentChange.toFixed(2) + '%' : '-'}
              </td>
              <td className={`py-2 px-1 text-right font-medium ${earning.marketCapDiff !== null && earning.marketCapDiff >= 0 ? 'positive' : earning.marketCapDiff !== null && earning.marketCapDiff < 0 ? 'negative' : ''}`}>
                {earning.marketCapDiff !== null ? (earning.marketCapDiff >= 0 ? '+' : '') + earning.marketCapDiff.toFixed(2) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Loading component for earnings
const EarningsLoader = () => (
  <section className="todays-earnings bg-white p-4 rounded-lg shadow-sm border border-gray-200" aria-labelledby="earnings-heading">
    <h2 id="earnings-heading" className="text-xl font-bold mb-4 flex items-center">
      <span className="mr-2">📊</span>
      Today's Earnings
    </h2>
    <div className="flex items-center justify-center p-8">
      <Loader2 className="animate-spin h-6 w-6 mr-3 text-blue-600" />
      <span className="text-gray-600">Loading today's earnings...</span>
    </div>
  </section>
);

// Error component for earnings
const EarningsError = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <section className="todays-earnings bg-white p-4 rounded-lg shadow-sm border border-gray-200" aria-labelledby="earnings-heading">
    <h2 id="earnings-heading" className="text-xl font-bold mb-4 flex items-center">
      <span className="mr-2">📊</span>
      Today's Earnings
    </h2>
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
  <section className="todays-earnings bg-white p-4 rounded-lg shadow-sm border border-gray-200" aria-labelledby="earnings-heading">
    <h2 id="earnings-heading" className="text-xl font-bold mb-4 flex items-center">
      <span className="mr-2">📊</span>
      Today's Earnings
    </h2>
    <div className="text-center p-8 text-gray-500">
      <p>No earnings reports scheduled for today from tracked companies</p>
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
      const now = new Date();
      // Get current date in Eastern Time
      const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const dateString = easternTime.toISOString().split('T')[0];
      console.log('🔍 Setting earnings date to:', dateString);
      setCurrentDate(dateString);
    };
    
    updateDate();
    
    // Set up midnight refresh (Eastern Time)
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const tomorrowEastern = new Date(easternTime);
    tomorrowEastern.setDate(tomorrowEastern.getDate() + 1);
    tomorrowEastern.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrowEastern.getTime() - easternTime.getTime();
    
    const midnightTimeout = setTimeout(() => {
      console.log('🔄 Midnight refresh - checking for new earnings data');
      updateDate();
    }, timeUntilMidnight);
    
    return () => clearTimeout(midnightTimeout);
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

  const totalEarnings = data.data.preMarket.length + data.data.afterMarket.length;
  const sortedPreMarket = sortData(data.data.preMarket);
  const sortedAfterMarket = sortData(data.data.afterMarket);
  
  return (
    <section className="todays-earnings bg-white p-4 rounded-lg shadow-sm border border-gray-200" aria-labelledby="earnings-heading">
      <h2 id="earnings-heading" data-icon="📊">
        Today's Earnings ({totalEarnings})
      </h2>
      
      <div className="space-y-6">
        {/* Pre-Market Earnings */}
        {sortedPreMarket.length > 0 && (
          <div className="earnings-section">
            <VirtualizedTable 
              data={sortedPreMarket}
              title="Pre-Market"
              onSort={handleSort}
              sortKey={sortKey}
              ascending={ascending}
            />
          </div>
        )}

        {/* After-Market Earnings */}
        {sortedAfterMarket.length > 0 && (
          <div className="earnings-section">
            <VirtualizedTable 
              data={sortedAfterMarket}
              title="After-Market"
              onSort={handleSort}
              sortKey={sortKey}
              ascending={ascending}
            />
          </div>
        )}
      </div>
    </section>
  );
} 
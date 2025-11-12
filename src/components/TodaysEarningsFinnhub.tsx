'use client';

import React, { useState, useEffect } from 'react';
import { formatBillions } from '@/lib/format';
import { getCompanyName } from '@/lib/companyNames';
import { SectionIcon } from './SectionIcon';
import { StockData } from '@/lib/types';

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
      setError(err instanceof Error ? err.message : 'Failed to fetch earnings data');
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

// Loading component for earnings
const EarningsLoader = () => (
  <section className="todays-earnings">
    <div className="section-header">
      <div className="header-main">
        <h2>
          <SectionIcon type="calendar" size={20} className="section-icon" />
          <span>Today's Earnings</span>
        </h2>
      </div>
    </div>
    <div className="flex items-center justify-center p-8">
      <span className="text-gray-600">Loading today's earnings...</span>
    </div>
  </section>
);

// Error component for earnings
const EarningsError = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <section className="todays-earnings">
    <div className="section-header">
      <div className="header-main">
        <h2>
          <SectionIcon type="calendar" size={20} className="section-icon" />
          <span>Today's Earnings</span>
        </h2>
      </div>
    </div>
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
    <div className="section-header">
      <div className="header-main">
        <h2>
          <SectionIcon type="calendar" size={20} className="section-icon" />
          <span>Today's Earnings</span>
        </h2>
      </div>
    </div>
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

  const sortedPreMarket = sortData(data.data.preMarket);
  const sortedAfterMarket = sortData(data.data.afterMarket);
  
  // Combine pre-market and after-market into one table
  const allEarnings = [...sortedPreMarket, ...sortedAfterMarket];
  
  return (
    <section className="todays-earnings">
      <div className="section-header">
        <div className="header-main">
          <h2>
            <SectionIcon type="calendar" size={20} className="section-icon" />
            <span>Today's Earnings</span>
          </h2>
        </div>
      </div>
      
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
                
                return (
                  <tr key={`${earning.ticker}-${index}`}>
                    <td>
                      <div className="logo-container">
                        <span style={{ fontSize: '1.5rem' }}>{earning.ticker}</span>
                      </div>
                    </td>
                    <td><strong>{earning.ticker}</strong></td>
                    <td className="company-name">{getCompanyName(earning.ticker)}</td>
                    <td>{earning.marketCap !== null ? formatBillions(earning.marketCap) : '-'}</td>
                    <td className="grouped-cell">
                      <div className="cell-value">{formatValue(earning.epsEstimate, false, true)}</div>
                      <div className={`cell-value ${earning.epsActual !== null && earning.epsEstimate !== null ? (earning.epsActual >= earning.epsEstimate ? 'positive' : 'negative') : ''}`}>
                        {formatValue(earning.epsActual, false, true)}
                      </div>
                    </td>
                    <td className="grouped-cell">
                      <div className="cell-value">{formatValue(earning.revenueEstimate ? earning.revenueEstimate / 1000000 : null)}</div>
                      <div className={`cell-value ${earning.revenueActual !== null && earning.revenueEstimate !== null ? (earning.revenueActual >= earning.revenueEstimate ? 'positive' : 'negative') : ''}`}>
                        {formatValue(earning.revenueActual ? earning.revenueActual / 1000000 : null)}
                      </div>
                    </td>
                    <td className={earning.percentChange !== null && earning.percentChange >= 0 ? 'positive' : earning.percentChange !== null && earning.percentChange < 0 ? 'negative' : ''}>
                      {earning.percentChange !== null ? (earning.percentChange >= 0 ? '+' : '') + earning.percentChange.toFixed(2) + '%' : '-'}
                    </td>
                    <td className={earning.marketCapDiff !== null && earning.marketCapDiff >= 0 ? 'positive' : earning.marketCapDiff !== null && earning.marketCapDiff < 0 ? 'negative' : ''}>
                      {earning.marketCapDiff !== null ? (earning.marketCapDiff >= 0 ? '+' : '') + earning.marketCapDiff.toFixed(2) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center p-8 text-gray-500">
          <p>No earnings reports scheduled for today from tracked companies</p>
        </div>
      )}
    </section>
  );
} 
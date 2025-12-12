'use client';

import { useState, useEffect } from 'react';

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
  time: string; // "before" or "after"
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

export default function EarningsCalendar() {
  const [earnings, setEarnings] = useState<EarningsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    // Set current date only on client-side to avoid hydration mismatch
    const dateStr = new Date().toISOString().split('T')[0];
    setCurrentDate(dateStr || '');
  }, []);

  useEffect(() => {
    if (currentDate) {
      fetchEarnings();
    }
  }, [currentDate]);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!currentDate) {
        console.log('⚠️ No date set, skipping earnings fetch');
        setLoading(false);
        return;
      }
      
      console.log('🔍 Fetching earnings for date:', currentDate);
      console.log('🔍 API URL:', `/api/earnings-calendar?date=${currentDate}`);
      
      // 🚀 OPTIMIZATION: Use new database-backed API endpoint
      const response = await fetch(`/api/earnings/today?date=${currentDate}`, {
        signal: AbortSignal.timeout(5000) // Increased timeout for better reliability
      });
      
      console.log('🔍 Earnings API response status:', response.status);
      console.log('🔍 Earnings API response headers:', response.headers);
      
      if (!response.ok) {
        console.error('❌ Earnings API error:', response.status, response.statusText);
        
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error('API key invalid or expired');
        }
        if (response.status === 429) {
          throw new Error('API rate limit exceeded');
        }
        if (response.status === 408) {
          throw new Error('Request timeout - API took too long to respond');
        }
        if (response.status === 503) {
          throw new Error('API service temporarily unavailable');
        }
        if (response.status === 404) {
          throw new Error('Earnings API endpoint not found - please check server configuration');
        }
        
        // Try to get error details from response
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        } catch {
          throw new Error(`Failed to fetch earnings data (${response.status})`);
        }
      }
      
      const data: EarningsResponse = await response.json();
      console.log('🔍 Earnings API response data:', data);
      
      // Validate response structure
      if (!data || !data.success || !data.data) {
        throw new Error('Invalid response format from API');
      }
      
      // Combine pre-market and after-market earnings
      const allEarnings = [...data.data.preMarket, ...data.data.afterMarket];
      setEarnings(allEarnings);
      
    } catch (err) {
      console.error('❌ Earnings fetch error:', err);
      // Handle specific error types
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timeout - earnings data took too long to load');
        } else if (err.message.includes('fetch')) {
          setError('Network error - unable to connect to earnings service');
        } else {
          setError(err.message);
        }
      } else {
        setError('Unknown error occurred while loading earnings data');
      }
      setEarnings([]);
    } finally {
      setLoading(false);
    }
  };

  const formatMarketCap = (marketCap: number): string => {
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(1)}M`;
    return `$${marketCap.toLocaleString()}`;
  };

  const getReportTimeColor = (time: string): string => {
    switch (time) {
      case 'before': return 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30';
      case 'after': return 'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-50 dark:text-gray-300 dark:bg-gray-700/30';
    }
  };

  const getReportTimeLabel = (time: string): string => {
    switch (time) {
      case 'before': return 'Before Market';
      case 'after': return 'After Market';
      default: return time;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title dark:text-gray-100" data-icon="📅">Today&apos;s Earnings</h2>
        </div>
        <div>
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title dark:text-gray-100" data-icon="📅">Today&apos;s Earnings</h2>
        </div>
      </div>
    );
  }

  if (earnings.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title dark:text-gray-100" data-icon="📅">Today&apos;s Earnings</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
      <div className="flex items-center mb-4">
        <h2 className="section-title dark:text-gray-100" data-icon="📅">Today's Earnings</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Company</th>
              <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Period</th>
              <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Time</th>
              <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">Market Cap</th>
              <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">EPS Est.</th>
              <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">Revenue Est.</th>
            </tr>
          </thead>
          <tbody>
            {earnings.map((earning, index) => (
              <tr key={earning.ticker} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <td className="py-2">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{earning.ticker}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">
                      {earning.companyName}
                    </div>
                  </div>
                </td>
                <td className="py-2 text-gray-700 dark:text-gray-300">Q4 2024</td>
                <td className="py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getReportTimeColor(earning.time)}`}>
                    {getReportTimeLabel(earning.time)}
                  </span>
                </td>
                <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                  {earning.marketCap ? formatMarketCap(earning.marketCap) : '-'}
                </td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                  {earning.epsEstimate ? `$${earning.epsEstimate.toFixed(2)}` : '-'}
                </td>
                <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                  {earning.revenueEstimate ? formatMarketCap(earning.revenueEstimate) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        Top {earnings.length} earnings by market cap • Updates daily at market open
      </div>
    </div>
  );
} 
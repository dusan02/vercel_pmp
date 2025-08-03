'use client';

import { useState, useEffect } from 'react';

interface EarningsData {
  ticker: string;
  company_name: string;
  market_cap: number;
  fiscal_period: string;
  report_time: 'BMO' | 'AMC' | 'DMT';
  estimate_eps: number | null;
  estimate_revenue: number | null;
  actual_eps: number | null;
  actual_revenue: number | null;
  report_date: string;
}

interface EarningsResponse {
  earnings: EarningsData[];
  date: string;
  count: number;
  message: string;
}

export default function EarningsCalendar() {
  const [earnings, setEarnings] = useState<EarningsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    // Set current date only on client-side to avoid hydration mismatch
    setCurrentDate(new Date().toISOString().split('T')[0]);
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
      
      // 🚀 OPTIMIZATION: Reduced timeout for faster failure detection
      const response = await fetch(`/api/earnings-calendar?date=${currentDate}`, {
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
      if (!data || !Array.isArray(data.earnings)) {
        throw new Error('Invalid response format from API');
      }
      
      setEarnings(data.earnings);
      
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

  const getReportTimeColor = (reportTime: string): string => {
    switch (reportTime) {
      case 'BMO': return 'text-blue-600 bg-blue-50';
      case 'AMC': return 'text-red-600 bg-red-50';
      case 'DMT': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getReportTimeLabel = (reportTime: string): string => {
    switch (reportTime) {
      case 'BMO': return 'Before Market';
      case 'AMC': return 'After Market';
      case 'DMT': return 'During Market';
      default: return reportTime;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title" data-icon="📅">Today's Earnings</h2>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title" data-icon="📅">Today's Earnings</h2>
        </div>
      </div>
    );
  }

  if (earnings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center mb-4">
          <h2 className="section-title" data-icon="📅">Today's Earnings</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-center mb-4">
        <h2 className="section-title" data-icon="📅">Today's Earnings</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 font-medium text-gray-700">Company</th>
              <th className="text-left py-2 font-medium text-gray-700">Period</th>
              <th className="text-left py-2 font-medium text-gray-700">Time</th>
              <th className="text-right py-2 font-medium text-gray-700">Market Cap</th>
              <th className="text-right py-2 font-medium text-gray-700">EPS Est.</th>
              <th className="text-right py-2 font-medium text-gray-700">Revenue Est.</th>
            </tr>
          </thead>
          <tbody>
            {earnings.map((earning, index) => (
              <tr key={earning.ticker} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2">
                  <div>
                    <div className="font-medium text-gray-900">{earning.ticker}</div>
                    <div className="text-xs text-gray-500 truncate max-w-32">
                      {earning.company_name}
                    </div>
                  </div>
                </td>
                <td className="py-2 text-gray-700">{earning.fiscal_period}</td>
                <td className="py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getReportTimeColor(earning.report_time)}`}>
                    {getReportTimeLabel(earning.report_time)}
                  </span>
                </td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {formatMarketCap(earning.market_cap)}
                </td>
                <td className="py-2 text-right text-gray-700">
                  {earning.estimate_eps ? `$${earning.estimate_eps.toFixed(2)}` : '-'}
                </td>
                <td className="py-2 text-right text-gray-700">
                  {earning.estimate_revenue ? formatMarketCap(earning.estimate_revenue) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-3 text-xs text-gray-500 text-center">
        Top {earnings.length} earnings by market cap • Updates daily at market open
      </div>
    </div>
  );
} 
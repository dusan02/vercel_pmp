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
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchEarnings();
  }, [currentDate]);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/earnings-calendar?date=${currentDate}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch earnings data');
      }
      
      const data: EarningsResponse = await response.json();
      setEarnings(data.earnings);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📅 Today's Earnings</h2>
          <div className="text-sm text-gray-500">{currentDate}</div>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📅 Today's Earnings</h2>
          <div className="text-sm text-gray-500">{currentDate}</div>
        </div>
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">❌ Error loading earnings data</div>
          <div className="text-sm text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  if (earnings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📅 Today's Earnings</h2>
          <div className="text-sm text-gray-500">{currentDate}</div>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-500 mb-2">📅 No earnings scheduled for today</div>
          <div className="text-sm text-gray-400">Check back tomorrow for upcoming earnings</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">📅 Today's Earnings</h2>
        <div className="text-sm text-gray-500">{currentDate}</div>
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
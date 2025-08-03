'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import { formatBillions } from '@/lib/format';
import CompanyLogo from '@/components/CompanyLogo';
import { useFavorites } from '@/hooks/useFavorites';

interface EarningsData {
  ticker: string;
  company_name: string;
  market_cap: number;
  fiscal_period: string;
  report_date: string;
  report_time: 'BMO' | 'AMC' | 'DMT';
  estimate_eps?: number;
  estimate_revenue?: number;
  actual_eps?: number;
  actual_revenue?: number;
  percent_change?: number;
  market_cap_diff?: number;
}

interface EarningsResponse {
  earnings: EarningsData[];
  date: string;
  count: number;
  message: string;
}

export default function TodaysEarnings() {
  const [earnings, setEarnings] = useState<EarningsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState('');
  const [isWeekend, setIsWeekend] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  // Use cookie-based favorites
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  // Check if it's weekend or holiday
  const checkWeekend = () => {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
    return dayOfWeek === 0 || dayOfWeek === 6;
  };

  // Check if it's a US market holiday (basic implementation)
  const checkHoliday = () => {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const month = easternTime.getMonth();
    const date = easternTime.getDate();
    
    // Major US holidays when markets are closed
    const holidays = [
      { month: 0, date: 1 },   // New Year's Day
      { month: 0, date: 15 },  // Martin Luther King Jr. Day (3rd Monday)
      { month: 1, date: 19 },  // Presidents' Day (3rd Monday)
      { month: 3, date: 15 },  // Good Friday (approximate)
      { month: 4, date: 27 },  // Memorial Day (last Monday)
      { month: 6, date: 4 },   // Independence Day
      { month: 8, date: 2 },   // Labor Day (1st Monday)
      { month: 10, date: 28 }, // Thanksgiving (4th Thursday)
      { month: 11, date: 25 }, // Christmas Day
    ];
    
    return holidays.some(holiday => holiday.month === month && holiday.date === date);
  };

  useEffect(() => {
    // Check if it's weekend or holiday
    const weekendCheck = checkWeekend();
    const holidayCheck = checkHoliday();
    const isMarketClosed = weekendCheck || holidayCheck;
    
    setIsWeekend(isMarketClosed);
    setShouldShow(!isMarketClosed);
    
    // If market is closed, don't show earnings
    if (isMarketClosed) {
      setLoading(false);
      return;
    }
    
    // Set current date only on client-side to avoid hydration mismatch
    const updateDate = () => {
      const now = new Date();
      const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      setCurrentDate(easternTime.toISOString().split('T')[0]);
    };
    
    // Set initial date
    updateDate();
    
    // Set up midnight refresh (Eastern Time)
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const tomorrowEastern = new Date(easternTime);
    tomorrowEastern.setDate(tomorrowEastern.getDate() + 1);
    tomorrowEastern.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrowEastern.getTime() - easternTime.getTime();
    
    // Schedule refresh at midnight
    const midnightTimeout = setTimeout(() => {
      console.log('🔄 Midnight refresh - checking for new earnings data');
      updateDate();
      // Then refresh every 24 hours
      const dailyInterval = setInterval(() => {
        console.log('🔄 Daily refresh - checking for new earnings data');
        updateDate();
      }, 24 * 60 * 60 * 1000);
      return () => clearInterval(dailyInterval);
    }, timeUntilMidnight);
    
    return () => {
      clearTimeout(midnightTimeout);
    };
  }, []);

  useEffect(() => {
    if (currentDate && shouldShow) {
      fetchEarnings();
    }
  }, [currentDate, shouldShow]);

  // 🚀 TOP PRIORITY: Update earnings data every minute (only on weekdays)
  useEffect(() => {
    // Don't update if market is closed
    if (!shouldShow) {
      return;
    }

    // Initial fetch
    if (currentDate) {
      fetchEarnings();
    }

    // Set up minute interval for real-time updates
    const minuteInterval = setInterval(() => {
      if (currentDate && shouldShow) {
        console.log('🔄 Auto-refreshing earnings data (every minute)');
        fetchEarnings(false); // Don't show loading for auto-refresh
      }
    }, 60000); // 60 seconds = 1 minute

    return () => {
      clearInterval(minuteInterval);
    };
  }, [currentDate, shouldShow]);

  const fetchEarnings = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      
      if (!currentDate) {
        console.log('⚠️ No date set, skipping earnings fetch');
        if (showLoading) {
          setLoading(false);
        }
        return;
      }
      
      console.log('🔍 Fetching earnings for date:', currentDate);
      
      const response = await fetch(`/api/earnings-calendar?date=${currentDate}`, {
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: EarningsResponse = await response.json();
      
      if (data.earnings && Array.isArray(data.earnings)) {
        setEarnings(data.earnings);
        console.log(`✅ Loaded ${data.earnings.length} earnings for ${currentDate} (filtered to tracked tickers)`);
      } else {
        setEarnings([]);
        console.log('📅 No earnings data available for tracked tickers');
      }
      
    } catch (err) {
      console.error('❌ Error fetching earnings:', err);
      setError('Failed to load earnings data');
      setEarnings([]);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Separate earnings by report time
  const preMarketEarnings = earnings.filter(earning => earning.report_time === 'BMO');
  const afterMarketEarnings = earnings.filter(earning => earning.report_time === 'AMC');

  // Sort each section by market cap
  const { sorted: preMarketSorted, sortKey: preMarketSortKey, ascending: preMarketAscending, requestSort: requestPreMarketSort } = 
    useSortableData(preMarketEarnings, "marketCap", false);
  const { sorted: afterMarketSorted, sortKey: afterMarketSortKey, ascending: afterMarketAscending, requestSort: requestAfterMarketSort } = 
    useSortableData(afterMarketEarnings, "marketCap", false);

  const renderSortIcon = (key: SortKey, currentSortKey: SortKey, ascending: boolean) => {
    if (key === currentSortKey) {
      return ascending ? <ChevronUp size={14} className="inline ml-1" /> : <ChevronDown size={14} className="inline ml-1" />;
    }
    return null;
  };

  // Don't render anything if market is closed (weekend/holiday)
  if (!shouldShow) {
    return null;
  }

  const renderEarningsTable = (earningsData: EarningsData[], title: string, requestSort: (key: SortKey) => void, sortKey: SortKey, ascending: boolean) => {
    if (earningsData.length === 0) {
      return (
        <div className="no-earnings">
          <p>No {title.toLowerCase()} earnings scheduled for today</p>
        </div>
      );
    }

    return (
             <table aria-describedby={`${title.toLowerCase()}-earnings-description`}>
        <thead>
          <tr>
            <th>Logo</th>
            <th onClick={() => requestSort("ticker" as SortKey)} className="sortable">
              Ticker
              {renderSortIcon("ticker", sortKey, ascending)}
            </th>
                         <th>Company Name</th>
             <th onClick={() => requestSort("marketCap" as SortKey)} className="sortable">
               Market Cap&nbsp;(B)
               {renderSortIcon("marketCap", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("estimate_eps" as SortKey)} className="sortable">
               Est. EPS
               {renderSortIcon("estimate_eps", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("actual_eps" as SortKey)} className="sortable">
               Actual EPS
               {renderSortIcon("actual_eps", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("estimate_revenue" as SortKey)} className="sortable">
               Est. Revenue
               {renderSortIcon("estimate_revenue", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("actual_revenue" as SortKey)} className="sortable">
               Actual Revenue
               {renderSortIcon("actual_revenue", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("percent_change" as SortKey)} className="sortable">
               % Change
               {renderSortIcon("percent_change", sortKey, ascending)}
             </th>
             <th onClick={() => requestSort("market_cap_diff" as SortKey)} className="sortable">
               Market Cap Diff
               {renderSortIcon("market_cap_diff", sortKey, ascending)}
             </th>
          </tr>
        </thead>
        <tbody>
          {earningsData.map((earning) => (
            <tr key={earning.ticker}>
              <td>
                <div className="logo-container">
                  <CompanyLogo ticker={earning.ticker} size={32} />
                </div>
              </td>
                             <td><strong>{earning.ticker}</strong></td>
               <td className="company-name">{earning.company_name}</td>
               <td>{formatBillions(earning.market_cap / 1000000000)}</td>
               <td>{earning.estimate_eps ? earning.estimate_eps.toFixed(2) : 'N/A'}</td>
               <td className={earning.actual_eps && earning.estimate_eps ? 
                 (earning.actual_eps >= earning.estimate_eps ? 'positive' : 'negative') : ''}>
                 {earning.actual_eps ? earning.actual_eps.toFixed(2) : 'N/A'}
               </td>
               <td>{earning.estimate_revenue ? (earning.estimate_revenue / 1000000000).toFixed(1) : 'N/A'}</td>
               <td className={earning.actual_revenue && earning.estimate_revenue ? 
                 (earning.actual_revenue >= earning.estimate_revenue ? 'positive' : 'negative') : ''}>
                 {earning.actual_revenue ? (earning.actual_revenue / 1000000000).toFixed(1) : 'N/A'}
               </td>
               <td className={earning.percent_change ? (earning.percent_change >= 0 ? 'positive' : 'negative') : ''}>
                 {earning.percent_change ? `${earning.percent_change > 0 ? '+' : ''}${earning.percent_change.toFixed(2)}%` : 'N/A'}
               </td>
               <td className={earning.market_cap_diff ? (earning.market_cap_diff >= 0 ? 'positive' : 'negative') : ''}>
                 {earning.market_cap_diff ? `${earning.market_cap_diff > 0 ? '+' : ''}${formatBillions(earning.market_cap_diff / 1000000000)}` : 'N/A'}
               </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  if (loading) {
    return (
      <section className="todays-earnings" aria-labelledby="earnings-heading">
        <h2 id="earnings-heading" data-icon="📊">Today's Earnings</h2>
        <div className="loading-indicator">
          <div className="animate-spin">⏳</div>
          <span>Loading today's earnings...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="todays-earnings" aria-labelledby="earnings-heading">
        <h2 id="earnings-heading" data-icon="📊">Today's Earnings</h2>
        <div className="error">
          <p>{error}</p>
        </div>
      </section>
    );
  }

  const totalEarnings = preMarketEarnings.length + afterMarketEarnings.length;

  if (totalEarnings === 0) {
    return (
      <section className="todays-earnings" aria-labelledby="earnings-heading">
        <h2 id="earnings-heading" data-icon="📊">Today's Earnings</h2>
        <div className="no-earnings">
          <p>No earnings reports scheduled for today from tracked companies</p>
        </div>
      </section>
    );
  }

  return (
    <section className="todays-earnings" aria-labelledby="earnings-heading">
      <h2 id="earnings-heading" data-icon="📊">Today's Earnings</h2>
      
      {/* Pre-Market Earnings */}
      {preMarketEarnings.length > 0 && (
        <div className="earnings-section">
          <h3 className="section-subtitle" data-icon="🌅">Pre-Market Earnings ({preMarketEarnings.length})</h3>
          {renderEarningsTable(preMarketSorted, "Pre-Market", requestPreMarketSort, preMarketSortKey, preMarketAscending)}
        </div>
      )}

      {/* After-Market Earnings */}
      {afterMarketEarnings.length > 0 && (
        <div className="earnings-section">
          <h3 className="section-subtitle" data-icon="🌙">After-Market Earnings ({afterMarketEarnings.length})</h3>
          {renderEarningsTable(afterMarketSorted, "After-Market", requestAfterMarketSort, afterMarketSortKey, afterMarketAscending)}
        </div>
      )}
    </section>
  );
} 
import { NextRequest, NextResponse } from 'next/server';

interface EarningsData {
  ticker: string;
  company_name: string;
  market_cap: number;
  fiscal_period: string;
  report_date: string;
  report_time: 'BMO' | 'AMC' | 'DMT';
  estimate?: {
    revenue?: number;
    eps?: number;
  };
  actual?: {
    revenue?: number;
    eps?: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Earnings calendar API called');
    
    const { searchParams } = new URL(request.url);
    let date = searchParams.get('date');
    
    console.log('🔍 Date parameter:', date);
    
    // Validate and format date
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    } else {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return NextResponse.json({ 
          error: 'Invalid date format. Use YYYY-MM-DD',
          date: date
        }, { status: 400 });
      }
    }
    
    const apiKey = process.env.POLYGON_API_KEY || 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    
    // Get earnings calendar for the specified date
    const url = `https://api.polygon.io/v2/reference/calendar/earnings?apiKey=${apiKey}&date=${date}`;
    
    console.log('🔍 Fetching earnings calendar for:', date);
    console.log('🔍 API URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      console.error('❌ Earnings API error:', response.status, response.statusText);
      
      // Handle specific error cases
      if (response.status === 401) {
        return NextResponse.json({ 
          error: 'API key invalid or expired',
          status: response.status 
        }, { status: 401 });
      }
      
      if (response.status === 429) {
        return NextResponse.json({ 
          error: 'API rate limit exceeded',
          status: response.status 
        }, { status: 429 });
      }
      
      if (response.status === 404) {
        console.log('📅 No earnings data available for this date, returning empty array');
        return NextResponse.json({
          earnings: [],
          date,
          message: 'No earnings scheduled for this date',
          count: 0
        });
      }
      
      return NextResponse.json({ 
        error: 'Failed to fetch earnings data',
        status: response.status,
        message: response.statusText
      }, { status: response.status });
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      console.log('📅 No earnings data for:', date);
      return NextResponse.json({
        earnings: [],
        date,
        message: 'No earnings scheduled for this date',
        count: 0
      });
    }
    
    // Filter and sort by market cap (top 10)
    const topEarnings = data.results
      .filter((earnings: EarningsData) => earnings.market_cap > 0)
      .sort((a: EarningsData, b: EarningsData) => b.market_cap - a.market_cap)
      .slice(0, 10)
      .map((earnings: EarningsData) => ({
        ticker: earnings.ticker,
        company_name: earnings.company_name,
        market_cap: earnings.market_cap,
        fiscal_period: earnings.fiscal_period,
        report_time: earnings.report_time,
        estimate_eps: earnings.estimate?.eps || null,
        estimate_revenue: earnings.estimate?.revenue || null,
        actual_eps: earnings.actual?.eps || null,
        actual_revenue: earnings.actual?.revenue || null,
        report_date: earnings.report_date
      }));
    
    console.log(`✅ Found ${topEarnings.length} earnings for ${date}`);
    
    return NextResponse.json({
      earnings: topEarnings,
      date,
      count: topEarnings.length,
      message: `Top ${topEarnings.length} earnings by market cap`
    });
    
  } catch (error) {
    console.error('❌ Earnings calendar error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout - API took too long to respond' },
          { status: 408 }
        );
      }
      
      if (error.message.includes('fetch')) {
        return NextResponse.json(
          { error: 'Network error - unable to connect to API' },
          { status: 503 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 
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
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    
    const apiKey = 'Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX';
    
    // Get earnings calendar for the specified date
    const url = `https://api.polygon.io/v2/reference/calendar/earnings?apiKey=${apiKey}&date=${date}`;
    
    console.log('🔍 Fetching earnings calendar for:', date);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('❌ Earnings API error:', response.status, response.statusText);
      return NextResponse.json({ 
        error: 'Failed to fetch earnings data',
        status: response.status 
      }, { status: 500 });
    }
    
    const data = await response.json();
    
    if (!data.results) {
      console.log('📅 No earnings data for:', date);
      return NextResponse.json({
        earnings: [],
        date,
        message: 'No earnings scheduled for this date'
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
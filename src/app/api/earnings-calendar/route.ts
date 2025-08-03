import { NextRequest, NextResponse } from 'next/server';

// Import tickers directly to avoid import issues
const DEFAULT_TICKERS = {
  pmp: [
    // Premium tier (50) - 1 min updates
    'NVDA', 'MSFT', 'AAPL', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AVGO', 'BRK.B', 'TSLA', 'TSM', 'JPM', 'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'TMUS', 'CSCO', 'PM', 'WFC', 'CRM', 'IBM', 'MS', 'ABT', 'GS', 'MCD', 'INTU', 'UNH', 'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'PEP', 'NOW',
    
    // Standard tier (100) - 3 min updates
    'UBER', 'VZ', 'TMO', 'BKNG', 'SCHW', 'ISRG', 'BLK', 'C', 'BA', 'SPGI', 'TXN', 'AMGN', 'QCOM', 'BSX', 'ANET', 'ADBE', 'NEE', 'SYK', 'AMAT', 'PGR', 'GILD', 'DHR', 'TJX', 'HON', 'DE', 'PFE', 'BX', 'COF', 'UNP', 'APH', 'KKR', 'LOW', 'LRCX', 'ADP', 'CMCSA', 'VRTX', 'KLAC', 'COP', 'MU', 'PANW', 'SNPS', 'CRWD', 'WELL', 'NKE', 'ADI', 'CEG', 'ICE', 'DASH', 'SO', 'MO', 'CME', 'AMT', 'SBUX', 'LMT', 'PLD', 'MMC', 'CDNS', 'DUK', 'WM', 'PH', 'BMY', 'MCK', 'DELL', 'HCA', 'SHW', 'RCL', 'INTC', 'NOC', 'ORLY', 'GD', 'MDLZ', 'COIN', 'EMR', 'ABNB', 'CVS', 'APO', 'MMM', 'EQIX', 'FTNT', 'HWM', 'ECL', 'WMB', 'ITW', 'FI', 'PNC', 'MSI', 'AJG', 'RSG', 'UPS', 'VST', 'BK', 'CI', 'MAR', 'GEV', 'APP', 'IBKR', 'MSTR', 'MCO', 'CTAS', 'TDG', 'HOOD', 'RBLX', 'SCCO', 'NET', 'BNS', 'BCS', 'NEM', 'USB', 'ING', 'SNOW', 'CL', 'EPD', 'ZTS', 'CSX', 'AZO',
    
    // Extended tier (150) - 5 min updates
    'MRVL', 'PYPL', 'CRH', 'DB', 'EOG', 'ADSK', 'AEM', 'APD', 'KMI', 'ELV', 'NSC', 'GBTC', 'HLT', 'ET', 'AEP', 'SPG', 'REGN', 'ARES', 'DLR', 'TEL', 'FIG', 'WDAY', 'PWR', 'ROP', 'TRV', 'NU', 'CNI', 'AXON', 'MNST', 'CMG', 'CARR', 'DEO', 'FCX', 'COR', 'TFC', 'URI', 'AMX', 'NDAQ', 'VRT', 'GLW', 'AFL', 'MPLX', 'NXPI', 'LNG', 'SRE', 'FLUT', 'ALL', 'ALNY', 'CPNG', 'FAST', 'LHX', 'MFC', 'E', 'D', 'FDX', 'O', 'MPC', 'PCAR', 'BDX', 'TRP', 'PAYX', 'CRWV', 'GM', 'MET', 'OKE', 'SLB', 'CMI', 'PSA', 'CTVA', 'PSX', 'WCN', 'TEAM', 'SU', 'GMBXF', 'AMP', 'CCEP', 'KR', 'DDOG', 'CCI', 'EW', 'VEEV', 'TAK', 'CBRE', 'XYZ', 'TGT', 'KDP', 'EXC', 'HLN', 'ROST', 'DHI', 'GWW', 'FERG', 'JD', 'PEG', 'AIG', 'CPRT', 'ALC', 'ZS', 'KMB', 'HMC', 'MSCI', 'IDXX', 'F', 'CVNA', 'BKR', 'OXY', 'FANG', 'IMO', 'XEL', 'EBAY', 'GRMN', 'AME', 'TTD', 'KBCSF', 'VALE', 'WPM', 'CRCL', 'KVUE', 'VLO', 'ARGX', 'FIS', 'RMD', 'TTWO', 'TCOM', 'CSGP', 'ETR', 'HEI', 'EA', 'CCL', 'ROK', 'HSY', 'SYY', 'VRSK', 'ED', 'MPWR', 'CAH', 'ABEV', 'B',
    
    // Extended+ tier (60) - 15 min updates
    'BABA', 'ASML', 'TM', 'AZN', 'NVS', 'LIN', 'NVO', 'HSBC', 'SHEL', 'HDB', 'RY', 'UL', 'SHOP', 'ETN', 'SONY', 'ARM', 'TTE', 'BHP', 'SPOT', 'SAN', 'TD', 'UBS', 'MDT', 'SNY', 'BUD', 'CB', 'TT', 'RIO', 'SMFG', 'BBVA', 'RELX', 'SE', 'TRI', 'PBR', 'NTES', 'BMO', 'RACE', 'AON', 'GSK', 'NWG', 'LYG', 'EQNR', 'CNQ', 'ITUB', 'ACN', 'MUFG', 'PDD', 'SAP', 'JCI', 'NGG', 'TCEHY', 'MELI', 'BAM', 'EXPGF', 'GLCNF', 'NPSNY', 'GMBXF'
  ]
};

function getDefaultTickers(project: string): string[] {
  return DEFAULT_TICKERS[project as keyof typeof DEFAULT_TICKERS] || DEFAULT_TICKERS.pmp;
}

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

interface PolygonEarningsData {
  ticker: string;
  company_name: string;
  market_cap: number;
  fiscal_period: string;
  report_date: string;
  report_time: 'BMO' | 'AMC' | 'DMT';
  estimate?: {
    eps?: number;
    revenue?: number;
  };
  actual?: {
    eps?: number;
    revenue?: number;
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
    
    // Get our default tickers to filter earnings
    const defaultTickers = DEFAULT_TICKERS.pmp;

    // Filter earnings to only include our tracked tickers and sort by market cap
    const filteredEarnings = data.results
      .filter((earnings: PolygonEarningsData) => 
        earnings.market_cap > 0 && 
        defaultTickers.includes(earnings.ticker)
      )
      .sort((a: PolygonEarningsData, b: PolygonEarningsData) => b.market_cap - a.market_cap)
      .map((earnings: PolygonEarningsData) => ({
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
    
    console.log(`✅ Found ${filteredEarnings.length} earnings for ${date}`);
    
    return NextResponse.json({
      earnings: filteredEarnings,
      date,
      count: filteredEarnings.length,
      message: `${filteredEarnings.length} earnings from tracked companies`
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
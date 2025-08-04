import { NextRequest, NextResponse } from 'next/server';

interface BenzingaEarningsResponse {
  status: string;
  request_id: string;
  next_url?: string;
  results: Array<{
    ticker?: string;
    company_name?: string;
    date?: string;
    time?: string;
    estimated_eps?: number;
    actual_eps?: number;
    eps_surprise_percent?: number;
    estimated_revenue?: number;
    actual_revenue?: number;
    revenue_surprise_percent?: number;
    fiscal_period?: string;
    fiscal_year?: number;
    importance?: number;
    date_status?: string;
    currency?: string;
    notes?: string;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'POLYGON_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Test parameters - dnes a zítra
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('🔍 Testing Benzinga Earnings API...');
    console.log('📅 Testing dates:', { today, tomorrow });
    
    // Test 1: Dnešné earnings
    const todayUrl = `https://api.polygon.io/benzinga/v1/earnings?date=${today}&limit=10&apiKey=${apiKey}`;
    console.log('🔗 Today URL:', todayUrl);
    
    const todayResponse = await fetch(todayUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    console.log('📊 Today response status:', todayResponse.status);
    console.log('📊 Today response headers:', Object.fromEntries(todayResponse.headers.entries()));
    
    if (!todayResponse.ok) {
      const errorText = await todayResponse.text();
      console.error('❌ Today API error:', errorText);
      
      return NextResponse.json({
        error: `API Error: ${todayResponse.status}`,
        details: errorText,
        url: todayUrl
      }, { status: todayResponse.status });
    }
    
    const todayData: BenzingaEarningsResponse = await todayResponse.json();
    console.log('✅ Today data received:', {
      status: todayData.status,
      request_id: todayData.request_id,
      results_count: todayData.results?.length || 0,
      first_result: todayData.results?.[0]
    });
    
    // Test 2: Zítřejší earnings
    const tomorrowUrl = `https://api.polygon.io/benzinga/v1/earnings?date=${tomorrow}&limit=5&apiKey=${apiKey}`;
    const tomorrowResponse = await fetch(tomorrowUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });
    
    let tomorrowData: BenzingaEarningsResponse | null = null;
    if (tomorrowResponse.ok) {
      tomorrowData = await tomorrowResponse.json();
    }
    
    // Test 3: Konkrétní ticker (AAPL)
    const aaplUrl = `https://api.polygon.io/benzinga/v1/earnings?ticker=AAPL&limit=3&apiKey=${apiKey}`;
    const aaplResponse = await fetch(aaplUrl, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000)
    });
    
    let aaplData: BenzingaEarningsResponse | null = null;
    if (aaplResponse.ok) {
      aaplData = await aaplResponse.json();
    }
    
    // Výsledky testu
    const testResults = {
      success: true,
      api_key_configured: !!apiKey,
      tests: {
        today: {
          status: todayResponse.status,
          success: todayResponse.ok,
          results_count: todayData.results?.length || 0,
          sample_data: todayData.results?.slice(0, 2) || [],
          url: todayUrl
        },
        tomorrow: {
          status: tomorrowResponse.status,
          success: tomorrowResponse.ok,
          results_count: tomorrowData?.results?.length || 0,
          sample_data: tomorrowData?.results?.slice(0, 2) || [],
          url: tomorrowUrl
        },
        aapl: {
          status: aaplResponse.status,
          success: aaplResponse.ok,
          results_count: aaplData?.results?.length || 0,
          sample_data: aaplData?.results?.slice(0, 2) || [],
          url: aaplUrl
        }
      },
      summary: {
        total_tests: 3,
        successful_tests: [
          todayResponse.ok && 'today',
          tomorrowResponse.ok && 'tomorrow', 
          aaplResponse.ok && 'aapl'
        ].filter(Boolean).length,
        api_working: todayResponse.ok || tomorrowResponse.ok || aaplResponse.ok
      }
    };
    
    console.log('✅ Test completed successfully:', testResults.summary);
    
    return NextResponse.json(testResults);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return NextResponse.json({
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }, { status: 500 });
  }
} 
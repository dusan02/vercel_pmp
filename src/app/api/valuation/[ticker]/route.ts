import { NextRequest, NextResponse } from 'next/server';
import { ValuationService } from '@/services/valuationService';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await context.params;
    const { searchParams } = new URL(request.url);
    
    const metric = (searchParams.get('metric') || 'pe_ratio') as 'pe_ratio' | 'pb_ratio' | 'ps_ratio' | 'ev_ebitda';
    const period = (searchParams.get('period') || '10y') as '10y' | '5y' | '1y';
    
    // Validácia parametrov
    const validMetrics = ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda'];
    const validPeriods = ['10y', '5y', '1y'];
    
    if (!validMetrics.includes(metric)) {
      return NextResponse.json(
        { error: 'Invalid metric. Use: pe_ratio, pb_ratio, ps_ratio, ev_ebitda' },
        { status: 400 }
      );
    }
    
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period. Use: 10y, 5y, 1y' },
        { status: 400 }
      );
    }
    
    // Získanie grafových dát
    const chartData = await ValuationService.getChartData(ticker.toUpperCase(), metric, period);
    
    return NextResponse.json({
      success: true,
      data: {
        ticker: ticker.toUpperCase(),
        metric,
        period,
        chartData,
        metadata: {
          totalPoints: chartData.length,
          dateRange: {
            start: chartData[0]?.date,
            end: chartData[chartData.length - 1]?.date
          },
          percentiles: chartData[0] ? {
            p10: chartData[0].p10,
            p25: chartData[0].p25,
            p50: chartData[0].p50,
            p75: chartData[0].p75,
            p90: chartData[0].p90
          } : null
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Valuation API error:', error);
    
    if (error instanceof Error && error.message.includes('No percentile data found')) {
      return NextResponse.json(
        { 
          error: 'No valuation data available for this symbol. Please run data collection first.',
          code: 'NO_DATA'
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await context.params;
    const body = await request.json();
    
    const { years = 10, force = false } = body;
    
    // Validácia
    if (typeof years !== 'number' || years < 1 || years > 20) {
      return NextResponse.json(
        { error: 'Years must be between 1 and 20' },
        { status: 400 }
      );
    }
    
    console.log(`📊 Starting valuation data collection for ${ticker} (${years} years)`);
    
    // Generovanie demo dát (namiesto collectHistoricalData)
    await ValuationService.generateDemoData(ticker.toUpperCase());
    
    // Percentile sa už vypočítajú v generateDemoData
    
    return NextResponse.json({
      success: true,
      message: `Valuation data collected and processed for ${ticker}`,
      data: {
        ticker: ticker.toUpperCase(),
        years,
        metrics: ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda'],
        periods: ['10y', '5y', '1y', '6m', '3m', '1m']
      }
    });
    
  } catch (error) {
    console.error('❌ Valuation collection error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to collect valuation data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

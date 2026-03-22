import { NextRequest, NextResponse } from 'next/server';
import { GuruFocusService, type GuruFocusMetrics } from '@/services/guruFocusService';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await context.params;
    const { searchParams } = new URL(request.url);
    
    const metric = (searchParams.get('metric') || 'peRatio') as keyof GuruFocusMetrics;
    const years = parseInt(searchParams.get('years') || '10');
    
    // Validácia metriky
    const validMetrics: (keyof GuruFocusMetrics)[] = [
      'peRatio', 'psRatio', 'pbRatio', 'evEbitda', 'fcfYield',
      'evRevenue', 'evFcf', 'priceTangibleBook', 'pegRatio', 'dividendYield',
      'roic', 'roe', 'debtToEquity', 'currentRatio', 'quickRatio'
    ];
    
    if (!validMetrics.includes(metric)) {
      return NextResponse.json(
        { 
          error: 'Invalid metric',
          validMetrics,
          message: 'Use one of: ' + validMetrics.join(', ')
        },
        { status: 400 }
      );
    }
    
    if (isNaN(years) || years < 1 || years > 20) {
      return NextResponse.json(
        { error: 'Years must be between 1 and 20' },
        { status: 400 }
      );
    }
    
    // Získanie grafových dát
    const chartData = await GuruFocusService.getGuruFocusChartData(
      ticker.toUpperCase(), 
      metric, 
      years
    );
    
    // Formátovanie pre frontend
    const formattedData = chartData.map(point => ({
      date: point.date.toISOString().split('T')[0],
      value: point.value,
      median: point.median,
      percentile10: point.percentile10,
      percentile90: point.percentile90,
      isExpensive: point.isExpensive,
      isCheap: point.isCheap
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        ticker: ticker.toUpperCase(),
        metric,
        years,
        chartData: formattedData,
        metadata: {
          totalPoints: formattedData.length,
          dateRange: {
            start: formattedData[0]?.date,
            end: formattedData[formattedData.length - 1]?.date
          },
          statistics: {
            current: formattedData[formattedData.length - 1]?.value,
            median: formattedData[0]?.median,
            percentile10: formattedData[0]?.percentile10,
            percentile90: formattedData[0]?.percentile90,
            isExpensive: formattedData[formattedData.length - 1]?.isExpensive,
            isCheap: formattedData[formattedData.length - 1]?.isCheap
          }
        }
      }
    });
    
  } catch (error) {
    console.error('❌ GuruFocus API error:', error);
    
    if (error instanceof Error && error.message.includes('No historical data found')) {
      return NextResponse.json(
        { 
          error: 'No historical data available for this symbol and metric',
          code: 'NO_DATA',
          suggestion: 'Try running the update metrics endpoint first'
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
    
    const { date } = body;
    
    // Validácia dátumu
    let targetDate: Date;
    if (date) {
      targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO format: YYYY-MM-DD' },
          { status: 400 }
        );
      }
    } else {
      targetDate = new Date();
    }
    
    console.log(`🔄 Updating GuruFocus metrics for ${ticker} on ${targetDate.toISOString().split('T')[0]}`);
    
    // Aktualizácia metrík
    await GuruFocusService.updateGuruFocusMetrics(ticker.toUpperCase(), targetDate);
    
    // Získanie aktualizovaných metrík
    const metrics = await GuruFocusService.calculateGuruFocusMetrics(ticker.toUpperCase(), targetDate);
    
    return NextResponse.json({
      success: true,
      message: `GuruFocus metrics updated for ${ticker}`,
      data: {
        ticker: ticker.toUpperCase(),
        date: targetDate.toISOString().split('T')[0],
        metrics,
        availableMetrics: [
          'peRatio', 'psRatio', 'pbRatio', 'evEbitda', 'fcfYield',
          'evRevenue', 'evFcf', 'priceTangibleBook', 'pegRatio', 'dividendYield',
          'roic', 'roe', 'debtToEquity', 'currentRatio', 'quickRatio'
        ]
      }
    });
    
  } catch (error) {
    console.error('❌ GuruFocus update error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to update GuruFocus metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

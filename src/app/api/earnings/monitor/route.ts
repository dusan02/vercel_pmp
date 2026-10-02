import { NextRequest, NextResponse } from 'next/server';
import { checkEarningsForOurTickers } from '@/lib/clients/yahooFinanceScraper';
import { startEarningsMonitoring } from '@/lib/earningsMonitor';
import { getDateET } from '@/lib/utils/dateET';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const project = searchParams.get('project') || 'pmp';
    const auto = searchParams.get('auto') === 'true';

    console.log(`🔍 Earnings monitor request:`, { date, project, auto });

    if (auto) {
      // Automatické monitorovanie
      await startEarningsMonitoring(project);
      return NextResponse.json({
        success: true,
        message: 'Earnings monitoring completed',
        timestamp: new Date().toISOString()
      });
    } else {
      // Manuálna kontrola
      const checkDate = (date || getDateET()) as string;
      const result = await checkEarningsForOurTickers(checkDate, project);

      return NextResponse.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Error in earnings monitor API:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, project = 'pmp' } = body;

    console.log(`🔍 Earnings monitor POST request:`, { date, project });

    const checkDate = date || getDateET();
    const result = await checkEarningsForOurTickers(checkDate, project);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in earnings monitor POST API:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 
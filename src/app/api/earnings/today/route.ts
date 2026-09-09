import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    console.log(`🔍 Getting earnings data for ${date} from database...`);

    // Simple query to get earnings data from database
    const earnings = await prisma.earningsCalendar.findMany({
      where: {
        date: {
          gte: new Date(date + 'T00:00:00'),
          lt: new Date(date + 'T23:59:59')
        }
      },
      orderBy: [
        { time: 'asc' },
        { ticker: 'asc' }
      ]
    });

    console.log(`📊 Found ${earnings.length} earnings records in database for ${date}`);

    // Convert to simple format without complex calculations
    const earningsData = earnings.map(earning => ({
      ticker: earning.ticker,
      companyName: earning.companyName,
      marketCap: earning.marketCap,
      epsEstimate: earning.epsEstimate,
      epsActual: earning.epsActual,
      revenueEstimate: earning.revenueEstimate,
      revenueActual: earning.revenueActual,
      epsSurprisePercent: earning.epsSurprisePercent,
      revenueSurprisePercent: earning.revenueSurprisePercent,
      percentChange: earning.percentChange,
      marketCapDiff: earning.marketCapDiff,
      time: earning.time,
      date: earning.date.toISOString().split('T')[0]
    }));

    // Split by time
    const preMarket = earningsData.filter(earning => earning.time === 'before');
    const afterMarket = earningsData.filter(earning => earning.time === 'after');

    const response = {
      success: true,
      data: {
        preMarket,
        afterMarket
      },
      message: `Found ${earningsData.length} earnings for ${date}`,
      cached: true
    };

    console.log(`✅ Returning ${earningsData.length} earnings records from database (${preMarket.length} pre-market, ${afterMarket.length} after-market)`);

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error in earnings today API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
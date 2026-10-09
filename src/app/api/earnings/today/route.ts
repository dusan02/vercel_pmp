import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getDateET } from '@/lib/utils/dateET';
import { classifyEarningsTime } from '@/lib/utils/earningsTime';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // ET calendar day — a raw UTC ISO shifts US evenings into "tomorrow",
    // which returned an empty earnings list after ~20:00 ET.
    const date = searchParams.get('date') || getDateET();

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

    const preMarket = earningsData.filter(earning => classifyEarningsTime(earning.time) === 'preMarket');
    const afterMarket = earningsData.filter(earning => classifyEarningsTime(earning.time) === 'afterMarket');
    const timeTbd = earningsData.filter(earning => classifyEarningsTime(earning.time) === 'timeTbd');

    const response = {
      success: true,
      data: {
        date,
        preMarket,
        afterMarket,
        timeTbd
      },
      count: earningsData.length,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Returning ${earningsData.length} earnings records from database (${preMarket.length} pre-market, ${afterMarket.length} after-market, ${timeTbd.length} tbd)`);

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
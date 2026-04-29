import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const totalTickers = await prisma.ticker.count();
    
    // Check for missing data fields
    const missingPrice = await prisma.ticker.count({ where: { lastPrice: null } });
    const missingMarketCap = await prisma.ticker.count({ where: { lastMarketCap: null } });
    const missingMarketCapDiff = await prisma.ticker.count({ where: { lastMarketCapDiff: null } });
    const missingChangePct = await prisma.ticker.count({ where: { lastChangePct: null } });

    // Calculate freshness based on lastPriceUpdated
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const fresh = await prisma.ticker.count({ where: { lastPriceUpdated: { gte: oneHourAgo } } });
    const recent = await prisma.ticker.count({ where: { lastPriceUpdated: { gte: oneDayAgo, lt: oneHourAgo } } });
    const stale = await prisma.ticker.count({ where: { lastPriceUpdated: { gte: oneWeekAgo, lt: oneDayAgo } } });
    const veryStale = await prisma.ticker.count({ where: { lastPriceUpdated: { lt: oneWeekAgo } } });
    const neverUpdated = await prisma.ticker.count({ where: { lastPriceUpdated: null, lastPrice: { not: null } } });

    // Get samples of bad data
    const problematicTickers = await prisma.ticker.findMany({
      where: { 
        OR: [
          { lastPrice: null },
          { lastMarketCap: null },
          { lastMarketCapDiff: null },
          { lastChangePct: null },
          { lastPriceUpdated: { lt: oneDayAgo } },
          { lastPriceUpdated: null, lastPrice: { not: null } }
        ]
      },
      select: { 
        symbol: true, 
        lastPrice: true, 
        lastMarketCap: true, 
        lastMarketCapDiff: true, 
        lastChangePct: true, 
        lastPriceUpdated: true 
      },
      take: 20
    });

    return NextResponse.json({
      success: true,
      totals: {
        totalTickers,
        missingData: {
          price: missingPrice,
          marketCap: missingMarketCap,
          marketCapDiff: missingMarketCapDiff,
          changePct: missingChangePct,
        }
      },
      freshness: {
        lessThan1Hour: fresh,
        between1And24Hours: recent,
        between1And7Days: stale,
        olderThan7Days: veryStale,
        missingUpdateDate: neverUpdated,
      },
      problematicSamples: problematicTickers,
      generatedAt: now.toISOString()
    });

  } catch (error) {
    console.error('Data health API error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

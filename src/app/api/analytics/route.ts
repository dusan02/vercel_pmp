import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/lib/db/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const data: Record<string, unknown> = {};

    const gainersNeeded = type === 'all' || type === 'gainers';
    const losersNeeded = type === 'all' || type === 'losers';

    const [topGainers, topLosers] = await Promise.all([
      gainersNeeded ? dbHelpers.getTopGainers.all() : Promise.resolve(null),
      losersNeeded ? dbHelpers.getTopLosers.all() : Promise.resolve(null)
    ]);

    if (gainersNeeded && topGainers) {
      data.topGainers = topGainers;
    }

    if (losersNeeded && topLosers) {
      data.topLosers = topLosers;
    }

    const [allStocks, favoriteRows] = await Promise.all([
      dbHelpers.getAllStocks.all(),
      dbHelpers.getUserFavorites.all('default')
    ]);

    const totalStocks = allStocks.length;
    const totalFavorites = favoriteRows.length;

    data.stats = {
      totalStocks,
      totalFavorites,
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
} 
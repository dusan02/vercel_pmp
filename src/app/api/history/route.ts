import { NextRequest, NextResponse } from 'next/server';
import { dbHelpers } from '@/lib/db/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const limit = parseInt(searchParams.get('limit') || '100');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!ticker) {
      return NextResponse.json(
        { error: 'ticker parameter is required' },
        { status: 400 }
      );
    }

    let history;

    if (startDate && endDate) {
      // Get history for specific date range
      history = await dbHelpers.getPriceHistoryRange.all(ticker, startDate, endDate);
    } else {
      // Get recent history
      history = await dbHelpers.getPriceHistory.all(ticker, limit);
    }

    return NextResponse.json({
      success: true,
      data: history,
      count: history.length,
      ticker
    });

  } catch (error) {
    console.error('Error fetching price history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
} 
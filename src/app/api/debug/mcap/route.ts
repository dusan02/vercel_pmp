import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const data = await prisma.ticker.findUnique({
      where: { symbol: ticker.toUpperCase() },
      select: {
        symbol: true,
        lastMarketCap: true,
        sharesOutstanding: true,
        lastPrice: true,
        latestPrevClose: true
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getMarketProfile } from '@/lib/analysis/marketProfile';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase().trim();

  try {
    const profile = await getMarketProfile(symbol);
    return NextResponse.json(profile, {
      headers: {
        'Cache-Control': profile.peersPending
          ? 'no-store'
          : 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error(`[market-profile] failed for ${symbol}:`, err);
    return NextResponse.json({ error: 'Failed to load market profile' }, { status: 500 });
  }
}

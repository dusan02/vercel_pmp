import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSectorPeers } from '@/lib/analysis/pageData';

/**
 * GET /api/analysis/peers?symbol=MSFT — same-sector competitors as clickable
 * chips for the analysis tab. Same query as the standalone page's
 * RelatedStocksSection (market-cap sorted, share classes deduped).
 */
export async function GET(request: NextRequest) {
  const symbol = (new URL(request.url).searchParams.get('symbol') ?? '').toUpperCase().trim();
  if (!symbol) return NextResponse.json({ peers: [] });

  const ticker = await prisma.ticker.findUnique({
    where: { symbol },
    select: { sector: true },
  });
  const peers = ticker?.sector ? await getSectorPeers(ticker.sector, symbol) : [];

  return NextResponse.json(
    { sector: ticker?.sector ?? null, peers },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  );
}

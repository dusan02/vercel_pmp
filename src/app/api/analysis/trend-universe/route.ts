import { NextResponse } from 'next/server';
import { getTrendQualifiedSymbols } from '@/lib/analysis/trendUniverse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/analysis/trend-universe
 * Lightweight qualified-symbol list for badge rendering (portfolio, watchlists).
 * Backed by the same Redis-cached universe as ?trendConfirmed=1.
 */
export async function GET() {
    const symbols = await getTrendQualifiedSymbols();
    return NextResponse.json(
        { symbols: [...symbols] },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
}

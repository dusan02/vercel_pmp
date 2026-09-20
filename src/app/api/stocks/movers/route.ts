import { NextRequest, NextResponse } from 'next/server';
import { getMoversData } from '@/services/movers/getMovers';

/**
 * API Endpoint to fetch top market movers
 * GET /api/stocks/movers
 *
 * Thin wrapper over the shared Movers 2.0 pipeline (src/services/movers/getMovers.ts)
 * — the same records feed /premarket-movers SSR so the two surfaces can't diverge.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 100);
        // Threshold: 2.0 = statistically significant (2 std dev above mean).
        const minZScore = Math.min(Math.max(parseFloat(searchParams.get('minZ') || '2.0') || 2.0, 0), 50);

        const { movers, session, marketChangePct } = await getMoversData(limit, minZScore);

        return NextResponse.json({
            movers,
            session,
            marketChangePct,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ [MoversAPI] Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch movers',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

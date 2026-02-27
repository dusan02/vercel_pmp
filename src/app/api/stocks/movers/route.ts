import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { REDIS_KEYS } from '@/lib/redis/keys';
import { getDateET } from '@/lib/utils/dateET';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';

/**
 * API Endpoint to fetch top market movers
 * GET /api/stocks/movers
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10');
        // Threshold: 2.0 = statistically significant (2 std dev above mean).
        // Below this is market noise – showing it makes us look like a generic stock list.
        const minZScore = parseFloat(searchParams.get('minZ') || '2.0');

        console.log(`🔍 [MoversAPI] Fetching top ${limit} movers (minZ: ${minZScore})...`);

        const date = getDateET();
        const session = detectSession(new Date());

        // We use Prisma for complex OR filtering to easily capture % change, Z-Score, and RVOL.
        let topMovers = await prisma.ticker.findMany({
            where: {
                OR: [
                    { latestMoversZScore: { gte: minZScore } },
                    { latestMoversZScore: { lte: -minZScore } },
                    { lastChangePct: { gte: 5.0 } },
                    { lastChangePct: { lte: -5.0 } },
                    { latestMoversRVOL: { gte: 3.0 } }
                ]
            },
            take: limit * 2, // Fetch more context to sort out the absolute best
            select: {
                symbol: true,
                name: true,
                logoUrl: true,
                sector: true,
                lastPrice: true,
                lastChangePct: true,
                latestMoversZScore: true,
                latestMoversRVOL: true,
                moversReason: true,
                moversCategory: true,
            }
        });

        // Sort by a combined significance score to rank the most compelling movers first.
        // Weighting: Z-Score (1x) + Abs Change Pct (0.5x) + RVOL (1x)
        topMovers.sort((a, b) => {
            const sigA = Math.abs(a.latestMoversZScore || 0) + (Math.abs(a.lastChangePct || 0) / 2) + (a.latestMoversRVOL || 0);
            const sigB = Math.abs(b.latestMoversZScore || 0) + (Math.abs(b.lastChangePct || 0) / 2) + (b.latestMoversRVOL || 0);
            return sigB - sigA;
        });

        // Apply visual limit
        topMovers = topMovers.slice(0, limit);

        // === SINGLE SOURCE OF TRUTH FIX ===
        // Enrich lastChangePct / lastPrice from Redis hash (stock:SYM — same source as All Stocks/Heatmap).
        // This prevents desync between Prisma writes and Redis writes that happen in the same worker cycle.
        if (redisClient && redisClient.isOpen && topMovers.length > 0) {
            try {
                const pipe = redisClient.multi();
                for (const m of topMovers) {
                    pipe.hGetAll(`stock:${m.symbol}`);
                }
                const results = await pipe.exec();
                topMovers = topMovers.map((m, i) => {
                    const raw = results?.[i];
                    const h = (raw && !Array.isArray(raw) && typeof raw === 'object') ? raw as Record<string, string>
                        : (Array.isArray(raw) && raw[1] && typeof raw[1] === 'object') ? raw[1] as Record<string, string>
                            : null;
                    if (h && h.c !== undefined && h.p !== undefined) {
                        return {
                            ...m,
                            lastChangePct: Number(h.c),
                            lastPrice: Number(h.p)
                        };
                    }
                    return m;
                });
            } catch (redisErr) {
                console.warn('[MoversAPI] Redis enrich failed, falling back to DB values:', redisErr);
            }
        }

        return NextResponse.json({
            movers: topMovers,
            session,
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

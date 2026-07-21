import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const ALERTS_CACHE_TTL = 300; // 5 minutes

export async function GET() {
    const cacheKey = 'analysis:alerts';
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    try {
        // Fetch companies with recent quality signals
        // Filter by lastQualitySignalAt in the last 14 days
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const alerts = await (prisma.analysisCache as any).findMany({
            where: {
                lastQualitySignalAt: {
                    gte: fourteenDaysAgo
                }
            },
            include: {
                ticker: {
                    select: {
                        name: true,
                        logoUrl: true,
                        lastPrice: true
                    }
                }
            },
            orderBy: {
                lastQualitySignalAt: 'desc'
            },
            take: 10
        });

        const responseBody = { alerts };
        try { await setCachedData(cacheKey, responseBody, ALERTS_CACHE_TTL); } catch {}
        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('Error fetching quality alerts:', error);
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
}

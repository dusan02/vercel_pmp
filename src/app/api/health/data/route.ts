export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getDateET } from '@/lib/utils/dateET';
import { evaluateDataFreshness, getExpectedCompletedSession } from '@/lib/health/dataFreshness';

/**
 * Data-pipeline freshness check — complements /api/healthz (uptime) with
 * "did the data actually land" checks. Always returns 200; consumers inspect
 * `status`. The PM2 health monitor alerts on degraded/unhealthy.
 */
export async function GET() {
    const now = new Date();
    const expectedSession = getExpectedCompletedSession(now);
    const stale24h = new Date(now.getTime() - 24 * 60 * 60_000);
    const stale7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

    const [
        dailyRefRows,
        dailyRefWithClose,
        valuationRows,
        tickerTotal,
        tickerStalePrices,
        analysisCacheTotal,
        analysisCacheStale7d,
    ] = await Promise.all([
        prisma.dailyRef.count({ where: { date: expectedSession } }),
        prisma.dailyRef.count({ where: { date: expectedSession, regularClose: { not: null } } }),
        prisma.dailyValuationHistory.count({ where: { date: expectedSession } }),
        prisma.ticker.count(),
        prisma.ticker.count({
            where: {
                OR: [
                    { lastPrice: null },
                    { lastPriceUpdated: { lt: stale24h } },
                ],
            },
        }),
        prisma.analysisCache.count(),
        prisma.analysisCache.count({ where: { updatedAt: { lt: stale7d } } }),
    ]);

    const snapshot = {
        expectedSessionDate: getDateET(expectedSession),
        dailyRefRows,
        dailyRefWithClose,
        valuationRows,
        tickerTotal,
        tickerStalePrices,
        analysisCacheTotal,
        analysisCacheStale7d,
    };

    const { status, checks } = evaluateDataFreshness(snapshot);

    return NextResponse.json({
        status,
        expectedSession: snapshot.expectedSessionDate,
        checks,
        snapshot,
        timestamp: now.toISOString(),
    });
}

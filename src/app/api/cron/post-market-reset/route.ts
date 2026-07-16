import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { saveRegularClose } from '@/workers/polygonWorker';
import { getDateET } from '@/lib/utils/dateET';

/**
 * Post-Market Reset Route
 *
 * Executed once a day, shortly after 16:00 ET (e.g. 16:30 ET).
 * This performs the critical data handover:
 *   Saves today's Regular Close as Tomorrow's Previous Close.
 *
 * Non-critical steps (movers reset, shares update, analysis) have been
 * split into separate cron routes:
 *   - /api/cron/reset-movers
 *   - /api/cron/post-market-sync
 *
 * Those can be scheduled independently with their own timeouts.
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🚀 Starting Post-Market Reset (saveRegularClose)...');

        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) {
            throw new Error('POLYGON_API_KEY is not configured');
        }

        const calendarDateETStr = getDateET();
        const runId = Date.now().toString(36);

        await saveRegularClose(apiKey, calendarDateETStr, runId);

        const duration = Date.now() - startTime;
        console.log(`✅ Post-market reset completed in ${(duration / 1000).toFixed(2)}s`);

        return createCronSuccessResponse({
            message: 'Post-market reset: regular close saved successfully',
            summary: {
                duration: `${(duration / 1000).toFixed(2)}s`,
            },
        });

    } catch (error) {
        return handleCronError(error, 'post_market_reset cron job');
    }
}

export async function GET(request: NextRequest) {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        const authHeader = request.headers.get('authorization');
        if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'post_market_reset manual trigger');
    }
}

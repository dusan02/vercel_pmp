import { serverLog } from '@/lib/utils/serverLog';
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, verifyCronAuthOptional, withCronLock } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { saveRegularClose } from '@/workers/polygonWorker';
import { getDateET } from '@/lib/utils/dateET';
import { fillValuationDay } from '@/services/analysis/fillValuationDay';

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
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        // Distributed lock: prevent overlapping runs (daily critical handover)
        return await withCronLock('post-market-reset', 30 * 60, async () => runPostMarketReset());
    } catch (error) {
        return handleCronError(error, 'post_market_reset cron job');
    }
}

async function runPostMarketReset(): Promise<NextResponse> {
    const startTime = Date.now();

    serverLog('🚀 Starting Post-Market Reset (saveRegularClose)...');

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
        throw new Error('POLYGON_API_KEY is not configured');
    }

    const calendarDateETStr = getDateET();
    const runId = Date.now().toString(36);

    const saveResult = await saveRegularClose(apiKey, calendarDateETStr, runId);
    const closeSaveSummary = saveResult.status === 'saved'
        ? `saved:${saveResult.saved} prevCloseNextDay:${saveResult.prevCloseUpdated} nextDayKeys:${saveResult.nextDayKeyCount}`
        : `${saveResult.status}: ${saveResult.status === 'skipped' ? saveResult.reason : saveResult.error}`;

    // Fill today's DailyValuationHistory rows from the just-saved closes so the
    // newest trading day doesn't wait for lazy per-ticker syncs or the weekly
    // refresh-all (the 2026-09-28 gap: only 16/995 rows). Non-fatal — a failure
    // here must not fail the close-handover itself.
    let valuationFill = 'skipped';
    try {
        const fill = await fillValuationDay(calendarDateETStr);
        valuationFill = `created:${fill.filled} corrected:${fill.updated} unchanged:${fill.unchanged} failed:${fill.failed}`;
        serverLog(`📈 fillValuationDay ${calendarDateETStr}: ${valuationFill}`);
    } catch (e) {
        valuationFill = `error:${e instanceof Error ? e.message : String(e)}`;
        console.error('⚠️ fillValuationDay failed (non-fatal):', e);
    }

    const duration = Date.now() - startTime;

    if (saveResult.status === 'failed') {
        console.error(`❌ Post-market reset failed at close-save step: ${saveResult.error}`);
        return handleCronError(new Error(`regular close save failed: ${saveResult.error}`), 'post_market_reset cron job');
    }

    serverLog(`✅ Post-market reset completed in ${(duration / 1000).toFixed(2)}s`);

    return createCronSuccessResponse({
        message: saveResult.status === 'skipped'
            ? `Post-market reset: regular close skipped (${saveResult.reason})`
            : 'Post-market reset: regular close saved successfully',
        summary: {
            duration: `${(duration / 1000).toFixed(2)}s`,
            regularClose: closeSaveSummary,
            valuationFill,
        },
    });
}

export async function GET(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true);
    if (authError) return authError;
    try {
        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'post_market_reset manual trigger');
    }
}

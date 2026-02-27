import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { statsService } from '@/lib/server/statsService';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Cron job to update daily statistical baselines for tickers
 * Used by the Movers section for Z-score and RVOL calculations
 * 
 * Frequency: Once daily (e.g., 01:00 ET)
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Verify Authorization
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🚀 StatsService Cron: Starting daily ticker stats update...');

        // 2. Get tickers to process
        const allTickers = await getAllTrackedTickers();
        console.log(`📊 StatsService Cron: Processing ${allTickers.length} tickers`);

        // 3. Process with StatsService
        const { success, failed } = await statsService.updateHistoricalStats(allTickers);

        // 4. Update Cron Status
        await updateCronStatus('ticker_stats');

        // 5. Return Success
        const duration = Date.now() - startTime;
        return createCronSuccessResponse({
            message: 'Ticker stats baseline update completed',
            results: {
                success,
                failed,
            },
            summary: {
                totalTickers: allTickers.length,
                duration: `${(duration / 1000).toFixed(2)}s`,
            },
        });

    } catch (error) {
        return handleCronError(error, 'ticker stats update cron job');
    }
}

// GET endpoint for manual testing
export async function GET(request: NextRequest) {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        const authHeader = request.headers.get('authorization');

        if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Call POST handler
        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'test ticker stats update');
    }
}

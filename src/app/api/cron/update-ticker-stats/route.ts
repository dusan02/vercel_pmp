import { NextRequest, NextResponse } from 'next/server';
import { withCronHandler } from '@/lib/utils/cronAuth';
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
export const POST = withCronHandler('update-ticker-stats', async () => {
    const startTime = Date.now();
    const allTickers = await getAllTrackedTickers();
    const { success, failed } = await statsService.updateHistoricalStats(allTickers);
    await updateCronStatus('ticker_stats');
    return createCronSuccessResponse({
        message: 'Ticker stats baseline update completed',
        results: { success, failed },
        summary: {
            totalTickers: allTickers.length,
            duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        },
    });
});

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

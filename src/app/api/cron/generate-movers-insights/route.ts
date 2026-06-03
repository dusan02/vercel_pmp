import { NextRequest, NextResponse } from 'next/server';
import { withCronHandler } from '@/lib/utils/cronAuth';
import { aiMoversService } from '@/lib/server/aiMoversService';
import { createCronSuccessResponse, handleCronError } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Cron job to generate AI insights for significant market movers
 * Fetches news for top Z-score stocks and uses LLM to categorize movement
 * 
 * Frequency: Every 15-30 minutes during market hours
 */
export const POST = withCronHandler('movers-insights', async () => {
    const startTime = Date.now();
    const { success, failed } = await aiMoversService.processMoversInsights();
    await updateCronStatus('movers_insights');
    return createCronSuccessResponse({
        message: 'Movers AI insights generation completed',
        results: { success, failed },
        summary: { duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s` },
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
        return handleCronError(error, 'test movers AI insights');
    }
}

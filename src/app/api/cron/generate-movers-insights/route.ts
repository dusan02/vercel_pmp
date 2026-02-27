import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { aiMoversService } from '@/lib/server/aiMoversService';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Cron job to generate AI insights for significant market movers
 * Fetches news for top Z-score stocks and uses LLM to categorize movement
 * 
 * Frequency: Every 15-30 minutes during market hours
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Verify Authorization
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🚀 AiMoversService Cron: Starting movers insight generation...');

        // 2. Process with AiMoversService
        const { success, failed } = await aiMoversService.processMoversInsights();

        // 3. Update Cron Status
        await updateCronStatus('movers_insights');

        // 4. Return Success
        const duration = Date.now() - startTime;
        return createCronSuccessResponse({
            message: 'Movers AI insights generation completed',
            results: {
                success,
                failed,
            },
            summary: {
                duration: `${(duration / 1000).toFixed(2)}s`,
            },
        });

    } catch (error) {
        return handleCronError(error, 'movers AI insights cron job');
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
        return handleCronError(error, 'test movers AI insights');
    }
}

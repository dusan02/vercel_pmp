import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { socialDistributorService } from '@/lib/server/socialDistributorService';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Cron job to post top alpha signals to social media (X/Twitter)
 * 
 * Frequency: Every 30-60 minutes during market hours
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Verify Authorization
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🚀 SocialDistributor Cron: Starting social distribution...');

        // 2. Process with SocialDistributorService
        const results = await socialDistributorService.distributeTopMovers();

        // 3. Update Cron Status
        await updateCronStatus('social_distribution');

        // 4. Return Success
        const duration = Date.now() - startTime;
        return createCronSuccessResponse({
            message: 'Social distribution completed',
            results,
            summary: {
                duration: `${(duration / 1000).toFixed(2)}s`,
                action: results.posted.length > 0 ? `Posted ${results.posted.join(', ')}` : 'Nothing posted'
            },
        });

    } catch (error) {
        return handleCronError(error, 'social distribution cron job');
    }
}

// GET endpoint for manual testing (requires CRON_SECRET_KEY in production)
export async function GET(request: NextRequest) {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        const authHeader = request.headers.get('authorization');

        if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'test social distribution');
    }
}

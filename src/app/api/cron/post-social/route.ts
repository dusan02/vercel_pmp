import { NextRequest, NextResponse } from 'next/server';
import { withCronHandler } from '@/lib/utils/cronAuth';
import { socialDistributorService } from '@/lib/server/socialDistributorService';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Cron job to post top alpha signals to social media (X/Twitter)
 * 
 * Frequency: Every 30-60 minutes during market hours
 */
export const POST = withCronHandler('post-social', async () => {
    const startTime = Date.now();
    const results = await socialDistributorService.distributeTopMovers();
    await updateCronStatus('social_distribution');
    return createCronSuccessResponse({
        message: 'Social distribution completed',
        results,
        summary: {
            duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            action: results.posted.length > 0 ? `Posted ${results.posted.join(', ')}` : 'Nothing posted',
        },
    });
});

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

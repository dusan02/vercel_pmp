import { NextRequest, NextResponse } from 'next/server';
import { withCronHandler, verifyCronAuthOptional } from '@/lib/utils/cronAuth';
import { socialDistributorService } from '@/services/socialDistributorService';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Post-close recap post ("Today's biggest movers") — once per weekday.
 */
export const POST = withCronHandler('post-social-recap', async () => {
    const startTime = Date.now();
    const results = await socialDistributorService.postDailyRecap();
    await updateCronStatus('social_recap');
    return createCronSuccessResponse({
        message: 'Social daily recap completed',
        results,
        summary: {
            duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
            action: results.posted.length > 0 ? `Posted ${results.posted.join(', ')}` : 'Nothing posted',
        },
    });
});

// GET endpoint for manual testing (requires CRON_SECRET_KEY in production)
export async function GET(request: NextRequest) {
    const authError = verifyCronAuthOptional(request, true);
    if (authError) return authError;

    try {
        return await POST(request);
    } catch (error) {
        return handleCronError(error, 'test social daily recap');
    }
}

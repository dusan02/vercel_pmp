import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

/**
 * Cron job to keep heatmap cache warm
 * Runs every 10 minutes (matching the cache TTL)
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = (await headers()).get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const startTime = Date.now();
        console.log('🔄 Heatmap Keep-Warm Cron: Starting cache refresh...');

        // Call the heatmap API internally with force=true to bypass cache and regenerate
        // We use the internal URL structure
        const proto = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host');

        if (!host) {
            throw new Error('Host header missing');
        }

        const apiUrl = `${proto}://${host}/api/heatmap?force=true`;

        console.log(`Asking ${apiUrl} to refresh...`);

        // Helper to fetch for a specific timeframe to warm up the most popular one
        const warmUp = async (timeframe: string) => {
            try {
                const response = await fetch(`${apiUrl}&timeframe=${timeframe}`, {
                    headers: {
                        'Authorization': authHeader || '', // Pass through auth if needed
                        // Add a custom header so the heatmap API knows it's a cron job if we need special handling later
                        'X-Source': 'cron-keep-warm'
                    }
                });

                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`);
                }

                const data = await response.json();
                return { success: true, count: data.count, timeframe };
            } catch (e) {
                console.error(`❌ Failed to warm up ${timeframe}:`, e);
                return { success: false, error: e instanceof Error ? e.message : String(e), timeframe };
            }
        };

        // Warm up the default 'day' timeframe as it's the landing page default
        // We could also warm up 'week' and 'month' if needed, but 'day' is priority 1
        const resultDay = await warmUp('day');

        const duration = Date.now() - startTime;
        console.log(`✅ Heatmap Keep-Warm Cron: Finished in ${duration}ms`, resultDay);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            duration,
            results: [resultDay]
        });
    } catch (error) {
        console.error('❌ Heatmap Keep-Warm Cron failed:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

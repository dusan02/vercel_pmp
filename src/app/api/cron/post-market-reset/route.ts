import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';
import { saveRegularClose } from '@/workers/polygonWorker';
import { processBatch } from '@/lib/utils/batchProcessing';
import { updateTickerSharesOutstanding } from '@/lib/utils/tickerUpdates';
import { getAllTrackedTickers } from '@/lib/utils/universeHelpers';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getTradingDay } from '@/lib/utils/timeUtils';
import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { AnalysisService } from '@/services/analysisService';

const BATCH_SIZE = 50;
const CONCURRENCY_LIMIT = 10;

/**
 * Post-Market Reset Route
 * 
 * Executed once a day, shortly after 16:00 ET (e.g. 16:30 ET).
 * This performs exactly ONE continuous data handover per day:
 * 1. Saves today's Regular Close as Tomorrow's Previous Close.
 * 2. Clears Movers AI texts for the new day.
 * 3. Updates Shares Outstanding.
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🚀 Starting Post-Market Daily Reset...');

        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) {
            throw new Error('POLYGON_API_KEY is not configured');
        }

        const calendarDateETStr = getDateET();
        const runId = Date.now().toString(36);

        // 1. SAVE REGULAR CLOSE
        // This fetches today's day.c and saves it as previousClose for the NEXT trading day.
        // It also natively sets the Redis cache for the NEXT trading day.
        console.log('\n📝 Step 1: Saving regular close for tomorrow...');
        await saveRegularClose(apiKey, calendarDateETStr, runId);

        // 2. RESET MOVERS AI FIELDS
        console.log('\n📝 Step 2: Resetting Movers AI fields for fresh start...');
        const updated = await prisma.ticker.updateMany({
            where: {
                OR: [
                    { moversReason: { not: null } },
                    { moversCategory: { not: null } },
                    { socialCopy: { not: null } },
                ]
            },
            data: {
                moversReason: null,
                moversCategory: null,
                socialCopy: null,
                isSbcAlert: false,
                aiConfidence: null,
            }
        });

        let redisCleared = 0;
        if (redisClient && redisClient.isOpen) {
            try {
                const keys: string[] = [];
                const scanIterator = redisClient.scanIterator({ MATCH: 'stock:*', COUNT: 200 });
                for await (const key of scanIterator) {
                    keys.push(key);
                }

                if (keys.length > 0) {
                    const pipe = redisClient.multi();
                    for (const key of keys) {
                        pipe.hDel(key, ['reason', 'cat', 'copy', 'sbc', 'conf']);
                    }
                    await pipe.exec();
                    redisCleared = keys.length;
                }
            } catch (redisErr) {
                console.warn('⚠️ [reset-movers] Redis clear failed (non-fatal):', redisErr);
            }
        }
        console.log(`✅ Cleared movers AI fields for ${updated.count} DB rows, ${redisCleared} Redis keys.`);

        // 3. UPDATE SHARES OUTSTANDING
        console.log('\n📝 Step 3: Updating sharesOutstanding...');
        const allTickers = await getAllTrackedTickers();
        const sharesResults = await processBatch(
            allTickers,
            updateTickerSharesOutstanding,
            BATCH_SIZE,
            CONCURRENCY_LIMIT
        );
        console.log(`✅ SharesOutstanding: ${sharesResults.success} updated, ${sharesResults.failed} failed`);

        // 4. RECOMPUTE ANALYSIS FOR ALL TRACKED TICKERS
        console.log('\n📝 Step 4: Recomputing analysis for all tracked tickers...');
        const trackedTickers = await getAllTrackedTickers();
        const analysisResults = { success: 0, failed: 0 };

        for (const symbol of trackedTickers) {
            try {
                // Sync and analyze sequentially to respect Polygon API rate limits
                const success = await AnalysisService.syncAndAnalyze(symbol);
                if (success) {
                    analysisResults.success++;
                } else {
                    analysisResults.failed++;
                }

                // Add a small delay between tickers (e.g. 500ms) to prevent burst errors
                // For free tier users, this should be increased to ~12000ms
                await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === 'production' ? 1000 : 100));
            } catch (err: any) {
                console.error(`❌ Fatal error in analysis for ${symbol}:`, err.message);
                analysisResults.failed++;
            }
        }
        console.log(`✅ Analysis Sync Complete: ${analysisResults.success} updated, ${analysisResults.failed} failed`);

        await updateCronStatus('post_market_reset');

        const duration = Date.now() - startTime;

        return createCronSuccessResponse({
            message: 'Post-market daily reset completed successfully',
            results: {
                sharesOutstanding: sharesResults,
                moversReset: { dbUpdated: updated.count, redisCleared }
            },
            summary: {
                totalTickers: allTickers.length,
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

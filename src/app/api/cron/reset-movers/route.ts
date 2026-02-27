import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Nightly reset of AI-generated Movers fields.
 * Clears moversReason, moversCategory, socialCopy, aiConfidence, isSbcAlert
 * so that each trading day starts fresh.
 *
 * Schedule: Daily at 00:05 ET (just after midnight reset of prevClose)
 */

async function runReset() {
    const startTime = Date.now();

    // 1. Clear all movers AI fields in Prisma (batch updateMany — one query)
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

    console.log(`✅ [reset-movers] Cleared movers AI fields for ${updated.count} tickers`);

    // 2. Clear Redis hash fields for all stock:SYM entries
    let redisCleared = 0;
    if (redisClient && redisClient.isOpen) {
        try {
            // Scan all stock:* keys and remove the 'reason', 'cat', 'copy', 'sbc', 'conf' fields
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
                console.log(`✅ [reset-movers] Cleared Redis movers fields for ${redisCleared} stock keys`);
            }
        } catch (redisErr) {
            console.warn('⚠️ [reset-movers] Redis clear failed (non-fatal):', redisErr);
        }
    }

    const duration = Date.now() - startTime;
    return { dbUpdated: updated.count, redisCleared, duration };
}

export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        const result = await runReset();
        await updateCronStatus('reset_movers');

        return createCronSuccessResponse({
            message: `Movers daily reset completed — ${result.dbUpdated} DB rows cleared, ${result.redisCleared} Redis keys cleaned`,
            results: result,
            summary: { duration: `${(result.duration / 1000).toFixed(2)}s` }
        });
    } catch (error) {
        return handleCronError(error, 'reset-movers cron job');
    }
}

// GET for manual testing
export async function GET(request: NextRequest) {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        const authHeader = request.headers.get('authorization');
        if (isProduction && authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const result = await runReset();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        return handleCronError(error, 'reset-movers manual trigger');
    }
}

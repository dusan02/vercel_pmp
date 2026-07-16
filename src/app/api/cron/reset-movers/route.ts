import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';

/**
 * Reset Movers AI Fields
 *
 * Clears moversReason, moversCategory, socialCopy, isSbcAlert, aiConfidence
 * from both DB and Redis for a fresh start each trading day.
 */
export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🧹 Resetting Movers AI fields...');

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

        return createCronSuccessResponse({
            message: 'Movers AI fields reset successfully',
            results: { dbUpdated: updated.count, redisCleared },
        });
    } catch (error) {
        return handleCronError(error, 'reset-movers cron job');
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
        return handleCronError(error, 'reset-movers manual trigger');
    }
}

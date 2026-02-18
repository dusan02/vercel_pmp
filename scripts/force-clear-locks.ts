/**
 * Emergency script to clear Redis locks
 * Run: npx tsx scripts/force-clear-locks.ts
 */

import { redisClient } from '../src/lib/redis/client';

async function main() {
    console.log('🔓 Starting lock cleanup...');

    try {
        if (redisClient && redisClient.isOpen) {
            const lockKeys = [
                'lock:static_data_update',
                'lock:bulk_preload'
            ];

            for (const key of lockKeys) {
                const exists = await redisClient.exists(key);
                if (exists) {
                    await redisClient.del(key);
                    console.log(`✅ Cleared lock: ${key}`);
                } else {
                    console.log(`ℹ️ Lock not found: ${key}`);
                }
            }

            console.log('✅ Lock cleanup completed successfully');
        } else {
            console.error('❌ Redis not available');
        }
    } catch (error) {
        console.error('❌ Lock cleanup error:', error);
    } finally {
        if (redisClient && redisClient.isOpen) {
            await redisClient.quit();
        }
        process.exit(0);
    }
}

main();

/**
 * DST-safe bulk preload scheduler.
 *
 * Runs preloadBulkStocks every 5 minutes during the 07:30–15:55 ET weekday window.
 * Uses Redis lock to prevent parallel execution across worker instances.
 */

import { redisClient } from '@/lib/redis';
import { getUniverse } from '@/lib/redis/operations';
import { nowET, toET } from '@/lib/utils/dateET';
import { isBulkPreloadWindow } from '@/lib/utils/marketWindowUtils';

/**
 * Check if bulk preload should run, and execute it with lock protection.
 * Called from ingestLoop on every cycle (60s), but internally throttled to 5min.
 */
export async function scheduleBulkPreload(): Promise<void> {
  const etNow = nowET();
  const et = toET(etNow);
  const hours = et.hour;
  const minutes = et.minute;
  const dayOfWeek = et.weekday;

  // Only on weekdays during the 07:30–15:55 ET window
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  if (!isBulkPreloadWindow(hours, minutes) || !isWeekday) {
    return; // Outside bulk preload window
  }

  // Check if last bulk preload was > 5 min ago
  if (!redisClient || !redisClient.isOpen) {
    return;
  }

  const lastPreloadKey = 'bulk:last_preload_ts';
  const lastPreloadStr = await redisClient.get(lastPreloadKey);
  const now = Date.now();
  const fiveMinAgo = now - (5 * 60 * 1000);

  if (lastPreloadStr && parseInt(lastPreloadStr, 10) >= fiveMinAgo) {
    return; // Too soon since last preload
  }

  // Acquire lock to prevent parallel execution
  const { withLock } = await import('@/lib/utils/redisLocks');

  const result = await withLock(
    'bulk_preload',
    8 * 60, // 8 min TTL (2x typical runtime ~3-4 min)
    async () => {
      console.log('🔄 Running DST-safe bulk preload...');
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        console.warn('⚠️ POLYGON_API_KEY not set, skipping bulk preload');
        return;
      }

      const { preloadBulkStocks } = await import('../backgroundPreloader');
      const tickers = await getUniverse('sp500');
      if (tickers.length === 0) {
        return;
      }

      const runId = Date.now().toString(36);
      const preloadStartTime = Date.now();

      console.log(`🔄 [runId:${runId}] Starting bulk preload...`);

      try {
        await preloadBulkStocks(apiKey);
        const preloadDuration = Date.now() - preloadStartTime;
        const preloadDurationMin = preloadDuration / (60 * 1000);

        if (preloadDurationMin > 10) {
          const errorMsg = `Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 10min threshold)`;
          console.error(`❌ [runId:${runId}] ${errorMsg}`);
          await redisClient.set('bulk:last_error', errorMsg);
        } else if (preloadDurationMin > 6) {
          console.warn(`⚠️ [runId:${runId}] Bulk preload took ${preloadDurationMin.toFixed(1)}min (exceeds 6min threshold)`);
        }

        await redisClient.set(lastPreloadKey, now.toString());
        await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
        await redisClient.set('bulk:last_success_ts', now.toString());
        if (preloadDurationMin <= 10) {
          await redisClient.del('bulk:last_error');
        }

        // Stale alert during market hours
        const etNow2 = nowET();
        const et2 = toET(etNow2);
        if (isBulkPreloadWindow(et2.hour, et2.minute)) {
          const bulkAgeMinutes = Math.floor((now - parseInt(await redisClient.get('bulk:last_success_ts') || '0', 10)) / 60000);
          if (bulkAgeMinutes > 10) {
            console.error(`ALERT: [runId:${runId}] Bulk preload stale - last success ${bulkAgeMinutes}min ago during market hours`);
          }
        }

        console.log(`✅ [runId:${runId}] Bulk preload completed in ${preloadDuration}ms (${preloadDurationMin.toFixed(1)}min)`);
      } catch (error) {
        const preloadDuration = Date.now() - preloadStartTime;
        await redisClient.set('bulk:last_duration_ms', preloadDuration.toString());
        await redisClient.set('bulk:last_error', error instanceof Error ? error.message : String(error));
        console.error(`❌ Bulk preload failed after ${preloadDuration}ms:`, error);
        throw error;
      }
    }
  );

  if (result === null) {
    console.log('⏸️ Bulk preload already running, skipping...');
  }
}

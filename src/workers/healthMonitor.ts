/**
 * Worker Health Monitor
 * 
 * Tracks the health of critical worker operations:
 * - saveRegularClose: Must run successfully every trading day at ~16:05 ET
 * - bootstrapPreviousCloses: Must run every trading day at ~04:00 ET
 * 
 * Exposes health status via Redis keys for the health check API.
 */

import { redisClient } from '@/lib/redis';

const HEALTH_PREFIX = 'worker:health:';
const ALERT_THRESHOLD_HOURS = 26; // Alert if no success in >26 hours (handles weekends via nextTradingDay check)

export interface HealthStatus {
    operation: string;
    lastSuccessAt: string | null;
    lastSuccessCount: number;
    lastFailureAt: string | null;
    lastError: string | null;
    isHealthy: boolean;
    hoursSinceLastSuccess: number | null;
}

/**
 * Record a successful operation run.
 */
export async function recordSuccess(operation: string, count: number = 0): Promise<void> {
    try {
        const redis = redisClient;
        if (!redis) throw new Error("Redis client not initialized");
        const key = `${HEALTH_PREFIX}${operation}`;
        const now = new Date().toISOString();

        await redis.hSet(key, {
            lastSuccessAt: now,
            lastSuccessCount: count.toString(),
            lastError: '',
        });
        // TTL: 7 days (survive weekends + holidays)
        await redis.expire(key, 7 * 24 * 60 * 60);
    } catch (e) {
        console.error(`[HealthMonitor] Failed to record success for ${operation}:`, e);
    }
}

/**
 * Record a failed operation run.
 */
export async function recordFailure(operation: string, error: string): Promise<void> {
    try {
        const redis = redisClient;
        if (!redis) throw new Error("Redis client not initialized");
        const key = `${HEALTH_PREFIX}${operation}`;
        const now = new Date().toISOString();

        await redis.hSet(key, {
            lastFailureAt: now,
            lastError: error.slice(0, 500), // Truncate large errors
        });
        await redis.expire(key, 7 * 24 * 60 * 60);
    } catch (e) {
        console.error(`[HealthMonitor] Failed to record failure for ${operation}:`, e);
    }
}

/**
 * Get health status for an operation.
 */
export async function getHealthStatus(operation: string): Promise<HealthStatus> {
    try {
        const redis = redisClient;
        if (!redis) throw new Error("Redis client not initialized");
        const key = `${HEALTH_PREFIX}${operation}`;
        const data = await redis.hGetAll(key);

        const lastSuccessAt = data.lastSuccessAt || null;

        let hoursSinceLastSuccess: number | null = null;
        let isHealthy = true;

        if (lastSuccessAt) {
            const msSince = Date.now() - new Date(lastSuccessAt).getTime();
            hoursSinceLastSuccess = Math.round(msSince / (1000 * 60 * 60) * 10) / 10;
            isHealthy = hoursSinceLastSuccess < ALERT_THRESHOLD_HOURS;
        } else {
            // No record at all = unhealthy (never ran or Redis was flushed)
            isHealthy = false;
        }

        return {
            operation,
            lastSuccessAt,
            lastSuccessCount: parseInt(data.lastSuccessCount || '0', 10),
            lastFailureAt: data.lastFailureAt || null,
            lastError: data.lastError || null,
            isHealthy,
            hoursSinceLastSuccess,
        };
    } catch (e) {
        return {
            operation,
            lastSuccessAt: null,
            lastSuccessCount: 0,
            lastFailureAt: null,
            lastError: `Health check failed: ${e}`,
            isHealthy: false,
            hoursSinceLastSuccess: null,
        };
    }
}

/**
 * Get health status for all tracked operations.
 */
export async function getAllHealthStatuses(): Promise<HealthStatus[]> {
    return Promise.all([
        getHealthStatus('saveRegularClose'),
        getHealthStatus('bootstrapPreviousCloses'),
        getHealthStatus('ingestLoop'),
    ]);
}

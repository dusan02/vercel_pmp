/**
 * Dead-Letter Queue (DLQ) for failed jobs
 * Uses Redis ZSET to store failed jobs with timestamps
 */

import { redisClient } from './redis';
import { logger } from './utils/logger';

export interface FailedJob {
  id: string;
  type: string;
  payload: unknown;
  error: string;
  attempts: number;
  timestamp: number;
  nextRetry?: number;
}

const DLQ_KEY = 'dlq:failed';
const DLQ_MAX_SIZE = 10000; // Maximum number of failed jobs to keep

/**
 * Add a failed job to DLQ
 */
export async function addToDLQ(
  type: string,
  payload: unknown,
  error: unknown,
  attempts: number = 1
): Promise<void> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis unavailable, cannot add to DLQ');
      return;
    }

    const jobId = `${type}:${Date.now()}:${Math.random().toString(36).substring(7)}`;
    const timestamp = Date.now();

    const failedJob: FailedJob = {
      id: jobId,
      type,
      payload,
      error: error instanceof Error ? error.message : String(error),
      attempts,
      timestamp,
      nextRetry: calculateNextRetry(attempts)
    };

    // Store in Redis ZSET with timestamp as score
    await redisClient.zAdd(DLQ_KEY, {
      score: timestamp,
      value: JSON.stringify(failedJob)
    });

    // Trim to max size (keep most recent)
    const size = await redisClient.zCard(DLQ_KEY);
    if (size > DLQ_MAX_SIZE) {
      // Remove oldest entries
      await redisClient.zRemRangeByRank(DLQ_KEY, 0, size - DLQ_MAX_SIZE);
    }

    logger.warn('Job added to DLQ', { jobId, type, attempts });
  } catch (err) {
    logger.error('Failed to add job to DLQ', err);
  }
}

/**
 * Get failed jobs from DLQ (optionally filtered by type)
 */
export async function getDLQJobs(
  type?: string,
  limit: number = 100
): Promise<FailedJob[]> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis unavailable, cannot get DLQ jobs');
      return [];
    }

    // Get most recent jobs
    const jobs = await redisClient.zRange(DLQ_KEY, -limit, -1, {
      REV: true
    });

    const failedJobs = jobs
      .map((job: string) => {
        try {
          return JSON.parse(job) as FailedJob;
        } catch (_err) {
          return null;
        }
      })
      .filter((job: FailedJob | null): job is FailedJob => job !== null);

    // Filter by type if specified
    if (type) {
      return failedJobs.filter((job: FailedJob) => job.type === type);
    }

    return failedJobs;
  } catch (err) {
    logger.error('Failed to get DLQ jobs', err);
    return [];
  }
}

/**
 * Remove job from DLQ (after successful requeue)
 */
export async function removeFromDLQ(jobId: string): Promise<void> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis unavailable, cannot remove from DLQ');
      return;
    }

    // Get all jobs and find the one to remove
    const jobs = await redisClient.zRange(DLQ_KEY, 0, -1);
    for (const job of jobs) {
      try {
        const failedJob = JSON.parse(job) as FailedJob;
        if (failedJob.id === jobId) {
          await redisClient.zRem(DLQ_KEY, job);
          logger.info('Job removed from DLQ', { jobId });
          return;
        }
      } catch {
        // Skip invalid jobs
      }
    }
  } catch (err) {
    logger.error('Failed to remove job from DLQ', err);
  }
}

/**
 * Clear all jobs from DLQ
 */
export async function clearDLQ(): Promise<number> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis unavailable, cannot clear DLQ');
      return 0;
    }

    const count = await redisClient.zCard(DLQ_KEY);
    await redisClient.del(DLQ_KEY);
    logger.info('DLQ cleared', { count });
    return count;
  } catch (err) {
    logger.error('Failed to clear DLQ', err);
    return 0;
  }
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return { total: 0, byType: {} };
    }

    const jobs = await redisClient.zRange(DLQ_KEY, 0, -1);
    const byType: Record<string, number> = {};

    for (const job of jobs) {
      try {
        const failedJob = JSON.parse(job) as FailedJob;
        byType[failedJob.type] = (byType[failedJob.type] || 0) + 1;
      } catch {
        // Skip invalid jobs
      }
    }

    return {
      total: jobs.length,
      byType
    };
  } catch (err) {
    logger.error('Failed to get DLQ stats', err);
    return { total: 0, byType: {} };
  }
}

/**
 * Calculate next retry time using exponential backoff
 */
function calculateNextRetry(attempts: number): number {
  // Exponential backoff: 1s, 5s, 20s, 60s, 300s (5min)
  const delays = [1000, 5000, 20000, 60000, 300000];
  const delay = delays[Math.min(attempts - 1, delays.length - 1)] || 300000;
  return Date.now() + delay;
}

/**
 * Check if a job should be retried based on nextRetry time
 */
export function shouldRetry(job: FailedJob): boolean {
  if (!job.nextRetry) return false;
  return Date.now() >= job.nextRetry && job.attempts < 5; // Max 5 attempts
}


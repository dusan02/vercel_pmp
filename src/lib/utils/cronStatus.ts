/**
 * Cron Status Utilities
 * Functions for tracking cron job execution status in Redis
 */

/**
 * Update cron status in Redis after successful completion
 */
export async function updateCronStatus(cronName: string = 'static_data', ttl: number = 86400): Promise<void> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      await redisClient.setEx(`cron:${cronName}:last_success_ts`, ttl, Date.now().toString());
    }
  } catch (error) {
    console.warn(`Failed to update cron status for ${cronName}:`, error);
  }
}

/**
 * Get last successful cron execution timestamp
 */
export async function getLastCronStatus(cronName: string = 'static_data'): Promise<number | null> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      const value = await redisClient.get(`cron:${cronName}:last_success_ts`);
      return value ? parseInt(value, 10) : null;
    }
  } catch (error) {
    console.warn(`Failed to get cron status for ${cronName}:`, error);
  }
  return null;
}

/**
 * Static Data Update Lock Management
 * Prevents worker from calculating percentages during static data updates
 */

/**
 * Acquire Redis lock for static data update
 * Uses owner ID for safe renewal and cleanup
 * Lock value contains: { ownerId, createdAt } as JSON for stale detection
 */
export async function acquireStaticUpdateLock(): Promise<{ acquired: boolean; ownerId: string }> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (!redisClient || !redisClient.isOpen) {
      console.warn('⚠️  Redis not available - cannot acquire lock');
      return { acquired: false, ownerId: '' };
    }

    const lockKey = 'lock:static_data_update';
    const ownerId = `static_update_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const createdAt = Date.now();
    const lockTTL = 1800; // 30 minutes max

    // Lock value: JSON with ownerId and createdAt for stale detection
    const lockValue = JSON.stringify({ ownerId, createdAt });

    // Try to set lock (SET NX EX - only if not exists, with expiration)
    console.log(`🔒 Attempting to acquire lock: ${lockKey} (TTL: ${lockTTL})`);
    const result = await redisClient.set(lockKey, lockValue, {
      EX: lockTTL,
      NX: true
    });
    console.log(`🔒 Lock acquire result for ${lockKey}: ${result}`);

    return { acquired: result === 'OK', ownerId };
  } catch (error) {
    console.warn('⚠️  Failed to acquire static update lock:', error);
    return { acquired: false, ownerId: '' };
  }
}

/**
 * Renew Redis lock (extend TTL)
 * Lock value is JSON, so we need to parse and check ownerId
 */
export async function renewStaticUpdateLock(ownerId: string): Promise<boolean> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const lockKey = 'lock:static_data_update';
    const lockTTL = 1800; // 30 minutes

    // Check if we still own the lock (parse JSON value)
    const lockValueStr = await redisClient.get(lockKey);
    if (lockValueStr) {
      try {
        const lockValue = JSON.parse(lockValueStr);
        if (lockValue.ownerId === ownerId) {
          await redisClient.expire(lockKey, lockTTL);
          return true;
        }
      } catch (parseError) {
        // Legacy format (plain ownerId string) - try direct comparison
        if (lockValueStr === ownerId) {
          await redisClient.expire(lockKey, lockTTL);
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    console.warn('⚠️  Failed to renew static update lock:', error);
    return false;
  }
}

/**
 * Release Redis lock for static data update (only if we own it)
 * Lock value is JSON, so we need to parse and check ownerId
 */
export async function releaseStaticUpdateLock(ownerId: string): Promise<void> {
  try {
    const { redisClient } = await import('@/lib/redis/client');
    if (redisClient && redisClient.isOpen) {
      const lockKey = 'lock:static_data_update';
      // Only delete if we still own the lock (parse JSON value)
      const lockValueStr = await redisClient.get(lockKey);
      if (lockValueStr) {
        try {
          const lockValue = JSON.parse(lockValueStr);
          if (lockValue.ownerId === ownerId) {
            await redisClient.del(lockKey);
          } else {
            console.warn('⚠️  Cannot release lock - not owned by this process');
          }
        } catch (parseError) {
          // Legacy format (plain ownerId string) - try direct comparison
          if (lockValueStr === ownerId) {
            await redisClient.del(lockKey);
          } else {
            console.warn('⚠️  Cannot release lock - not owned by this process');
          }
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Failed to release static update lock:', error);
  }
}

import { createClient } from 'redis';

// Redis client configuration with fallback to in-memory cache
export let redisClient: any = null;
const inMemoryCache = new Map();
const cacheTimestamps = new Map();

// Check if we're in a serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1';

// Initialize Redis client for both serverless and non-serverless environments
try {
    let redisUrl: string | null = null;

    // Priority 1: Use Upstash Redis if available (for Vercel/serverless)
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${process.env.UPSTASH_REDIS_REST_URL.replace('https://', '')}:6379`;
        console.log('🔍 Using Upstash Redis');
    }
    // Priority 2: Use REDIS_URL if set (for local/server deployments)
    else if (process.env.REDIS_URL && process.env.USE_LOCAL_REDIS !== 'false') {
        redisUrl = process.env.REDIS_URL;
        console.log('🔍 Using Redis from REDIS_URL');
    }
    // Priority 3: Use local Redis (default for server deployments, not Vercel)
    else if ((!isServerless && process.env.USE_LOCAL_REDIS !== 'false') || process.env.USE_LOCAL_REDIS === 'true') {
        redisUrl = process.env.REDIS_HOST
            ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
            : 'redis://127.0.0.1:6379';
        console.log('🔍 Using local Redis:', redisUrl);
    }

    if (redisUrl) {
        redisClient = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('Redis connection failed after 10 retries');
                        return false;
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        });

        // Connect to Redis
        redisClient.on('error', (err: Error) => {
            console.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            console.log('✅ Redis connected successfully');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis ready for operations');
        });

        // Initialize connection with timeout
        if (!redisClient.isOpen) {
            const connectPromise = redisClient.connect();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Redis connection timeout')), 3000)
            );

            Promise.race([connectPromise, timeoutPromise]).catch((err: any) => {
                console.log('⚠️ Redis not available, using in-memory cache:', err.message);
                redisClient = null;
            });
        }
    } else {
        console.log('⚠️ Redis not configured, using in-memory cache');
        redisClient = null;
    }
} catch (error) {
    console.log('⚠️ Redis not available, using in-memory cache');
    redisClient = null;
}

// Health check function
export async function checkRedisHealth(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.ping();
            return { status: 'healthy', message: 'Redis is connected and responding' };
        } else {
            return { status: 'unhealthy', message: 'Redis is not connected, using in-memory cache' };
        }
    } catch (error) {
        return { status: 'unhealthy', message: `Redis health check failed: ${error}` };
    }
}

/**
 * Create Redis subscriber client for Pub/Sub
 */
let redisSub: any = null;
let redisSubConnecting = false;
let lastRedisSubErrorLogTs = 0;
let suppressedRedisSubErrors = 0;

// Promise queue for connection attempts
let connectionPromise: Promise<any> | null = null;

export async function getRedisSubscriber(): Promise<any> {
    if (redisSub && redisSub.isOpen) return redisSub;

    // If already connecting, wait for that connection
    if (connectionPromise) {
        return connectionPromise;
    }

    if (redisSubConnecting) {
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        if (redisSub && redisSub.isOpen) return redisSub;
        return null;
    }

    try {
        let redisUrl: string | null = null;

        // Priority 1: Use Upstash Redis if available
        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${process.env.UPSTASH_REDIS_REST_URL.replace('https://', '')}:6379`;
        }
        // Priority 2: Use REDIS_URL if set
        else if (process.env.REDIS_URL) {
            redisUrl = process.env.REDIS_URL;
        }
        // Priority 3: Use local Redis (default for server deployments, not Vercel)
        else if (!isServerless || process.env.USE_LOCAL_REDIS === 'true') {
            redisUrl = process.env.REDIS_HOST
                ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
                : 'redis://127.0.0.1:6379';
        }

        if (redisUrl) {
            // Prefer duplicating the main client (shares config, avoids url parsing edge cases)
            // Fallback to a dedicated client if duplicate() is not available.
            if (redisClient && redisClient.isOpen && typeof redisClient.duplicate === 'function') {
                redisSub = redisClient.duplicate();
            } else {
                redisSub = createClient({ url: redisUrl });
            }
            redisSub.on('error', (err: any) => {
                // Throttle noisy subscriber errors to avoid log spam.
                const now = Date.now();
                const shouldLog = (now - lastRedisSubErrorLogTs) > 5000; // max 1 log / 5s
                if (!shouldLog) {
                    suppressedRedisSubErrors++;
                    return;
                }

                const suppressed = suppressedRedisSubErrors;
                suppressedRedisSubErrors = 0;
                lastRedisSubErrorLogTs = now;

                const code = err?.code ? String(err.code) : '';
                const msg = err?.message ? String(err.message) : String(err);
                const stack = err?.stack ? String(err.stack) : '';

                console.error('Redis Sub Error:', { code, message: msg, suppressed, stack: stack || undefined });

                // Only reset the subscriber on likely connection-level errors.
                const isConnError =
                    code === 'ECONNREFUSED' ||
                    code === 'ECONNRESET' ||
                    code === 'ETIMEDOUT' ||
                    msg.includes('ECONNREFUSED') ||
                    msg.includes('ECONNRESET') ||
                    msg.includes('Socket') ||
                    msg.includes('socket') ||
                    msg.includes('Connection') ||
                    msg.includes('connection');

                if (isConnError) {
                    redisSub = null;
                    redisSubConnecting = false;
                }
            });

            redisSub.on('connect', () => {
                console.log('✅ Redis Subscriber connected');
                redisSubConnecting = false;
            });

            redisSub.on('ready', () => {
                console.log('✅ Redis Subscriber ready');
            });

            if (!redisSub.isOpen) {
                redisSubConnecting = true;
                connectionPromise = redisSub.connect().then(() => {
                    redisSubConnecting = false;
                    connectionPromise = null;
                    return redisSub;
                }).catch((err: any) => {
                    console.error('Redis Sub connection failed:', err);
                    redisSub = null;
                    redisSubConnecting = false;
                    connectionPromise = null;
                    return null;
                });
                await connectionPromise;
            }
        } else {
            console.warn('⚠️ Redis not configured, subscriber not available');
            return null;
        }
    } catch (error) {
        console.error('Error creating Redis subscriber:', error);
        redisSub = null;
        redisSubConnecting = false;
    }

    return redisSub;
}

export { redisSub };

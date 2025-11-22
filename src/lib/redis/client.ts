import { createClient } from 'redis';

// Redis client configuration with fallback to in-memory cache
export let redisClient: any = null;
const inMemoryCache = new Map();
const cacheTimestamps = new Map();

// Check if we're in a serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Initialize Redis client for both serverless and non-serverless environments
try {
    // Use Upstash Redis if available
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        const redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${process.env.UPSTASH_REDIS_REST_URL.replace('https://', '')}:6379`;

        console.log('🔍 Using Upstash Redis');
        console.log('🔍 Environment check:', {
            UPSTASH_REDIS_REST_URL: 'SET',
            UPSTASH_REDIS_REST_TOKEN: 'SET'
        });

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
        console.log('⚠️ Upstash Redis not configured, using in-memory cache');
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
        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            const redisUrl = `redis://default:${process.env.UPSTASH_REDIS_REST_TOKEN}@${process.env.UPSTASH_REDIS_REST_URL.replace('https://', '')}:6379`;

            redisSub = createClient({ url: redisUrl });
            redisSub.on('error', (err: any) => {
                console.error('Redis Sub Error:', err);
                redisSub = null;
                redisSubConnecting = false;
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

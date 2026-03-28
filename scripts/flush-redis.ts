import { createClient } from 'redis';

async function main() {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    console.log(`🧹 Attempting to flush Redis at ${redisUrl}...`);
    
    const client = createClient({ url: redisUrl });
    
    client.on('error', (err) => console.log('❌ Redis Error:', err));
    
    await client.connect();
    await client.flushAll();
    console.log('✅ Redis FLUSHALL complete.');
    await client.quit();
}

main().catch(e => {
    console.error('❌ Redis flush failed:', e);
    process.exit(1);
});

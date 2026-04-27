import { redisClient } from '../src/lib/redis';

async function scanRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  const search = 'MNDT';
  const patterns = [`*${search}*`];
  
  for (const pattern of patterns) {
    console.log(`Scanning Redis for pattern: ${pattern}`);
    let cursor = 0;
    do {
      const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      for (const key of reply.keys) {
        const val = await redisClient.get(key);
        console.log(`Key: ${key}`);
        console.log(`Value: ${val}`);
      }
    } while (cursor !== 0);
  }
}

scanRedis().catch(console.error).finally(() => redisClient.quit());

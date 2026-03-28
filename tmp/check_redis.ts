import { createClient } from 'redis';

async function main() {
  const client = createClient({
    url: 'redis://localhost:6379'
  });

  await client.connect();

  const symbols = ['SRNE', 'MNDT', 'SJI', 'JWN', 'GPS', 'ATVI', 'PEAK', 'WRK'];
  
  console.log('--- Checking Redis ---');
  
  // Check universe
  const universe = await client.sMembers('universe:sp500');
  const pmpUniverse = await client.sMembers('universe:pmp');
  
  console.log(`universe:sp500 size: ${universe.length}`);
  console.log(`universe:pmp size: ${pmpUniverse.length}`);
  
  for (const symbol of symbols) {
    if (universe.includes(symbol)) console.log(`${symbol} is in universe:sp500`);
    if (pmpUniverse.includes(symbol)) console.log(`${symbol} is in universe:pmp`);
    
    // Check ticker data in Redis
    // The keys seem to be stock:pmp:SYMBOL or similar based on polygonWorker.ts
    // Wait, let's look at redis/operations.ts to be sure about the key format.
    const keys = await client.keys(`*${symbol}*`);
    console.log(`${symbol} keys:`, keys);
    
    for (const key of keys) {
      const type = await client.type(key);
      if (type === 'hash') {
        const val = await client.hGetAll(key);
        console.log(`  ${key}:`, val);
      } else if (type === 'string') {
        const val = await client.get(key);
        console.log(`  ${key}:`, val);
      }
    }
  }

  await client.disconnect();
}

main().catch(console.error);

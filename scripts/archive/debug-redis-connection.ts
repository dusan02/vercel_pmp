
import { createClient } from 'redis';

async function testRedis() {
    console.log('Testing Redis connection...');
    const client = createClient({
        url: 'redis://127.0.0.1:6379'
    });

    client.on('error', (err) => console.error('Redis Client Error', err));

    try {
        await client.connect();
        console.log('Connected successfully!');
        await client.set('test_key', 'test_value');
        const value = await client.get('test_key');
        console.log('Retrieved value:', value);
        await client.disconnect();
    } catch (error) {
        console.error('Connection failed:', error);
    }
}

testRedis();

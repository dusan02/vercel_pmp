import { bootstrapPreviousCloses } from '../src/workers/polygonWorker';
import { prisma } from '../src/lib/db/prisma';
import { getDateET } from '../src/lib/utils/dateET';
import fs from 'fs';
import path from 'path';

async function run() {
    // Manually load .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.trim().split('=');
            if (key && valueParts.length > 0) {
                process.env[key] = valueParts.join('=');
            }
        });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
        console.error('❌ POLYGON_API_KEY not found in .env.local');
        return;
    }

    console.log('🚀 Starting full bootstrap of previous closes for all tickers...');
    
    // Get all tickers from DB
    const tickers = await prisma.ticker.findMany({
        select: { symbol: true }
    });
    
    const symbols = tickers.map(t => t.symbol);
    const today = getDateET();
    
    console.log(`📊 Processing ${symbols.length} tickers for date ${today}...`);
    
    // Run bootstrap
    // Note: bootstrapPreviousCloses in polygonWorker.ts already handles batching and rate limiting
    await bootstrapPreviousCloses(symbols, apiKey, today);
    
    console.log('✅ Full bootstrap complete!');
}

run()
    .catch(err => {
        console.error('Fatal error during bootstrap:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

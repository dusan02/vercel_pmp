import { ingestBatch } from '../src/workers/polygonWorker';
import { prisma } from '../src/lib/db/prisma';
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

    console.log('🚀 Starting full market data ingestion for all tickers...');
    
    // Get all tickers from DB
    const tickers = await prisma.ticker.findMany({ 
        select: { symbol: true } 
    });
    
    console.log(`📥 Total tickers to process: ${tickers.length}`);
    
    if (tickers.length === 0) {
        console.warn('⚠️ No tickers found in database.');
        return;
    }

    const symbols = tickers.map(t => t.symbol);
    const apiKey = process.env.POLYGON_API_KEY;
    
    console.log(`🔑 Using API Key starting with: ${apiKey ? apiKey.substring(0, 5) + '...' : 'NONE'}`);

    if (!apiKey) {
        console.error('❌ POLYGON_API_KEY not found in .env.local');
        return;
    }
    
    // Ingest all
    await ingestBatch(symbols, apiKey, true); // Use force=true for manual ingest
    
    console.log('✅ Ingestion complete!');
}

run()
    .catch(err => {
        console.error('Fatal error during ingestion:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

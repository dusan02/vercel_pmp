import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';
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

    console.log('🚀 Starting full ticker metadata repair...');
    
    // Get all tickers from DB
    const tickers = await prisma.ticker.findMany({
        select: { symbol: true }
    });
    
    console.log(`📊 Processing ${tickers.length} tickers...`);
    
    let success = 0;
    let failed = 0;

    for (let i = 0; i < tickers.length; i++) {
        const symbol = tickers[i].symbol;
        process.stdout.write(`[${i + 1}/${tickers.length}] Repairing ${symbol}... `);
        
        try {
            await AnalysisService.syncTickerDetails(symbol);
            console.log('✅ Done');
            success++;
        } catch (error) {
            console.log('❌ Failed');
            console.error(`   Error repairing ${symbol}:`, error instanceof Error ? error.message : error);
            failed++;
        }

        // Wait to respect rate limits (5 requests per second for polygon basic, but we use personal key)
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`\n🎉 Full repair complete!`);
    console.log(`✅ Successfully repaired: ${success}`);
    console.log(`❌ Failed: ${failed}`);
}

run()
    .catch(err => {
        console.error('Fatal error during repair:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

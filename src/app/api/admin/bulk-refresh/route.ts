import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';

/**
 * Bulk Refresh API
 * 
 * Triggers bulk data refresh for multiple tickers with configurable strategies
 */
export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        const body = await request.json();
        const { tickers, strategy, batchSize, delayBetweenBatches, forceRefresh } = body;

        console.log('🔄 Bulk refresh request:', { 
            tickersCount: tickers?.length || 0, 
            strategy, 
            batchSize, 
            delayBetweenBatches,
            forceRefresh 
        });

        if (!tickers || !Array.isArray(tickers)) {
            return NextResponse.json({ error: 'Tickers array is required' }, { status: 400 });
        }

        const result = await triggerBulkRefresh(tickers, {
            strategy: strategy || 'sequential',
            batchSize: batchSize || 50,
            delayBetweenBatches: delayBetweenBatches || 30000,
            forceRefresh: forceRefresh || false
        });

        return NextResponse.json({
            message: 'Bulk refresh triggered successfully',
            results: result
        });

    } catch (error) {
        console.error('❌ Bulk refresh error:', error);
        return handleCronError(error, 'bulk-refresh');
    }
}

/**
 * Trigger bulk refresh with different strategies
 */
async function triggerBulkRefresh(tickers: string[], options: {
    strategy: string;
    batchSize: number;
    delayBetweenBatches: number;
    forceRefresh: boolean;
}) {
    try {
        console.log(`🔄 Starting bulk refresh with strategy: ${options.strategy}`);
        console.log(`📊 Processing ${tickers.length} tickers in batches of ${options.batchSize}`);

        const startTime = Date.now();
        let processedCount = 0;
        let errorCount = 0;
        const results: any[] = [];

        switch (options.strategy) {
            case 'sequential':
                await processSequentialBatches(tickers, options, results);
                break;
            case 'staggered':
                await processStaggeredBatches(tickers, options, results);
                break;
            case 'parallel':
                await processParallelBatches(tickers, options, results);
                break;
            default:
                throw new Error(`Unknown strategy: ${options.strategy}`);
        }

        const duration = Date.now() - startTime;
        const summary = {
            strategy: options.strategy,
            totalTickers: tickers.length,
            processedCount,
            errorCount,
            duration,
            batchSize: options.batchSize,
            delayBetweenBatches: options.delayBetweenBatches,
            forceRefresh: options.forceRefresh,
            results,
            success: errorCount === 0
        };

        console.log(`✅ Bulk refresh completed: ${processedCount}/${tickers.length} processed in ${duration}ms`);

        return summary;

    } catch (error) {
        console.error('❌ Error in bulk refresh:', error);
        throw error;
    }
}

/**
 * Process batches sequentially
 */
async function processSequentialBatches(tickers: string[], options: any, results: any[]) {
    for (let i = 0; i < tickers.length; i += options.batchSize) {
        const batch = tickers.slice(i, i + options.batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(tickers.length / options.batchSize)}: ${batch.length} tickers`);
        
        try {
            const batchResult = await processBatch(batch, options.forceRefresh);
            results.push({
                batch: Math.floor(i / options.batchSize) + 1,
                tickers: batch.length,
                success: batchResult.success,
                errors: batchResult.errors,
                duration: batchResult.duration
            });
        } catch (error: any) {
            console.error(`❌ Batch ${Math.floor(i / options.batchSize) + 1} failed:`, (error as Error).message);
            results.push({
                batch: Math.floor(i / options.batchSize) + 1,
                tickers: batch.length,
                success: false,
                errors: [(error as Error).message],
                duration: 0
            });
        }

        // Delay between batches (except for the last one)
        if (i + options.batchSize < tickers.length && options.delayBetweenBatches > 0) {
            console.log(`⏳ Waiting ${options.delayBetweenBatches / 1000}s before next batch...`);
            await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatches));
        }
    }
}

/**
 * Process batches with staggered timing
 */
async function processStaggeredBatches(tickers: string[], options: any, results: any[]) {
    // Sort tickers by priority (market cap, volume, etc.)
    const tickerDetails = await prisma.ticker.findMany({
        where: {
            symbol: { in: tickers }
        },
        select: {
            symbol: true,
            lastMarketCap: true,
            lastPrice: true,
            updatedAt: true
        },
        orderBy: { lastMarketCap: 'desc' }
    });

    // Separate into priority groups
    const highPriority = tickerDetails.filter(t => t.lastMarketCap && t.lastMarketCap > 100000).slice(0, 50);
    const mediumPriority = tickerDetails.filter(t => t.lastMarketCap && t.lastMarketCap > 10000).slice(0, 100);
    const lowPriority = tickerDetails.filter(t => !tickers.includes(t.symbol) || (!t.lastMarketCap || t.lastMarketCap <= 10000));

    // Process with different delays
    const allBatches = [
        { tickers: highPriority.map(t => t.symbol), delay: 0 },
        { tickers: mediumPriority.map(t => t.symbol), delay: 15000 },
        { tickers: lowPriority.map(t => t.symbol), delay: 30000 }
    ];

    for (const group of allBatches) {
        if (group.tickers.length === 0) continue;
        
        console.log(`📦 Processing ${group.tickers.length} ${group.delay === 0 ? 'high' : group.delay === 15000 ? 'medium' : 'low'} priority tickers`);
        
        for (let i = 0; i < group.tickers.length; i += options.batchSize) {
            const batch = group.tickers.slice(i, i + options.batchSize);
            
            try {
                const batchResult = await processBatch(batch, options.forceRefresh);
                results.push({
                    priority: group.delay === 0 ? 'high' : group.delay === 15000 ? 'medium' : 'low',
                    batch: Math.floor(i / options.batchSize) + 1,
                    tickers: batch.length,
                    success: batchResult.success,
                    errors: batchResult.errors,
                    duration: batchResult.duration
                });
            } catch (error: any) {
                console.error(`❌ Batch failed:`, (error as Error).message);
                results.push({
                    priority: group.delay === 0 ? 'high' : group.delay === 15000 ? 'medium' : 'low',
                    batch: Math.floor(i / options.batchSize) + 1,
                    tickers: batch.length,
                    success: false,
                    errors: [(error as Error).message],
                    duration: 0
                });
            }

            if (i + options.batchSize < group.tickers.length && options.delayBetweenBatches > 0) {
                await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatches));
            }
        }
    }
}

/**
 * Process batches in parallel
 */
async function processParallelBatches(tickers: string[], options: any, results: any[]) {
    const batches = [];
    for (let i = 0; i < tickers.length; i += options.batchSize) {
        batches.push(tickers.slice(i, i + options.batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches in parallel...`);

    const batchPromises = batches.map(async (batch, index) => {
        console.log(`📦 Processing parallel batch ${index + 1}/${batches.length}: ${batch.length} tickers`);
        
        try {
            const batchResult = await processBatch(batch, options.forceRefresh);
            return {
                batch: index + 1,
                tickers: batch.length,
                success: batchResult.success,
                errors: batchResult.errors,
                duration: batchResult.duration
            };
        } catch (error: any) {
            console.error(`❌ Parallel batch ${index + 1} failed:`, (error as Error).message);
            return {
                batch: index + 1,
                tickers: batch.length,
                success: false,
                errors: [(error as Error).message],
                duration: 0
            };
        }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
}

/**
 * Process a single batch of tickers
 */
async function processBatch(tickers: string[], forceRefresh: boolean) {
    const startTime = Date.now();
    const errors: string[] = [];
    let success = true;

    try {
        // This would integrate with your existing data refresh logic
        // For now, simulate the process
        
        console.log(`🔄 Processing batch: ${tickers.join(', ')}`);
        
        // Validate tickers exist
        const existingTickers = await prisma.ticker.findMany({
            where: {
                symbol: { in: tickers }
            },
            select: { symbol: true, lastMarketCap: true }
        });

        const missingTickers = tickers.filter(t => !existingTickers.some(et => et.symbol === t));
        
        if (missingTickers.length > 0) {
            errors.push(`Missing tickers: ${missingTickers.join(', ')}`);
            success = false;
        }

        // Simulate data refresh (in real implementation, this would call Polygon API)
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        const duration = Date.now() - startTime;
        
        return {
            success: success && errors.length === 0,
            errors,
            duration,
            tickersProcessed: existingTickers.length,
            missingTickers
        };

    } catch (error: any) {
        const duration = Date.now() - startTime;
        return {
            success: false,
            errors: [(error as Error).message],
            duration,
            tickersProcessed: 0,
            missingTickers: []
        };
    }
}

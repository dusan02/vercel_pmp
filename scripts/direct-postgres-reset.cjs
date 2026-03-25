#!/usr/bin/env node

/**
 * Direct PostgreSQL Reset Script
 * Uses direct database connection without Prisma caching
 */

const { PrismaClient } = require('@prisma/client');

// Direct database URL - no caching, no environment variables
const DATABASE_URL = 'postgresql://postgres:password@localhost:5432/premarketprice';

console.log('🚀 Direct PostgreSQL Reset Script');
console.log('================================');
console.log(`📊 Database: ${DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: DATABASE_URL
        }
    }
});

/**
 * Reset ticker data
 */
async function resetTickerData() {
    console.log('🔄 Starting Direct Database Reset...');
    
    try {
        // Test database connection first
        console.log('🔍 Testing database connection...');
        await prisma.$connect();
        console.log('✅ Database connection successful');
        
        // Get all tickers
        const allTickers = await prisma.ticker.findMany({
            select: { symbol: true }
        });
        
        console.log(`📋 Found ${allTickers.length} tickers in database`);
        
        // Reset ticker data
        console.log('🗑️  Resetting ticker data...');
        
        const resetResult = await prisma.ticker.updateMany({
            where: {
                symbol: {
                    in: allTickers.map(t => t.symbol)
                }
            },
            data: {
                name: null,
                sector: null,
                industry: null,
                description: null,
                employees: null,
                websiteUrl: null,
                logoUrl: null,
                lastPrice: null,
                lastMarketCap: null,
                sharesOutstanding: null,
                latestPrevClose: null,
                latestPrevCloseDate: null,
                updatedAt: new Date()
            }
        });
        
        console.log(`✅ Reset ${resetResult.count} tickers`);
        
        // Clear related tables
        console.log('🗑️  Clearing related data...');
        
        // Clear session prices
        const sessionPriceCount = await prisma.sessionPrice.count();
        if (sessionPriceCount > 0) {
            await prisma.sessionPrice.deleteMany();
            console.log(`✅ Cleared ${sessionPriceCount} session price records`);
        }
        
        // Clear daily references
        const dailyRefCount = await prisma.dailyRef.count();
        if (dailyRefCount > 0) {
            await prisma.dailyRef.deleteMany();
            console.log(`✅ Cleared ${dailyRefCount} daily reference records`);
        }
        
        console.log('🎉 Direct database reset completed!');
        
        // Get final status
        const finalCount = await prisma.ticker.count();
        console.log(`📊 Total tickers after reset: ${finalCount}`);
        
        return {
            success: true,
            tickersReset: resetResult.count,
            sessionPricesCleared: sessionPriceCount,
            dailyRefsCleared: dailyRefCount,
            totalTickers: finalCount
        };
        
    } catch (error) {
        console.error('❌ Error resetting data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Main execution function
 */
async function main() {
    try {
        const resetResult = await resetTickerData();
        
        console.log('\n📊 Reset Results:');
        console.log(`   ✅ Tickers reset: ${resetResult.tickersReset}`);
        console.log(`   ✅ Session prices cleared: ${resetResult.sessionPricesCleared}`);
        console.log(`   ✅ Daily references cleared: ${resetResult.dailyRefsCleared}`);
        console.log(`   ✅ Total tickers: ${resetResult.totalTickers}`);
        
    } catch (error) {
        console.error('\n❌ Direct database reset failed:', error.message);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run main function
if (require.main === module) {
    main();
}

module.exports = { resetTickerData };

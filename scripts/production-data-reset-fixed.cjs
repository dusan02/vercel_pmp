#!/usr/bin/env node

/**
 * Production Data Reset Script (Fixed)
 * 
 * Resets ticker data (name, sector, industry) and fetches fresh data
 * Designed for production environment with PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');

// Production database URL
const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;

if (!PROD_DATABASE_URL) {
    console.error('❌ Production database URL not found!');
    console.log('💡 Set PROD_DATABASE_URL or DATABASE_URL environment variable');
    process.exit(1);
}

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: PROD_DATABASE_URL
        }
    }
});

/**
 * Reset ticker data and fetch fresh information
 */
async function resetTickerData() {
    console.log('🔄 Starting Production Data Reset...');
    console.log(`📊 Database: ${PROD_DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
    
    try {
        // Get all tickers
        const allTickers = await prisma.ticker.findMany({
            select: { symbol: true }
        });
        
        console.log(`📋 Found ${allTickers.length} tickers in database`);
        
        // Reset ticker data
        console.log('🗑️  Resetting ticker data (name, sector, industry)...');
        
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
        
        // Clear cache entries
        console.log('🗑️  Clearing cache...');
        
        // Clear Redis cache if available
        try {
            const Redis = require('ioredis');
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
            
            await redis.flushall();
            console.log('✅ Cleared Redis cache');
            
            await redis.quit();
        } catch (error) {
            console.log('⚠️  Redis not available, skipping cache clear');
        }
        
        console.log('🎉 Data reset completed!');
        console.log('📊 Ready for fresh data import');
        
        // Get final status
        const finalCount = await prisma.ticker.count();
        console.log(`📋 Total tickers after reset: ${finalCount}`);
        
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
    console.log('🚀 Production Data Reset Script');
    console.log('================================');
    
    // Safety check
    if (!process.env.FORCE_PRODUCTION_RESET) {
        console.log('⚠️  SAFETY CHECK:');
        console.log('   This script will reset ALL ticker data on production!');
        console.log('   To proceed, set environment variable:');
        console.log('   export FORCE_PRODUCTION_RESET=true');
        console.log('');
        console.log('   Then run again:');
        console.log('   node scripts/production-data-reset-fixed.cjs');
        process.exit(1);
    }
    
    try {
        const resetResult = await resetTickerData();
        
        console.log('\n📊 Reset Results:');
        console.log(`   ✅ Tickers reset: ${resetResult.tickersReset}`);
        console.log(`   ✅ Session prices cleared: ${resetResult.sessionPricesCleared}`);
        console.log(`   ✅ Daily references cleared: ${resetResult.dailyRefsCleared}`);
        console.log(`   ✅ Total tickers: ${resetResult.totalTickers}`);
        
    } catch (error) {
        console.error('\n❌ Production data reset failed:', error.message);
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

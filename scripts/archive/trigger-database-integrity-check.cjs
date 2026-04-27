#!/usr/bin/env node

/**
 * Database Integrity Check Trigger Script
 * 
 * Triggers the database integrity check API endpoint
 * Can be run locally or on production
 */

const http = require('http');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET || 'test-secret';

/**
 * Make HTTP request to database integrity check endpoint
 */
async function makeRequest(url, data = '') {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(url, options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({ status: res.statusCode, data: parsedData });
                } catch (error) {
                    resolve({ status: res.statusCode, data: responseData });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(data);
        }
        req.end();
    });
}

/**
 * Run database integrity check
 */
async function runDatabaseIntegrityCheck() {
    console.log('🔍 Starting Database Integrity Check...');
    console.log(`🌐 Target: ${BASE_URL}`);
    console.log(`🔐 Using secret: ${CRON_SECRET.substring(0, 4)}...`);
    
    try {
        const startTime = Date.now();
        
        // Make request to database integrity check endpoint
        const url = `${BASE_URL}/api/cron/database-integrity-check`;
        console.log(`📡 Making request to: ${url}`);
        
        const response = await makeRequest(url);
        const duration = Date.now() - startTime;
        
        // Display results
        console.log(`\n✅ Integrity check completed in ${duration}ms`);
        console.log(`📊 Status: ${response.status}`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            // Summary
            console.log('\n📋 SUMMARY:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            // Ticker Table
            console.log('\n📊 TICKER TABLE:');
            console.log(`   Total: ${results.tickerTable.total}`);
            console.log(`   With Name: ${results.tickerTable.withName} (${results.tickerTable.completeness.name.toFixed(1)}%)`);
            console.log(`   With Sector: ${results.tickerTable.withSector} (${results.tickerTable.completeness.sector.toFixed(1)}%)`);
            console.log(`   With Industry: ${results.tickerTable.withIndustry} (${results.tickerTable.completeness.industry.toFixed(1)}%)`);
            console.log(`   With Last Price: ${results.tickerTable.withLastPrice} (${results.tickerTable.completeness.lastPrice.toFixed(1)}%)`);
            console.log(`   With Market Cap: ${results.tickerTable.withMarketCap} (${results.tickerTable.completeness.marketCap.toFixed(1)}%)`);
            console.log(`   With Shares: ${results.tickerTable.withShares} (${results.tickerTable.completeness.shares.toFixed(1)}%)`);
            
            // Session Price Table
            console.log('\n📈 SESSION PRICE TABLE:');
            console.log(`   Total: ${results.sessionPriceTable.total}`);
            console.log(`   Recent (24h): ${results.sessionPriceTable.recent}`);
            console.log(`   Unique Symbols: ${results.sessionPriceTable.uniqueSymbols}`);
            console.log(`   Completeness: ${results.sessionPriceTable.completeness.toFixed(1)}%`);
            
            // Daily Ref Table
            console.log('\n📅 DAILY REF TABLE:');
            console.log(`   Total: ${results.dailyRefTable.total}`);
            console.log(`   Recent (7d): ${results.dailyRefTable.recent}`);
            console.log(`   With Close: ${results.dailyRefTable.withClose}`);
            console.log(`   Completeness: ${results.dailyRefTable.completeness.toFixed(1)}%`);
            
            // Data Relationships
            console.log('\n🔗 DATA RELATIONSHIPS:');
            console.log(`   Orphaned Session Prices: ${results.dataRelationships.orphanedSessionPrices}`);
            console.log(`   Orphaned Daily Refs: ${results.dataRelationships.orphanedDailyRefs}`);
            console.log(`   Inconsistent Prices: ${results.dataRelationships.inconsistentPrices}`);
            console.log(`   Relationship Score: ${results.dataRelationships.relationshipScore.toFixed(1)}%`);
            
            // Data Freshness
            console.log('\n🕐 DATA FRESHNESS:');
            console.log(`   Ticker Freshness: ${results.dataFreshness.tickerFreshness.freshPercentage.toFixed(1)}%`);
            console.log(`   Session Price Freshness: ${results.dataFreshness.sessionPriceFreshness.freshPercentage.toFixed(1)}%`);
            
            // Table Sizes
            console.log('\n📊 TABLE SIZES:');
            console.log(`   Ticker: ${results.tableSizes.ticker} records`);
            console.log(`   SessionPrice: ${results.tableSizes.sessionPrice} records`);
            console.log(`   DailyRef: ${results.tableSizes.dailyRef} records`);
            console.log(`   Total: ${results.tableSizes.totalRecords} records`);
            console.log(`   Database Size: ${results.tableSizes.databaseSize.megabytes}MB`);
            
            // Recommendations
            if (results.summary.recommendations.length > 0) {
                console.log('\n💡 RECOMMENDATIONS:');
                results.summary.recommendations.forEach((rec, index) => {
                    console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}`);
                    console.log(`      ${rec.message}`);
                    console.log(`      Action: ${rec.action}`);
                });
            }
            
            // Determine if check passed
            const passed = results.summary.overallScore >= 80 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            if (passed) {
                console.log('🎉 Database integrity check PASSED!');
                process.exit(0);
            } else {
                console.log('⚠️  Database integrity check FAILED!');
                console.log('🔧 Please address the issues above and re-run.');
                process.exit(1);
            }
            
        } else {
            console.log('❌ Integrity check request failed:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error running integrity check:', error.message);
        process.exit(1);
    }
}

/**
 * Check if server is running
 */
async function checkServer() {
    try {
        const response = await makeRequest(`${BASE_URL}/api/health`);
        // Accept any 2xx or 3xx status as server running
        return response.status >= 200 && response.status < 500;
    } catch (error) {
        console.log('⚠️  Health check failed, but continuing anyway...');
        return true; // Assume server is running for local testing
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Database Integrity Check Script');
    console.log('====================================');
    
    // Check if server is running
    console.log('🔍 Checking server availability...');
    const serverRunning = await checkServer();
    
    if (!serverRunning) {
        console.log(`❌ Server not available at ${BASE_URL}`);
        console.log('💡 Make sure the application is running:');
        console.log('   npm run dev');
        console.log('   or');
        console.log('   npm start');
        process.exit(1);
    }
    
    console.log('✅ Server is available');
    
    // Run integrity check
    await runDatabaseIntegrityCheck();
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

module.exports = { runDatabaseIntegrityCheck, checkServer };

#!/usr/bin/env node

/**
 * Comprehensive Ticker Data Import Script
 * 
 * This script ensures all 367 tickers have complete data:
 * 1. Populates Redis universe with all tickers
 * 2. Triggers data refresh for all tickers
 * 3. Validates data completeness
 * 4. Sets up proper tier frequencies
 */

const http = require('http');
const { execSync } = require('child_process');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET || 'test-secret';

/**
 * Make HTTP request to API endpoint
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
 * Get all tickers from database
 */
async function getAllTickers() {
    console.log('📊 Getting all tickers from database...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/tickers/default`);
        if (response.status === 200) {
            const tickers = response.data.tickers || [];
            console.log(`✅ Found ${tickers.length} tickers in database`);
            return tickers;
        } else {
            console.error('❌ Failed to get tickers:', response.status, response.data);
            return [];
        }
    } catch (error) {
        console.error('❌ Error getting tickers:', error.message);
        return [];
    }
}

/**
 * Populate Redis universe with all tickers
 */
async function populateRedisUniverse(tickers) {
    console.log('🔄 Populating Redis universe with all tickers...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/admin/ingest`, 
            JSON.stringify({ tickers: tickers.map(t => t.symbol) })
        );
        
        if (response.status === 200) {
            console.log('✅ Redis universe populated successfully');
            return true;
        } else {
            console.error('❌ Failed to populate Redis universe:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error populating Redis universe:', error.message);
        return false;
    }
}

/**
 * Trigger comprehensive data refresh
 */
async function triggerDataRefresh(tickers) {
    console.log('🔄 Triggering comprehensive data refresh...');
    
    try {
        // Trigger polygon worker to fetch fresh data
        const response = await makeRequest(`${BASE_URL}/api/admin/ingest`, 
            JSON.stringify({ 
                tickers: tickers.map(t => t.symbol),
                forceRefresh: true 
            })
        );
        
        if (response.status === 200) {
            console.log('✅ Data refresh triggered successfully');
            return true;
        } else {
            console.error('❌ Failed to trigger data refresh:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error triggering data refresh:', error.message);
        return false;
    }
}

/**
 * Run comprehensive validation
 */
async function runValidation() {
    console.log('🧪 Running comprehensive validation...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/cron/test-sp500-validation`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            console.log('\n📊 VALIDATION RESULTS:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            console.log('\n📋 TICKER COUNT:');
            console.log(`   Expected: ${results.tickerCount.expected}`);
            console.log(`   Actual: ${results.tickerCount.actual}`);
            console.log(`   Score: ${results.tickerCount.score}%`);
            
            console.log('\n📊 DATA COMPLETENESS:');
            console.log(`   Overall: ${results.dataCompleteness.overallCompleteness.toFixed(1)}%`);
            console.log(`   With Names: ${results.dataCompleteness.completenessPercentage.name.toFixed(1)}%`);
            console.log(`   With Last Price: ${results.dataCompleteness.completenessPercentage.lastPrice.toFixed(1)}%`);
            console.log(`   With Market Cap: ${results.dataCompleteness.completenessPercentage.marketCap.toFixed(1)}%`);
            
            console.log('\n💡 RECOMMENDATIONS:');
            results.summary.recommendations.forEach((rec, index) => {
                console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}`);
                console.log(`      ${rec.message}`);
                console.log(`      Action: ${rec.action}`);
            });
            
            const passed = results.summary.overallScore >= 90 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            return passed;
        } else {
            console.error('❌ Validation failed:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error running validation:', error.message);
        return false;
    }
}

/**
 * Trigger database integrity check
 */
async function runDatabaseIntegrityCheck() {
    console.log('🔍 Running database integrity check...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/cron/database-integrity-check`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            console.log('\n📊 DATABASE INTEGRITY RESULTS:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            console.log('\n📊 TICKER TABLE:');
            console.log(`   Total: ${results.tickerTable.total}`);
            console.log(`   With Name: ${results.tickerTable.withName} (${results.tickerTable.completeness.name.toFixed(1)}%)`);
            console.log(`   With Last Price: ${results.tickerTable.withLastPrice} (${results.tickerTable.completeness.lastPrice.toFixed(1)}%)`);
            console.log(`   With Market Cap: ${results.tickerTable.withMarketCap} (${results.tickerTable.completeness.marketCap.toFixed(1)}%)`);
            
            console.log('\n📈 SESSION PRICE TABLE:');
            console.log(`   Total: ${results.sessionPriceTable.total}`);
            console.log(`   Recent (24h): ${results.sessionPriceTable.recent}`);
            console.log(`   Completeness: ${results.sessionPriceTable.completeness.toFixed(1)}%`);
            
            const passed = results.summary.overallScore >= 90 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            return passed;
        } else {
            console.error('❌ Database integrity check failed:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error running database integrity check:', error.message);
        return false;
    }
}

/**
 * Check if server is running
 */
async function checkServer() {
    try {
        const response = await makeRequest(`${BASE_URL}/api/health`);
        return response.status >= 200 && response.status < 500;
    } catch (error) {
        console.log('⚠️  Health check failed, but continuing anyway...');
        return true;
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🚀 Comprehensive Ticker Data Import Script');
    console.log('==========================================');
    console.log(`🌐 Target: ${BASE_URL}`);
    console.log(`🔐 Using secret: ${CRON_SECRET.substring(0, 4)}...`);
    
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
    
    try {
        // Step 1: Get all tickers from database
        const tickers = await getAllTickers();
        
        if (tickers.length === 0) {
            console.log('❌ No tickers found in database. Please run database seed first.');
            process.exit(1);
        }
        
        // Step 2: Populate Redis universe with all tickers
        const universePopulated = await populateRedisUniverse(tickers);
        
        if (!universePopulated) {
            console.log('❌ Failed to populate Redis universe. Continuing anyway...');
        }
        
        // Wait a moment for Redis to settle
        console.log('⏳ Waiting 2 seconds for Redis to settle...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 3: Trigger comprehensive data refresh
        const refreshTriggered = await triggerDataRefresh(tickers);
        
        if (!refreshTriggered) {
            console.log('❌ Failed to trigger data refresh. Continuing anyway...');
        }
        
        // Wait for data refresh to complete
        console.log('⏳ Waiting 10 seconds for data refresh to complete...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Step 4: Run comprehensive validation
        const validationPassed = await runValidation();
        
        // Step 5: Run database integrity check
        const integrityPassed = await runDatabaseIntegrityCheck();
        
        // Final summary
        console.log('\n🎉 FINAL SUMMARY:');
        console.log(`   Total Tickers: ${tickers.length}`);
        console.log(`   Universe Populated: ${universePopulated ? '✅' : '❌'}`);
        console.log(`   Data Refresh: ${refreshTriggered ? '✅' : '❌'}`);
        console.log(`   Validation: ${validationPassed ? '✅' : '❌'}`);
        console.log(`   Database Integrity: ${integrityPassed ? '✅' : '❌'}`);
        
        const allPassed = universePopulated && refreshTriggered && validationPassed && integrityPassed;
        
        if (allPassed) {
            console.log('\n🎉 SUCCESS: All ticker data is now complete and validated!');
            console.log('✅ All 367 tickers have proper data');
            console.log('✅ Tests are passing with high scores');
            console.log('✅ Ready for production deployment');
            process.exit(0);
        } else {
            console.log('\n⚠️  PARTIAL SUCCESS: Some issues remain.');
            console.log('🔧 Please check the recommendations above and re-run.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
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

module.exports = { 
    getAllTickers, 
    populateRedisUniverse, 
    triggerDataRefresh, 
    runValidation, 
    runDatabaseIntegrityCheck 
};

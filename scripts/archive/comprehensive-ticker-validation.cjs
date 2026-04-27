#!/usr/bin/env node

/**
 * Comprehensive Ticker Validation Test Script
 * 
 * Tests ALL tickers in database (not just SP500)
 * Validates data completeness, consistency, and quality
 */

const http = require('http');

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
 * Run comprehensive ticker validation
 */
async function runComprehensiveValidation() {
    console.log('🧪 Starting Comprehensive Ticker Validation...');
    console.log(`🌐 Target: ${BASE_URL}`);
    console.log(`🔐 Using secret: ${CRON_SECRET.substring(0, 4)}...`);
    
    try {
        const startTime = Date.now();
        
        // Make request to comprehensive validation endpoint
        const url = `${BASE_URL}/api/cron/comprehensive-ticker-validation`;
        console.log(`📡 Making request to: ${url}`);
        
        const response = await makeRequest(url);
        const duration = Date.now() - startTime;
        
        // Display results
        console.log(`\n✅ Comprehensive validation completed in ${duration}ms`);
        console.log(`📊 Status: ${response.status}`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            // Summary
            console.log('\n📋 COMPREHENSIVE SUMMARY:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            // Ticker Count
            console.log('\n📊 TICKER COUNT:');
            console.log(`   Total: ${results.tickerCount.total}`);
            console.log(`   Large Cap: ${results.tickerCount.largeCap} (${results.tickerCount.distribution.largeCap.toFixed(1)}%)`);
            console.log(`   Mid Cap: ${results.tickerCount.midCap} (${results.tickerCount.distribution.midCap.toFixed(1)}%)`);
            console.log(`   Small Cap: ${results.tickerCount.smallCap} (${results.tickerCount.distribution.smallCap.toFixed(1)}%)`);
            
            // Data Completeness
            console.log('\n📊 DATA COMPLETENESS:');
            console.log(`   Overall: ${results.dataCompleteness.overallCompleteness.toFixed(1)}%`);
            console.log(`   With Names: ${results.dataCompleteness.withName} (${results.dataCompleteness.completenessPercentage.name.toFixed(1)}%)`);
            console.log(`   With Sectors: ${results.dataCompleteness.withSector} (${results.dataCompleteness.completenessPercentage.sector.toFixed(1)}%)`);
            console.log(`   With Industries: ${results.dataCompleteness.withIndustry} (${results.dataCompleteness.completenessPercentage.industry.toFixed(1)}%)`);
            console.log(`   With Last Price: ${results.dataCompleteness.withLastPrice} (${results.dataCompleteness.completenessPercentage.lastPrice.toFixed(1)}%)`);
            console.log(`   With Market Cap: ${results.dataCompleteness.withMarketCap} (${results.dataCompleteness.completenessPercentage.marketCap.toFixed(1)}%)`);
            console.log(`   With Shares: ${results.dataCompleteness.withShares} (${results.dataCompleteness.completenessPercentage.shares.toFixed(1)}%)`);
            
            // Data Consistency
            console.log('\n🔍 DATA CONSISTENCY:');
            console.log(`   Consistency Score: ${results.dataConsistency.consistencyScore.toFixed(1)}%`);
            console.log(`   Inconsistencies: ${results.dataConsistency.inconsistencies.length}`);
            
            if (results.dataConsistency.inconsistencies.length > 0) {
                console.log('\n⚠️  INCONSISTENCIES FOUND:');
                results.dataConsistency.inconsistencies.slice(0, 10).forEach((inc, index) => {
                    console.log(`   ${index + 1}. ${inc.symbol}: ${inc.type} - ${inc.message}`);
                });
                
                if (results.dataConsistency.inconsistencies.length > 10) {
                    console.log(`   ... and ${results.dataConsistency.inconsistencies.length - 10} more`);
                }
            }
            
            // Data Freshness
            console.log('\n🕐 DATA FRESHNESS:');
            console.log(`   Last Hour: ${results.dataFreshness.freshnessScore.lastHour.toFixed(1)}%`);
            console.log(`   Last Day: ${results.dataFreshness.freshnessScore.lastDay.toFixed(1)}%`);
            console.log(`   Last Week: ${results.dataFreshness.freshnessScore.lastWeek.toFixed(1)}%`);
            
            // Market Distribution
            console.log('\n🏭 MARKET DISTRIBUTION:');
            console.log(`   Total Sectors: ${results.marketDistribution.totalSectors}`);
            console.log(`   Total Industries: ${results.marketDistribution.totalIndustries}`);
            
            if (results.marketDistribution.topSectors.length > 0) {
                console.log('\n📊 TOP 10 SECTORS:');
                results.marketDistribution.topSectors.forEach((sector, index) => {
                    console.log(`   ${index + 1}. ${sector[0]}: ${sector[1]} tickers`);
                });
            }
            
            // Recommendations
            if (results.summary.recommendations.length > 0) {
                console.log('\n💡 RECOMMENDATIONS:');
                results.summary.recommendations.forEach((rec, index) => {
                    console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}`);
                    console.log(`      ${rec.message}`);
                    console.log(`      Action: ${rec.action}`);
                });
            }
            
            // Assessment
            console.log('\n📈 ASSESSMENT:');
            console.log(`   Ticker Coverage: ${results.summary.assessment.tickerCoverage}`);
            console.log(`   Data Quality: ${results.summary.assessment.dataQuality}`);
            console.log(`   Data Freshness: ${results.summary.assessment.dataFreshness}`);
            console.log(`   Market Distribution: ${results.summary.assessment.marketDistribution}`);
            
            // Determine if check passed
            const passed = results.summary.overallScore >= 80 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            if (passed) {
                console.log('🎉 Comprehensive ticker validation PASSED!');
                console.log('✅ All tickers have good data quality');
                console.log('✅ System is ready for production');
                process.exit(0);
            } else {
                console.log('⚠️  Comprehensive ticker validation FAILED!');
                console.log('🔧 Please address the issues above and re-run.');
                process.exit(1);
            }
            
        } else {
            console.log('❌ Comprehensive validation request failed:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error running comprehensive validation:', error.message);
        process.exit(1);
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
    console.log('🚀 Comprehensive Ticker Validation Script');
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
    
    // Run comprehensive validation
    await runComprehensiveValidation();
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

module.exports = { runComprehensiveValidation, checkServer };

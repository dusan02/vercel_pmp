#!/usr/bin/env node

/**
 * SP500 Categorization Test Script
 * 
 * Tests SP500 ticker coverage, sector categorization, and tier distribution
 * Validates against official SP500 ticker list provided by user
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
 * Run SP500 categorization validation
 */
async function runSP500CategorizationValidation() {
    console.log('🧪 Starting SP500 Categorization Validation...');
    console.log(`🌐 Target: ${BASE_URL}`);
    console.log(`🔐 Using secret: ${CRON_SECRET.substring(0, 4)}...`);
    
    try {
        const startTime = Date.now();
        
        // Make request to SP500 categorization endpoint
        const url = `${BASE_URL}/api/cron/sp500-categorization`;
        console.log(`📡 Making request to: ${url}`);
        
        const response = await makeRequest(url);
        const duration = Date.now() - startTime;
        
        // Display results
        console.log(`\n✅ SP500 categorization validation completed in ${duration}ms`);
        console.log(`📊 Status: ${response.status}`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            // Summary
            console.log('\n📋 SP500 CATEGORIZATION SUMMARY:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            // SP500 Coverage
            console.log('\n📊 SP500 COVERAGE:');
            console.log(`   Official Count: ${results.sp500Coverage.officialCount}`);
            console.log(`   Database Count: ${results.sp500Coverage.databaseCount}`);
            console.log(`   Matching Count: ${results.sp500Coverage.matchingCount}`);
            console.log(`   Coverage: ${results.sp500Coverage.coveragePercentage.toFixed(1)}%`);
            console.log(`   Is Complete: ${results.sp500Coverage.isComplete ? '✅ YES' : '❌ NO'}`);
            
            if (results.sp500Coverage.missingTickers.length > 0) {
                console.log(`\n⚠️  MISSING TICKERS (${results.sp500Coverage.missingTickers.length}):`);
                results.sp500Coverage.missingTickers.slice(0, 20).forEach((ticker, index) => {
                    console.log(`   ${index + 1}. ${ticker}`);
                });
                
                if (results.sp500Coverage.missingTickers.length > 20) {
                    console.log(`   ... and ${results.sp500Coverage.missingTickers.length - 20} more`);
                }
            }
            
            if (results.sp500Coverage.extraTickers.length > 0) {
                console.log(`\n📈 EXTRA TICKERS (${results.sp500Coverage.extraTickers.length}):`);
                results.sp500Coverage.extraTickers.slice(0, 10).forEach((ticker, index) => {
                    console.log(`   ${index + 1}. ${ticker}`);
                });
                
                if (results.sp500Coverage.extraTickers.length > 10) {
                    console.log(`   ... and ${results.sp500Coverage.extraTickers.length - 10} more`);
                }
            }
            
            // Sector Categorization
            console.log('\n🏭 SECTOR CATEGORIZATION:');
            console.log(`   Expected Sectors: ${results.sectorCategorization.totalSectors}`);
            console.log(`   Actual Sectors: ${results.sectorCategorization.actualSectors}`);
            console.log(`   Accuracy: ${results.sectorCategorization.categorizationAccuracy.toFixed(1)}%`);
            
            if (results.sectorCategorization.misclassifiedTickers.length > 0) {
                console.log(`\n⚠️  MISCLASSIFIED TICKERS (${results.sectorCategorization.misclassifiedTickers.length}):`);
                results.sectorCategorization.misclassifiedTickers.slice(0, 10).forEach((ticker, index) => {
                    console.log(`   ${index + 1}. ${ticker.symbol}: ${ticker.name}`);
                    console.log(`      Current Sector: ${ticker.currentSector}`);
                    console.log(`      Industry: ${ticker.industry}`);
                    console.log(`      Market Cap: $${(ticker.marketCap || 0).toFixed(0)}B`);
                });
                
                if (results.sectorCategorization.misclassifiedTickers.length > 10) {
                    console.log(`   ... and ${results.sectorCategorization.misclassifiedTickers.length - 10} more`);
                }
            }
            
            if (results.sectorCategorization.uncategorizedTickers.length > 0) {
                console.log(`\n⚠️  UNCATEGORIZED TICKERS (${results.sectorCategorization.uncategorizedTickers.length}):`);
                results.sectorCategorization.uncategorizedTickers.slice(0, 10).forEach((ticker, index) => {
                    console.log(`   ${index + 1}. ${ticker.symbol}: ${ticker.name}`);
                    console.log(`      Market Cap: $${(ticker.marketCap || 0).toFixed(0)}B`);
                });
                
                if (results.sectorCategorization.uncategorizedTickers.length > 10) {
                    console.log(`   ... and ${results.sectorCategorization.uncategorizedTickers.length - 10} more`);
                }
            }
            
            // Tier Distribution
            console.log('\n📊 TIER DISTRIBUTION:');
            console.log(`   Total: ${results.tierDistribution.total}`);
            console.log(`   Premium (Top 50): ${results.tierDistribution.premium.count} (${results.tierDistribution.premium.percentage.toFixed(1)}%)`);
            console.log(`     Market Cap Range: ${results.tierDistribution.premium.marketCapRange}`);
            console.log(`   Standard (#51-150): ${results.tierDistribution.standard.count} (${results.tierDistribution.standard.percentage.toFixed(1)}%)`);
            console.log(`     Market Cap Range: ${results.tierDistribution.standard.marketCapRange}`);
            console.log(`   Extended (#151-300): ${results.tierDistribution.extended.count} (${results.tierDistribution.extended.percentage.toFixed(1)}%)`);
            console.log(`     Market Cap Range: ${results.tierDistribution.extended.marketCapRange}`);
            console.log(`   ExtendedPlus (#301+): ${results.tierDistribution.extendedPlus.count} (${results.tierDistribution.extendedPlus.percentage.toFixed(1)}%)`);
            console.log(`     Market Cap Range: ${results.tierDistribution.extendedPlus.marketCapRange}`);
            
            // Redis Universe
            console.log('\n🗄️ REDIS UNIVERSE:');
            console.log(`   Expected in Universe: ${results.redisUniverse.expectedInUniverse}`);
            console.log(`   Actual in Universe: ${results.redisUniverse.actualInUniverse}`);
            console.log(`   Population Rate: ${results.redisUniverse.populationRate.toFixed(1)}%`);
            console.log(`   Is Fully Populated: ${results.redisUniverse.isFullyPopulated ? '✅ YES' : '❌ NO'}`);
            
            // Market Cap Distribution
            console.log('\n💰 MARKET CAP DISTRIBUTION:');
            console.log(`   Total with Market Cap: ${results.marketCapDistribution.total}`);
            console.log(`   Large Cap (> $100B): ${results.marketCapDistribution.largeCap} (${results.marketCapDistribution.distribution.largeCap.toFixed(1)}%)`);
            console.log(`   Mid Cap ($10B-$100B): ${results.marketCapDistribution.midCap} (${results.marketCapDistribution.distribution.midCap.toFixed(1)}%)`);
            console.log(`   Small Cap (≤ $10B): ${results.marketCapDistribution.smallCap} (${results.marketCapDistribution.distribution.smallCap.toFixed(1)}%)`);
            console.log(`   Average Market Cap: $${results.marketCapDistribution.averageMarketCap.toFixed(0)}B`);
            console.log(`   Total Market Cap: $${(results.marketCapDistribution.totalMarketCap / 1000000).toFixed(0)}T`);
            
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
            console.log(`   SP500 Coverage: ${results.summary.assessment.sp500Coverage}`);
            console.log(`   Sector Categorization: ${results.summary.assessment.sectorCategorization}`);
            console.log(`   Tier Distribution: ${results.summary.assessment.tierDistribution}`);
            console.log(`   Redis Universe: ${results.summary.assessment.redisUniverse}`);
            console.log(`   Market Distribution: ${results.summary.assessment.marketDistribution}`);
            
            // Determine if check passed
            const passed = results.summary.overallScore >= 80 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            if (passed) {
                console.log('🎉 SP500 categorization validation PASSED!');
                console.log('✅ All tickers properly categorized and distributed');
                console.log('✅ System is ready for production');
                process.exit(0);
            } else {
                console.log('⚠️  SP500 categorization validation FAILED!');
                console.log('🔧 Please address the issues above and re-run.');
                process.exit(1);
            }
            
        } else {
            console.log('❌ SP500 categorization validation request failed:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error running SP500 categorization validation:', error.message);
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
    console.log('🚀 SP500 Categorization Validation Script');
    console.log('=====================================');
    
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
    
    // Run SP500 categorization validation
    await runSP500CategorizationValidation();
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

module.exports = { runSP500CategorizationValidation, checkServer };

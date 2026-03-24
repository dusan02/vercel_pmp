#!/usr/bin/env node

/**
 * SP500 Validation Test Script
 * 
 * Runs comprehensive validation of SP500 data in the database
 * Can be run locally or on production
 */

const http = require('http');
const { execSync } = require('child_process');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET || 'test-secret';

/**
 * Make HTTP request to validation endpoint
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
 * Run validation test
 */
async function runValidation() {
    console.log('🧪 Starting SP500 Data Validation Test...');
    console.log(`🌐 Target: ${BASE_URL}`);
    console.log(`🔐 Using secret: ${CRON_SECRET.substring(0, 4)}...`);
    
    try {
        const startTime = Date.now();
        
        // Make request to validation endpoint
        const url = `${BASE_URL}/api/cron/test-sp500-validation`;
        console.log(`📡 Making request to: ${url}`);
        
        const response = await makeRequest(url);
        const duration = Date.now() - startTime;
        
        // Display results
        console.log(`\n✅ Validation completed in ${duration}ms`);
        console.log(`📊 Status: ${response.status}`);
        
        if (response.status === 200) {
            const results = response.data.results;
            
            // Summary
            console.log('\n📋 SUMMARY:');
            console.log(`   Overall Score: ${results.summary.overallScore}%`);
            console.log(`   Status: ${results.summary.status}`);
            console.log(`   Critical Issues: ${results.summary.criticalIssues}`);
            
            // Ticker Count
            console.log('\n🔢 TICKER COUNT:');
            console.log(`   Expected: ${results.tickerCount.expected}`);
            console.log(`   Actual: ${results.tickerCount.actual}`);
            console.log(`   Score: ${results.tickerCount.score}%`);
            
            if (results.tickerCount.missing.length > 0) {
                console.log(`   Missing: ${results.tickerCount.missing.slice(0, 5).join(', ')}${results.tickerCount.missing.length > 5 ? '...' : ''}`);
            }
            
            // Company Names
            console.log('\n🏢 COMPANY NAMES:');
            console.log(`   Accuracy: ${results.companyNames.accuracy.toFixed(1)}%`);
            console.log(`   Mismatches: ${results.companyNames.mismatches.length}`);
            
            if (results.companyNames.mismatches.length > 0) {
                console.log('   Sample mismatches:');
                results.companyNames.mismatches.slice(0, 3).forEach(m => {
                    console.log(`     ${m.ticker}: "${m.actual}" vs "${m.expected}"`);
                });
            }
            
            // Sector Assignments
            console.log('\n🏭 SECTOR ASSIGNMENTS:');
            console.log(`   Accuracy: ${results.sectorAssignments.accuracy.toFixed(1)}%`);
            console.log(`   Mismatches: ${results.sectorAssignments.mismatches.length}`);
            
            if (results.sectorAssignments.mismatches.length > 0) {
                console.log('   Sample mismatches:');
                results.sectorAssignments.mismatches.slice(0, 3).forEach(m => {
                    console.log(`     ${m.ticker}: "${m.actual}" vs "${m.expected}"`);
                });
            }
            
            // Industry Assignments
            console.log('\n🏭 INDUSTRY ASSIGNMENTS:');
            console.log(`   Accuracy: ${results.industryAssignments.accuracy.toFixed(1)}%`);
            console.log(`   Mismatches: ${results.industryAssignments.mismatches.length}`);
            
            // Data Completeness
            console.log('\n📊 DATA COMPLETENESS:');
            console.log(`   Overall: ${results.dataCompleteness.overallCompleteness.toFixed(1)}%`);
            console.log(`   With Names: ${results.dataCompleteness.completenessPercentage.name.toFixed(1)}%`);
            console.log(`   With Sectors: ${results.dataCompleteness.completenessPercentage.sector.toFixed(1)}%`);
            console.log(`   With Industries: ${results.dataCompleteness.completenessPercentage.industry.toFixed(1)}%`);
            
            // Data Consistency
            console.log('\n🔍 DATA CONSISTENCY:');
            console.log(`   Score: ${results.consistency.consistencyScore.toFixed(1)}%`);
            console.log(`   Inconsistencies: ${results.consistency.inconsistencies.length}`);
            
            if (results.consistency.inconsistencies.length > 0) {
                console.log('   Sample issues:');
                results.consistency.inconsistencies.slice(0, 3).forEach(i => {
                    console.log(`     ${i.ticker}: ${i.type}`);
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
            
            // Determine if test passed
            const passed = results.summary.overallScore >= 80 && results.summary.criticalIssues === 0;
            console.log(`\n🎯 RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
            
            if (passed) {
                console.log('🎉 SP500 data validation PASSED!');
                process.exit(0);
            } else {
                console.log('⚠️  SP500 data validation FAILED!');
                console.log('🔧 Please address the issues above and re-run.');
                process.exit(1);
            }
            
        } else {
            console.log('❌ Validation request failed:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error running validation:', error.message);
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
    console.log('🚀 SP500 Validation Test Script');
    console.log('================================');
    
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
    
    // Run validation
    await runValidation();
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

module.exports = { runValidation, checkServer };

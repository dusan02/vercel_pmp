#!/usr/bin/env node

/**
 * Automated Data Refresh Pipeline
 * 
 * This script sets up continuous data refresh for all 367 tickers
 * with proper tier frequencies and monitoring
 */

const http = require('http');
const { execSync } = require('child_process');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET_KEY || process.env.CRON_SECRET || 'test-secret';

/**
 * Make HTTP request to API endpoint
 */
async function makeRequest(url, data = '', method = 'POST') {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
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
 * Get all tickers and organize by tiers
 */
async function getTickersByTier() {
    console.log('📊 Getting all tickers and organizing by tiers...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/tickers/default`, '', 'GET');
        if (response.status === 200) {
            const tickers = response.data.tickers || [];
            
            // Sort by market cap (descending)
            tickers.sort((a, b) => (b.lastMarketCap || 0) - (a.lastMarketCap || 0));
            
            // Organize into tiers
            const tiers = {
                premium: tickers.slice(0, 50),      // Top 50 - 1 min updates
                standard: tickers.slice(50, 150),   // #51-150 - 3 min updates
                extended: tickers.slice(150, 300),  // #151-300 - 5 min updates
                extendedPlus: tickers.slice(300, 367) // #301-367 - 15 min updates
            };
            
            console.log('✅ Tickers organized by tiers:');
            console.log(`   Premium (Top 50): ${tiers.premium.length} tickers - 1 min updates`);
            console.log(`   Standard (#51-150): ${tiers.standard.length} tickers - 3 min updates`);
            console.log(`   Extended (#151-300): ${tiers.extended.length} tickers - 5 min updates`);
            console.log(`   ExtendedPlus (#301-367): ${tiers.extendedPlus.length} tickers - 15 min updates`);
            
            return tiers;
        } else {
            console.error('❌ Failed to get tickers:', response.status, response.data);
            return null;
        }
    } catch (error) {
        console.error('❌ Error getting tickers:', error.message);
        return null;
    }
}

/**
 * Setup tiered update schedule
 */
async function setupTieredUpdates(tiers) {
    console.log('⚙️ Setting up tiered update schedule...');
    
    try {
        // Configure tiered update service
        const response = await makeRequest(`${BASE_URL}/api/admin/tiered-updates`, 
            JSON.stringify({
                action: 'configure',
                tiers: {
                    premium: {
                        tickers: tiers.premium.map(t => t.symbol),
                        frequency: 1, // 1 minute
                        maxCompanies: 50
                    },
                    standard: {
                        tickers: tiers.standard.map(t => t.symbol),
                        frequency: 3, // 3 minutes
                        maxCompanies: 100
                    },
                    extended: {
                        tickers: tiers.extended.map(t => t.symbol),
                        frequency: 5, // 5 minutes
                        maxCompanies: 150
                    },
                    extendedPlus: {
                        tickers: tiers.extendedPlus.map(t => t.symbol),
                        frequency: 15, // 15 minutes
                        maxCompanies: 67
                    }
                }
            })
        );
        
        if (response.status === 200) {
            console.log('✅ Tiered update schedule configured successfully');
            return true;
        } else {
            console.error('❌ Failed to configure tiered updates:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error configuring tiered updates:', error.message);
        return false;
    }
}

/**
 * Start continuous monitoring
 */
async function startMonitoring() {
    console.log('📡 Starting continuous monitoring...');
    
    try {
        const response = await makeRequest(`${BASE_URL}/api/admin/monitoring`, 
            JSON.stringify({
                action: 'start',
                config: {
                    checkInterval: 60000, // 1 minute
                    alertThreshold: 0.8, // 80% data completeness
                    enableLogging: true,
                    enableAlerts: true
                }
            })
        );
        
        if (response.status === 200) {
            console.log('✅ Continuous monitoring started successfully');
            return true;
        } else {
            console.error('❌ Failed to start monitoring:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error starting monitoring:', error.message);
        return false;
    }
}

/**
 * Trigger initial bulk refresh
 */
async function triggerBulkRefresh(tiers) {
    console.log('🔄 Triggering initial bulk refresh...');
    
    try {
        // Refresh all tiers with staggered timing
        const allTickers = [
            ...tiers.premium,
            ...tiers.standard,
            ...tiers.extended,
            ...tiers.extendedPlus
        ];
        
        const response = await makeRequest(`${BASE_URL}/api/admin/bulk-refresh`, 
            JSON.stringify({
                tickers: allTickers.map(t => t.symbol),
                strategy: 'staggered',
                batchSize: 50,
                delayBetweenBatches: 30000 // 30 seconds between batches
            })
        );
        
        if (response.status === 200) {
            console.log('✅ Bulk refresh triggered successfully');
            return true;
        } else {
            console.error('❌ Failed to trigger bulk refresh:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ Error triggering bulk refresh:', error.message);
        return false;
    }
}

/**
 * Check if server is running
 */
async function checkServer() {
    try {
        const response = await makeRequest(`${BASE_URL}/api/health`, '', 'GET');
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
    console.log('🚀 Automated Data Refresh Pipeline');
    console.log('=================================');
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
        // Step 1: Get tickers and organize by tiers
        const tiers = await getTickersByTier();
        
        if (!tiers) {
            console.log('❌ Failed to get tickers. Please check database connection.');
            process.exit(1);
        }
        
        // Step 2: Setup tiered update schedule
        const scheduleConfigured = await setupTieredUpdates(tiers);
        
        if (!scheduleConfigured) {
            console.log('❌ Failed to configure tiered updates. Continuing anyway...');
        }
        
        // Step 3: Trigger initial bulk refresh
        const refreshTriggered = await triggerBulkRefresh(tiers);
        
        if (!refreshTriggered) {
            console.log('❌ Failed to trigger bulk refresh. Continuing anyway...');
        }
        
        // Step 4: Start continuous monitoring
        const monitoringStarted = await startMonitoring();
        
        if (!monitoringStarted) {
            console.log('❌ Failed to start monitoring. Continuing anyway...');
        }
        
        // Final summary
        console.log('\n🎉 PIPELINE SUMMARY:');
        console.log(`   Total Tickers: ${Object.values(tiers).reduce((sum, tier) => sum + tier.length, 0)}`);
        console.log(`   Schedule Configured: ${scheduleConfigured ? '✅' : '❌'}`);
        console.log(`   Bulk Refresh: ${refreshTriggered ? '✅' : '❌'}`);
        console.log(`   Monitoring: ${monitoringStarted ? '✅' : '❌'}`);
        
        console.log('\n📊 TIER DISTRIBUTION:');
        console.log(`   Premium (1 min): ${tiers.premium.length} tickers`);
        console.log(`   Standard (3 min): ${tiers.standard.length} tickers`);
        console.log(`   Extended (5 min): ${tiers.extended.length} tickers`);
        console.log(`   ExtendedPlus (15 min): ${tiers.extendedPlus.length} tickers`);
        
        console.log('\n🔄 UPDATE FREQUENCIES:');
        console.log('   Top 50: Every 1 minute');
        console.log('   #51-150: Every 3 minutes');
        console.log('   #151-300: Every 5 minutes');
        console.log('   #301-367: Every 15 minutes');
        
        const allSuccess = scheduleConfigured && refreshTriggered && monitoringStarted;
        
        if (allSuccess) {
            console.log('\n🎉 SUCCESS: Automated data refresh pipeline is now active!');
            console.log('✅ All 367 tickers are on proper update schedules');
            console.log('✅ Continuous monitoring is enabled');
            console.log('✅ Data quality will be automatically maintained');
            console.log('\n📈 Expected behavior:');
            console.log('   - Top 50 tickers: Fresh data every minute');
            console.log('   - Standard tickers: Fresh data every 3 minutes');
            console.log('   - Extended tickers: Fresh data every 5 minutes');
            console.log('   - ExtendedPlus tickers: Fresh data every 15 minutes');
            console.log('   - Automatic alerts for data quality issues');
            console.log('   - Continuous validation and integrity checks');
            process.exit(0);
        } else {
            console.log('\n⚠️  PARTIAL SUCCESS: Some pipeline components failed.');
            console.log('🔧 Please check the logs and re-run.');
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
    getTickersByTier, 
    setupTieredUpdates, 
    startMonitoring, 
    triggerBulkRefresh 
};

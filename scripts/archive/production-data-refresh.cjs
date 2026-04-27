#!/usr/bin/env node

/**
 * Production Data Refresh Script
 * 
 * Fetches fresh data for all tickers from multiple sources
 * Updates names, sectors, industries, prices, and market caps
 */

const { PrismaClient } = require('@prisma/client');

// Production database URL
const PROD_DATABASE_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: PROD_DATABASE_URL
        }
    }
});

// Polygon API configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Sector mapping based on ticker patterns
const SECTOR_MAPPING = {
    'Technology': [
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'NVDA', 'META', 'AVGO', 'CRM', 'ADBE', 'NFLX',
        'INTC', 'AMD', 'TXN', 'CSCO', 'PYPL', 'INTU', 'QCOM', 'NOW', 'MU', 'AMAT',
        'IBM', 'ORCL', 'ACN', 'CTSH', 'SNPS', 'CDNS', 'ANET', 'LRCX', 'KLAC', 'ADI',
        'MRVL', 'XLNX', 'MCHP', 'TXN', 'NXPI', 'SWKS', 'TER', 'CRWD', 'PANW', 'FTNT',
        'ZS', 'OKTA', 'SNOW', 'DOCU', 'PLTR', 'UPST', 'COIN', 'SQ', 'SHOP', 'DDOG',
        'NET', 'ZS', 'CLOV', 'WIX', 'TWLO', 'ZM', 'PTC', 'VRSN', 'NTAP', 'CDW',
        'SPLK', 'LOGI', 'GRMN', 'HUBS', 'TTD', 'SOLV', 'GDDY'
    ],
    'Financial Services': [
        'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'C',
        'COF', 'SPGI', 'AIG', 'TRV', 'CB', 'MMC', 'ICE', 'CME', 'MO', 'AON', 'MET',
        'SCHW', 'PGR', 'AFL', 'ALL', 'MCO', 'MSCI', 'CBRE', 'BK', 'NTRS', 'STT',
        'PNC', 'TFC', 'AIZ', 'RF', 'KEY', 'HBAN', 'FITB', 'MTB', 'CMA', 'USB',
        'WAL', 'NYCB', 'PNC', 'CFG', 'CINF', 'WRB', 'PRU', 'AFL', 'HIG', 'MET',
        'LNC', 'UNM', 'AFL', 'CNO', 'GNW', 'RGA', 'RE', 'FAF', 'MKTX', 'CBOE',
        'CME', 'ICE', 'NDAQ', 'SPGI', 'MCO', 'FIS', 'FISV'
    ],
    'Healthcare': [
        'JNJ', 'UNH', 'LLY', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'AMGN', 'MRK',
        'BMY', 'GILD', 'REGN', 'VRTX', 'BIIB', 'MDT', 'ISRG', 'ZTS', 'IDXX', 'ILMN',
        'HCA', 'THC', 'CNC', 'HUM', 'CI', 'ELV', 'CERN', 'DXCM', 'BSX', 'SYK',
        'BAX', 'RMD', 'PODD', 'EW', 'ALGN', 'STE', 'MASI', 'INCY', 'MRNA', 'NVAX',
        'BNTX', 'SGEN', 'SRPT', 'ARWR', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'GH', 'RGNX',
        'BLUE', 'NVCR', 'QGEN', 'EXEL', 'MYL', 'PRGO', 'TEVA', 'ENDP', 'OPK', 'ACOR'
    ],
    'Consumer Discretionary': [
        'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'TJX', 'HD', 'MCD', 'NKE', 'LOW', 'TJX',
        'DIS', 'CMCSA', 'NFLX', 'ROST', 'EBAY', 'TGT', 'WBD', 'LYV', 'CCL', 'RCL',
        'MAR', 'HLT', 'BKNG', 'EXPE', 'CZR', 'MGM', 'LVS', 'WYNN', 'SBUX', 'DPZ',
        'YUM', 'MCD', 'NKE', 'HD', 'LOW', 'TJX', 'ROST', 'TGT', 'BBY', 'COST',
        'WMT', 'AMZN', 'TSLA', 'DIS', 'NFLX', 'CMCSA', 'EBAY', 'TGT', 'WBD', 'LYV'
    ],
    'Consumer Staples': [
        'WMT', 'COST', 'PG', 'KO', 'PEP', 'CL', 'KMB', 'GIS', 'K', 'KR', 'SYY',
        'WBA', 'CVS', 'CI', 'ELV', 'CNC', 'CZR', 'BIIB', 'CTVA', 'CTAS', 'HSY',
        'K', 'KMB', 'KR', 'GIS', 'MKC', 'CL', 'KMB', 'CPB', 'CHD', 'CLX', 'STZ',
        'KO', 'PEP', 'MDLZ', 'TAP', 'BFB', 'MNST', 'CCEP', 'BF.B', 'KDP', 'MCK',
        'STZ', 'TSN', 'CAG', 'KMB', 'GIS', 'HRL', 'SJM', 'CPB', 'K', 'KMB', 'KR',
        'SYY', 'WBA', 'CVS', 'CI', 'ELV', 'CNC', 'CZR', 'BIIB', 'CTVA', 'CTAS'
    ],
    'Energy': [
        'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'KMI', 'PSX', 'OXY', 'VLO', 'MPC', 'EQT',
        'BKR', 'HAL', 'SLB', 'KMI', 'PSX', 'OXY', 'VLO', 'MPC', 'EQT', 'BKR', 'HAL',
        'DVN', 'APA', 'OKE', 'HES', 'CVX', 'XOM', 'COP', 'EOG', 'SLB', 'KMI',
        'PSX', 'OXY', 'VLO', 'MPC', 'EQT', 'BKR', 'HAL', 'DVN', 'APA', 'OKE',
        'HES', 'WMB', 'ET', 'WES', 'ENB', 'PAA', 'MMP', 'EPD', 'KMI', 'PSX'
    ],
    'Industrials': [
        'CAT', 'DE', 'BA', 'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE',
        'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M',
        'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON'
    ],
    'Materials': [
        'LIN', 'APD', 'ECL', 'DD', 'DOW', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM',
        'GOLD', 'AA', 'ALB', 'CLF', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM', 'GOLD', 'AA',
        'ALB', 'CLF', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM', 'GOLD', 'AA'
    ],
    'Real Estate': [
        'AMT', 'PLD', 'EQIX', 'CCI', 'EXR', 'SPG', 'PSA', 'VTR', 'O', 'DLR', 'HST',
        'ESS', 'FRT', 'KIM', 'MAA', 'PEAK', 'SLG', 'UDR', 'WELL', 'WY', 'AVB', 'EQR',
        'BXP', 'VNO', 'SLG', 'HIW', 'FRT', 'KIM', 'MAA', 'PEAK', 'SLG', 'UDR',
        'WELL', 'WY', 'AVB', 'EQR', 'BXP', 'VNO', 'SLG', 'HIW', 'FRT', 'KIM'
    ],
    'Utilities': [
        'NEE', 'SO', 'DUK', 'SRE', 'AEP', 'XEL', 'ED', 'DTE', 'WEC', 'PEG', 'ETR',
        'AEE', 'EIX', 'PCG', 'CNP', 'AWK', 'AES', 'D', 'DUK', 'SRE', 'AEP', 'XEL',
        'ED', 'DTE', 'WEC', 'PEG', 'ETR', 'AEE', 'EIX', 'PCG', 'CNP', 'AWK', 'AES'
    ],
    'Communication Services': [
        'GOOGL', 'META', 'DIS', 'CMCSA', 'NFLX', 'T', 'VZ', 'T', 'AT&T', 'TMUS',
        'CHTR', 'VOD', 'NTT', 'ORAN', 'DT', 'AMX', 'CHL', 'BCE', 'TEF', 'SKM',
        'VIV', 'TDC', 'CTL', 'LUMN', 'WIN', 'FTR', 'CBB', 'Cable One', 'Charter',
        'Comcast', 'Cox', 'Altice', 'Liberty'
    ]
};

/**
 * Get sector for ticker
 */
function getSector(ticker) {
    for (const [sector, tickers] of Object.entries(SECTOR_MAPPING)) {
        if (tickers.includes(ticker)) {
            return sector;
        }
    }
    return 'Unknown';
}

/**
 * Get industry for ticker based on sector
 */
function getIndustry(ticker, sector) {
    const industryMap = {
        'Technology': {
            'AAPL': 'Consumer Electronics',
            'MSFT': 'Software',
            'GOOGL': 'Internet Services',
            'NVDA': 'Semiconductors',
            'META': 'Social Media',
            'AVGO': 'Semiconductors',
            'CRM': 'Software',
            'ADBE': 'Software',
            'NFLX': 'Streaming Services',
            'INTC': 'Semiconductors',
            'AMD': 'Semiconductors'
        },
        'Financial Services': {
            'JPM': 'Banking',
            'BAC': 'Banking',
            'WFC': 'Banking',
            'GS': 'Investment Banking',
            'MS': 'Investment Banking',
            'V': 'Payment Services',
            'MA': 'Payment Services',
            'AXP': 'Payment Services',
            'BLK': 'Asset Management'
        },
        'Healthcare': {
            'JNJ': 'Pharmaceuticals',
            'UNH': 'Health Insurance',
            'LLY': 'Pharmaceuticals',
            'ABBV': 'Pharmaceuticals',
            'PFE': 'Pharmaceuticals',
            'TMO': 'Biotechnology',
            'ABT': 'Medical Devices',
            'DHR': 'Medical Devices'
        },
        'Consumer Discretionary': {
            'AMZN': 'E-Commerce',
            'TSLA': 'Automotive',
            'HD': 'Home Improvement',
            'MCD': 'Restaurants',
            'NKE': 'Apparel',
            'LOW': 'Home Improvement',
            'TJX': 'Apparel Retail',
            'DIS': 'Entertainment',
            'CMCSA': 'Cable Services'
        },
        'Consumer Staples': {
            'WMT': 'Retail',
            'COST': 'Retail',
            'PG': 'Household Products',
            'KO': 'Beverages',
            'PEP': 'Beverages',
            'CL': 'Household Products',
            'KMB': 'Household Products'
        },
        'Energy': {
            'XOM': 'Oil & Gas',
            'CVX': 'Oil & Gas',
            'COP': 'Oil & Gas',
            'EOG': 'Oil & Gas',
            'SLB': 'Oilfield Services'
        },
        'Industrials': {
            'CAT': 'Construction Machinery',
            'DE': 'Agricultural Machinery',
            'BA': 'Aerospace',
            'GE': 'Conglomerate',
            'MMM': 'Conglomerate',
            'UPS': 'Logistics',
            'RTX': 'Aerospace',
            'LMT': 'Aerospace',
            'HON': 'Conglomerate'
        },
        'Materials': {
            'LIN': 'Chemicals',
            'APD': 'Chemicals',
            'ECL': 'Chemicals',
            'DD': 'Chemicals',
            'DOW': 'Chemicals',
            'NUE': 'Steel',
            'BHP': 'Mining',
            'RIO': 'Mining',
            'VALE': 'Mining',
            'FCX': 'Mining'
        },
        'Real Estate': {
            'AMT': 'REIT',
            'PLD': 'REIT',
            'EQIX': 'Data Centers',
            'CCI': 'REIT',
            'EXR': 'REIT',
            'SPG': 'REIT',
            'PSA': 'REIT',
            'VTR': 'REIT'
        },
        'Utilities': {
            'NEE': 'Electric Utility',
            'SO': 'Electric Utility',
            'DUK': 'Electric Utility',
            'SRE': 'Electric Utility',
            'AEP': 'Electric Utility',
            'XEL': 'Electric Utility'
        },
        'Communication Services': {
            'GOOGL': 'Internet Services',
            'META': 'Social Media',
            'DIS': 'Entertainment',
            'CMCSA': 'Cable Services',
            'NFLX': 'Streaming Services',
            'T': 'Telecommunications',
            'VZ': 'Telecommunications'
        }
    };
    
    return industryMap[sector]?.[ticker] || `${sector} - Unknown`;
}

/**
 * Fetch ticker data from Polygon API
 */
async function fetchPolygonData(ticker) {
    if (!POLYGON_API_KEY) {
        console.log('⚠️  Polygon API key not found, using mock data');
        return null;
    }
    
    try {
        const https = require('https');
        
        return new Promise((resolve, reject) => {
            const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apikey=${POLYGON_API_KEY}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.results);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
        
    } catch (error) {
        console.error(`❌ Error fetching ${ticker} from Polygon:`, error.message);
        return null;
    }
}

/**
 * Fetch market data from Polygon
 */
async function fetchMarketData(ticker) {
    if (!POLYGON_API_KEY) {
        return null;
    }
    
    try {
        const https = require('https');
        
        return new Promise((resolve, reject) => {
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.results?.[0] || null);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
        
    } catch (error) {
        console.error(`❌ Error fetching market data for ${ticker}:`, error.message);
        return null;
    }
}

/**
 * Update ticker with fresh data
 */
async function updateTickerData(ticker) {
    try {
        // Get sector and industry
        const sector = getSector(ticker);
        const industry = getIndustry(ticker, sector);
        
        // Fetch additional data from Polygon
        const polygonData = await fetchPolygonData(ticker);
        const marketData = await fetchMarketData(ticker);
        
        // Prepare update data
        const updateData = {
            sector,
            industry,
            name: polygonData?.name || ticker,
            description: polygonData?.description || null,
            employees: polygonData?.market_cap?.total_employees || null,
            websiteUrl: polygonData?.homepage_url || null,
            logoUrl: polygonData?.branding?.logo_url || null,
            lastPrice: marketData?.c || null,
            lastMarketCap: polygonData?.market_cap?.value || null,
            sharesOutstanding: polygonData?.share_class_shares_outstanding?.value || null,
            updatedAt: new Date()
        };
        
        // Update ticker
        await prisma.ticker.update({
            where: { symbol: ticker },
            data: updateData
        });
        
        console.log(`✅ Updated ${ticker}: ${sector} - ${industry}`);
        
        return {
            symbol: ticker,
            success: true,
            sector,
            industry,
            name: updateData.name
        };
        
    } catch (error) {
        console.error(`❌ Error updating ${ticker}:`, error.message);
        return {
            symbol: ticker,
            success: false,
            error: error.message
        };
    }
}

/**
 * Refresh all ticker data
 */
async function refreshAllTickerData() {
    console.log('🔄 Starting Production Data Refresh...');
    
    try {
        // Get all tickers
        const allTickers = await prisma.ticker.findMany({
            select: { symbol: true }
        });
        
        console.log(`📊 Processing ${allTickers.length} tickers...`);
        
        // Process in batches
        const batchSize = 10;
        let processed = 0;
        let errors = 0;
        
        for (let i = 0; i < allTickers.length; i += batchSize) {
            const batch = allTickers.slice(i, i + batchSize);
            
            console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allTickers.length / batchSize)}...`);
            
            // Process batch in parallel
            const batchPromises = batch.map(ticker => updateTickerData(ticker.symbol));
            const batchResults = await Promise.allSettled(batchPromises);
            
            // Count results
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        processed++;
                    } else {
                        errors++;
                    }
                } else {
                    errors++;
                }
            });
            
            // Add delay between batches
            if (i + batchSize < allTickers.length) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }
        }
        
        console.log('\n🎉 Data refresh completed!');
        console.log(`✅ Successfully processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`📊 Total tickers: ${allTickers.length}`);
        
        // Get final statistics
        const stats = await prisma.ticker.groupBy({
            by: ['sector'],
            _count: { symbol: true }
        });
        
        console.log('\n📊 Sector Distribution:');
        stats.forEach(stat => {
            console.log(`   ${stat.sector}: ${stat._count.symbol} tickers`);
        });
        
        return {
            success: true,
            total: allTickers.length,
            processed,
            errors,
            sectorStats: stats
        };
        
    } catch (error) {
        console.error('❌ Error refreshing data:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🚀 Production Data Refresh Script');
    console.log('=================================');
    
    try {
        await refreshAllTickerData();
        
        console.log('\n🎯 Next Steps:');
        console.log('1. Run validation: npm run validate-tickers');
        console.log('2. Check data quality: npm run check-data-quality');
        console.log('3. Update Redis universe: npm run update-universe');
        
    } catch (error) {
        console.error('\n❌ Production data refresh failed:', error.message);
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

module.exports = { refreshAllTickerData, updateTickerData };

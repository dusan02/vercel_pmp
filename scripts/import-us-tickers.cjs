#!/usr/bin/env node

/**
 * US Ticker Import Script
 * 
 * Imports additional US tickers to reach 500-600 total
 * Based on the comprehensive US ticker list provided
 */

const { PrismaClient } = require('@prisma/client');

// US ticker list provided by user
const US_TICKERS = [
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'AVGO', 'TSLA', 'BRK.B',
    'WMT', 'LLY', 'JPM', 'XOM', 'V', 'JNJ', 'MU', 'MA', 'ORCL', 'COST', 'CVX',
    'NFLX', 'PLTR', 'ABBV', 'BAC', 'PG', 'AMD', 'HD', 'CAT', 'KO', 'CSCO', 'GE',
    'LRCX', 'AMAT', 'MRK', 'RTX', 'MS', 'PM', 'GS', 'UNH', 'WFC', 'GEV', 'IBM',
    'TMUS', 'LIN', 'INTC', 'MCD', 'VZ', 'AXP', 'PEP', 'T', 'KLAC', 'C', 'AMGN',
    'NEE', 'ABT', 'TMO', 'CRM', 'GILD', 'DIS', 'TJX', 'TXN', 'ANET', 'ISRG', 'SCHW',
    'APH', 'COP', 'BA', 'APP', 'UBER', 'DE', 'PFE', 'ADI', 'BLK', 'LMT', 'HON',
    'UNP', 'ETN', 'BKNG', 'QCOM', 'WELL', 'DHR', 'PANW', 'LOW', 'SPGI', 'CB', 'SYK',
    'INTU', 'ACN', 'PGR', 'PLD', 'BMY', 'NOW', 'COF', 'VRTX', 'PH', 'GLW', 'MDT',
    'HCA', 'CME', 'MO', 'MCK', 'NEM', 'SBUX', 'DELL', 'CMCSA', 'SO', 'CRWD', 'CEG',
    'BSX', 'SNDK', 'ADBE', 'WDC', 'DUK', 'VRT', 'NOC', 'HWM', 'EQIX', 'GD', 'TT',
    'WM', 'CVS', 'STX', 'WMB', 'ICE', 'MAR', 'PWR', 'BX', 'ADP', 'MRSH', 'FDX', 'SNPS',
    'UPS', 'PNC', 'AMT', 'JCI', 'CDNS', 'BK', 'KKR', 'USB', 'ABNB', 'MCO', 'NKE',
    'FCX', 'REGN', 'SHW', 'MMM', 'CMI', 'ITW', 'MSI', 'EOG', 'KMI', 'RCL', 'ECL',
    'ORLY', 'SLB', 'MDLZ', 'CTAS', 'MNST', 'EMR', 'CSX', 'PSX', 'VLO', 'AON', 'DASH',
    'AEP', 'CRH', 'HLT', 'MPC', 'CI', 'ROST', 'CL', 'GM', 'WBD', 'RSG', 'TDG', 'HOOD',
    'LHX', 'TRV', 'NSC', 'ELV', 'COR', 'APO', 'APD', 'BKR', 'SRE', 'FTNT', 'PCAR',
    'DLR', 'SPG', 'OXY', 'TEL', 'CIEN', 'O', 'OKE', 'AJG', 'TFC', 'AFL', 'AZO',
    'FANG', 'ALL', 'COIN', 'MPWR', 'LITE', 'CTVA', 'D', 'TGT', 'ADSK', 'TRGP', 'VST',
    'FAST', 'EA', 'GWW', 'FIX', 'KEYS', 'NDAQ', 'NXPI', 'AME', 'COHR', 'CARR', 'CAH',
    'ZTS', 'XEL', 'EXC', 'TER', 'PSA', 'EW', 'F', 'IDXX', 'URI', 'GRMN', 'ETR',
    'DDOG', 'MET', 'KR', 'BDX', 'YUM', 'HSY', 'CMG', 'CVNA', 'DAL', 'PYPL', 'WAB',
    'EQT', 'FITB', 'AXON', 'AIG', 'AMP', 'MSCI', 'CBRE', 'EBAY', 'DHI', 'ROK', 'PEG',
    'ED', 'SYY', 'ODFL', 'VTR', 'PCG', 'TTWO', 'HIG', 'ROP', 'NUE', 'XYZ', 'WEC',
    'TPL', 'LVS', 'KDP', 'LYV', 'CCI', 'CCL', 'WDAY', 'MLM', 'MCHP', 'VMC', 'STT',
    'KVUE', 'PAYX', 'ACGL', 'KMB', 'RMD', 'PRU', 'EME', 'ADM', 'GEHC', 'IR', 'CPRT',
    'NRG', 'SATS', 'HAL', 'A', 'HBAN', 'FISV', 'OTIS', 'IBKR', 'DVN', 'UAL', 'IRM',
    'ATO', 'MTB', 'WAT', 'CTSH', 'DTE', 'AEE', 'CBOE', 'TPR', 'HPE', 'XYL', 'VICI',
    'EXPE', 'TDY', 'EL', 'RJF', 'DOV', 'FE', 'JBL', 'IQV', 'EXR', 'PPL', 'WTW',
    'CNP', 'VRSK', 'DG', 'EIX', 'CHTR', 'AWK', 'BIIB', 'STZ', 'DXCM', 'DOW', 'HUBB',
    'EXE', 'CTRA', 'FIS', 'NTRS', 'ROL', 'FICO', 'MTD', 'ES', 'KHC', 'CINF', 'CFG',
    'WRB', 'Q', 'TSCO', 'ARES', 'STLD', 'OMC', 'ON', 'BG', 'SYF', 'LYB', 'LEN',
    'ULTA', 'AVB', 'CMS', 'DRI', 'PPG', 'PHM', 'BRO', 'CHD', 'VRSN', 'VLTO', 'EQR',
    'LH', 'RF', 'L', 'WSM', 'NI', 'EFX', 'STE', 'KEY', 'DGX', 'DLTR', 'TSN', 'RL',
    'LDOS', 'FSLR', 'HUM', 'SW', 'MRNA', 'BR', 'GIS', 'CPAY', 'NTAP', 'LUV', 'GPN',
    'CHRW', 'ALB', 'JBHT', 'TROW', 'LULU', 'SNA', 'IP', 'EXPD', 'PFG', 'CF', 'PKG',
    'EVRG', 'NVR', 'SBAC', 'AMCR', 'CSGP', 'DD', 'PTC', 'INCY', 'LNT', 'IFF', 'WST',
    'ZBH', 'FTV', 'HPQ', 'HOLX', 'WY', 'LII', 'AKAM', 'FFIV', 'CNC', 'PODD', 'ESS',
    'TRMB', 'VTRS', 'CDW', 'HII', 'TXT', 'BALL', 'J', 'TKO', 'KIM', 'APTV', 'INVH',
    'TYL', 'NDSN', 'DECK', 'COO', 'PNR', 'MAA', 'MKC', 'GPC', 'IEX', 'REG', 'APA',
    'BBY', 'HST', 'EG', 'HAS', 'SMCI', 'ALGN', 'CLX', 'ERIE', 'GEN', 'AVY', 'BEN',
    'HRL', 'ALLE', 'DPZ', 'MAS', 'DOC', 'PNW', 'JKHY', 'GNRC', 'FOX', 'FOXA', 'UHS',
    'IT', 'UDR', 'TTD', 'SOLV', 'GDDY', 'SWK', 'AIZ', 'GL', 'WYNN', 'IVZ', 'BF.B',
    'SJM', 'PSKY', 'ZBRA', 'DVA', 'CPT', 'AES', 'RVTY', 'MGM', 'BLDR', 'NCLH',
    'FRT', 'AOS', 'NWSA', 'HSIC', 'BAX', 'BXP', 'ARE', 'SWKS', 'TECH', 'TAP', 'FDS',
    'CRL', 'MOS', 'POOL', 'CAG', 'EPAM', 'CPB', 'NWS'
];

// Sector mapping for common US tickers
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
    'Healthcare': [
        'JNJ', 'UNH', 'LLY', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'AMGN', 'MRK',
        'BMY', 'GILD', 'REGN', 'VRTX', 'BIIB', 'MDT', 'ISRG', 'ZTS', 'IDXX', 'ILMN',
        'HCA', 'THC', 'CNC', 'HUM', 'CI', 'ELV', 'CERN', 'DXCM', 'BSX', 'SYK',
        'BAX', 'RMD', 'PODD', 'EW', 'ALGN', 'STE', 'MASI', 'INCY', 'MRNA', 'NVAX',
        'BNTX', 'SGEN', 'SRPT', 'ARWR', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'GH', 'RGNX',
        'BLUE', 'NVCR', 'QGEN', 'EXEL', 'MYL', 'PRGO', 'TEVA', 'ENDP', 'OPK', 'ACOR'
    ],
    'Financial Services': [
        'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'C',
        'COF', 'SPGI', 'AIG', 'TRV', 'CB', 'MMC', 'ICE', 'CME', 'MO', 'AON', 'MET',
        'SCHW', 'PGR', 'AFL', 'ALL', 'MCO', 'MSCI', 'CBRE', 'BK', 'NTRS', 'STT',
        'PNC', 'TFC', 'AIZ', 'RF', 'KEY', 'HBAN', 'FITB', 'MTB', 'CMA', 'USB',
        'WAL', 'NYCB', 'PNC', 'CFG', 'CINF', 'WRB', 'PRU', 'AFL', 'HIG', 'MET',
        'LNC', 'UNM', 'AFL', 'CNO', 'GNW', 'RGA', 'RE', 'FAF', 'MKTX', 'CBOE',
        'CME', 'ICE', 'NDAQ', 'SPGI', 'MSCI', 'S&P', 'MCO', 'FIS', 'FISV'
    ],
    'Consumer Discretionary': [
        'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'TJX', 'HD', 'MCD', 'NKE', 'LOW',
        'TJX', 'HD', 'MCD', 'NKE', 'LOW', 'TJX', 'HD', 'MCD', 'NKE', 'LOW', 'TJX',
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
        'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE', 'MMM', 'UPS', 'RTX', 'LMT',
        'HON', '3M', 'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE', 'MMM',
        'UPS', 'RTX', 'LMT', 'HON', '3M', 'GE', 'MMM', 'UPS', 'RTX', 'LMT', 'HON'
    ],
    'Materials': [
        'LIN', 'APD', 'ECL', 'DD', 'DOW', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM',
        'GOLD', 'AA', 'ALB', 'CLF', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM', 'GOLD',
        'AA', 'ALB', 'CLF', 'NUE', 'BHP', 'RIO', 'VALE', 'FCX', 'NEM', 'GOLD', 'AA',
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

const prisma = new PrismaClient();

/**
 * Get sector for a ticker
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
 * Import US tickers to database
 */
async function importUSTickers() {
    console.log('🚀 Starting US Ticker Import...');
    console.log(`📊 Processing ${US_TICKERS.length} US tickers`);
    
    try {
        // Check current tickers in database
        const existingTickers = await prisma.ticker.findMany({
            select: { symbol: true }
        });
        
        const existingSymbols = new Set(existingTickers.map(t => t.symbol));
        console.log(`📋 Found ${existingSymbols.size} existing tickers in database`);
        
        // Filter out existing tickers
        const newTickers = US_TICKERS.filter(ticker => !existingSymbols.has(ticker));
        console.log(`🆕 Found ${newTickers.length} new tickers to import`);
        
        if (newTickers.length === 0) {
            console.log('✅ All US tickers already exist in database');
            return;
        }
        
        // Prepare ticker data
        const tickerData = newTickers.map(ticker => ({
            symbol: ticker,
            name: ticker, // Will be updated later with real names
            sector: getSector(ticker),
            industry: 'Unknown', // Will be updated later
            lastPrice: null,
            lastMarketCap: null,
            sharesOutstanding: null,
            updatedAt: new Date()
        }));
        
        // Import in batches
        const batchSize = 50;
        let imported = 0;
        
        for (let i = 0; i < tickerData.length; i += batchSize) {
            const batch = tickerData.slice(i, i + batchSize);
            
            try {
                await prisma.ticker.createMany({
                    data: batch
                });
                
                imported += batch.length;
                console.log(`✅ Imported batch ${Math.floor(i / batchSize) + 1}: ${batch.length} tickers`);
                
            } catch (error) {
                console.error(`❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
            }
        }
        
        console.log(`🎉 Successfully imported ${imported} new US tickers!`);
        
        // Get final count
        const finalCount = await prisma.ticker.count();
        console.log(`📊 Total tickers in database: ${finalCount}`);
        
    } catch (error) {
        console.error('❌ Error importing US tickers:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🇺🇸 US Ticker Import Script');
    console.log('==========================');
    
    await importUSTickers();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Run data refresh to populate ticker details');
    console.log('2. Update company names and industries');
    console.log('3. Run validation tests');
    console.log('4. Update Redis universe');
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

module.exports = { importUSTickers };

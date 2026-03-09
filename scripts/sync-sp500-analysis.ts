/**
 * Script to sync S&P 500 analysis data
 * 
 * This script iterates through all S&P 500 tickers, syncs their financials, 
 * details, and valuation history, then recomputes the analytical scores.
 * 
 * Usage: npx tsx scripts/sync-sp500-analysis.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { AnalysisService } from '../src/services/analysisService';

// Extract tickers from the existing script's list
const SP500_TICKERS = [
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'AVGO', 'META', 'TSLA', 'BRK.B',
    'LLY', 'JPM', 'WMT', 'ORCL', 'V', 'XOM', 'MA', 'NFLX', 'JNJ', 'PLTR',
    'COST', 'AMD', 'ABBV', 'BAC', 'HD', 'PG', 'GE', 'CVX', 'KO', 'UNH',
    'IBM', 'CSCO', 'MU', 'WFC', 'CAT', 'MS', 'AXP', 'PM', 'GS', 'RTX',
    'TMUS', 'CRM', 'MRK', 'ABT', 'MCD', 'TMO', 'DIS', 'ISRG', 'APP', 'LRCX',
    'LIN', 'PEP', 'UBER', 'QCOM', 'INTU', 'AMGN', 'AMAT', 'INTC', 'C', 'T',
    'NOW', 'NEE', 'SCHW', 'APH', 'VZ', 'ANET', 'BLK', 'TJX', 'BKNG', 'KLAC',
    'GEV', 'GILD', 'BSX', 'SPGI', 'DHR', 'ACN', 'BA', 'PANW', 'TXN', 'PFE',
    'ETN', 'COF', 'CRWD', 'ADBE', 'SYK', 'UNP', 'WELL', 'LOW', 'DE', 'PGR',
    'HON', 'MDT', 'HOOD', 'PLD', 'ADI', 'CB', 'BX', 'COP', 'CEG', 'PH',
    'VRTX', 'KKR', 'MCK', 'LMT', 'HCA', 'ADP', 'CVS', 'CMCSA', 'SO', 'CME',
    'BMY', 'SBUX', 'MO', 'NEM', 'DUK', 'GD', 'TT', 'DELL', 'NKE', 'MMM',
    'MMC', 'MCO', 'CDNS', 'DASH', 'ICE', 'AMT', 'SHW', 'HWM', 'ORLY', 'COIN',
    'WM', 'EQIX', 'NOC', 'UPS', 'JCI', 'MAR', 'BK', 'APO', 'GLW', 'AON',
    'CTAS', 'ECL', 'ABNB', 'USB', 'WMB', 'SNPS', 'MDLZ', 'EMR', 'TDG', 'PNC',
    'TEL', 'RCL', 'COR', 'CI', 'ITW', 'REGN', 'MNST', 'ELV', 'DDOG', 'PWR',
    'GM', 'CMI', 'AJG', 'AEP', 'MSI', 'CSX', 'NSC', 'ADSK', 'CL', 'FTNT',
    'TRV', 'HLT', 'RSG', 'PYPL', 'FDX', 'AZO', 'STX', 'VST', 'WDAY', 'SPG',
    'SRE', 'KMI', 'MPC', 'AFL', 'EOG', 'APD', 'FCX', 'WDC', 'TFC', 'DLR',
    'PSX', 'IDXX', 'WBD', 'LHX', 'SLB', 'VLO', 'BDX', 'URI', 'ZTS', 'F',
    'ROST', 'ALL', 'O', 'D', 'PCAR', 'MET', 'NXPI', 'EA', 'NDAQ', 'EW',
    'PSA', 'CAH', 'BKR', 'XEL', 'CARR', 'ROP', 'FAST', 'CBRE', 'EXC', 'MPWR',
    'AME', 'LVS', 'AXON', 'GWW', 'CTVA', 'TTWO', 'ROK', 'MSCI', 'OKE', 'DHI',
    'AMP', 'KR', 'FICO', 'ETR', 'A', 'FANG', 'PEG', 'TGT', 'YUM', 'OXY',
    'AIG', 'CCI', 'PAYX', 'XYZ', 'CPRT', 'CMG', 'EBAY', 'VMC', 'GRMN', 'EQT',
    'DAL', 'MLM', 'IQV', 'PRU', 'TRGP', 'RMD', 'PCG', 'WEC', 'HIG', 'XYL',
    'SYY', 'KDP', 'ED', 'VTR', 'WAB', 'CTSH', 'CCL', 'OTIS', 'HSY', 'FI',
    'KMB', 'FIS', 'STT', 'GEHC', 'ACGL', 'LYV', 'EL', 'NUE', 'VICI', 'EXPE',
    'RJF', 'KVUE', 'LEN', 'IBKR', 'KEYS', 'NRG', 'WTW', 'UAL', 'IR', 'HPE',
    'VRSK', 'TSCO', 'MTD', 'IRM', 'MCHP', 'ODFL', 'ATO', 'CSGP', 'KHC', 'HUM',
    'WRB', 'DTE', 'K', 'EME', 'MTB', 'AEE', 'EXR', 'FSLR', 'ROL', 'EXE',
    'FITB', 'TER', 'ADM', 'ES', 'BRO', 'PPL', 'CBOE', 'CHTR', 'SYF', 'FE',
    'STE', 'EFX', 'BR', 'CINF', 'CNP', 'AWK', 'LDOS', 'AVB', 'DOV', 'GIS',
    'HBAN', 'NTRS', 'VLTO', 'TDY', 'HUBB', 'PHM', 'HAL', 'ULTA', 'WSM', 'STZ',
    'HPQ', 'SMCI', 'BIIB', 'PODD', 'VRSN', 'EQR', 'WAT', 'DG', 'CMS', 'DXCM',
    'JBL', 'CFG', 'TROW', 'STLD', 'TPL', 'EIX', 'LH', 'NTAP', 'DVN', 'RF',
    'SBAC', 'DLTR', 'PPG', 'L', 'TTD', 'INCY', 'PTC', 'DGX', 'TPR', 'NI',
    'CPAY', 'CHD', 'Q', 'CTRA', 'IP', 'RL', 'LULU', 'NVR', 'WST', 'DRI',
    'ON', 'TYL', 'KEY', 'TSN', 'AMCR', 'TRMB', 'SW', 'EXPD', 'CDW', 'PFG',
    'BG', 'PSKY', 'J', 'GPN', 'PKG', 'APTV', 'EVRG', 'CHRW', 'GDDY', 'PNR',
    'SNA', 'GPC', 'MKC', 'INVH', 'ZBH', 'LNT', 'CNC', 'LII', 'DD', 'ESS',
    'GEN', 'IT', 'LUV', 'HOLX', 'IFF', 'FTV', 'BBY', 'WY', 'JBHT', 'DOW',
    'MAA', 'ERIE', 'TXT', 'ALLE', 'UHS', 'COO', 'OMC', 'TKO', 'FOX', 'LYB',
    'KIM', 'FOXA', 'DPZ', 'FFIV', 'EG', 'AVY', 'NDSN', 'WYNN', 'AKAM', 'CF',
    'REG', 'BF.B', 'ZBRA', 'CLX', 'MAS', 'VTRS', 'HII', 'IEX', 'BALL', 'SOLV',
    'DOC', 'HRL', 'HST', 'ALB', 'DECK', 'JKHY', 'BLDR', 'BEN', 'UDR', 'SJM',
    'BXP', 'AIZ', 'HAS', 'CPT', 'DAY', 'IVZ', 'PNW', 'RVTY', 'GL', 'SWK',
    'MRNA', 'SWKS', 'ALGN', 'FDS', 'AES', 'NWSA', 'EPAM', 'ARE', 'POOL', 'TECH',
    'PAYC', 'CPB', 'BAX', 'GNRC', 'IPG', 'TAP', 'AOS', 'MGM', 'APA', 'HSIC',
    'DVA', 'NCLH', 'CRL', 'FRT', 'LW', 'CAG', 'MOS', 'LKQ', 'MTCH', 'MOH',
    'SOLS', 'MHK', 'NWS'
];

async function syncTickerBatch(tickers: string[], delayMs: number = 2000) {
    console.log(`🚀 Starting sync for ${tickers.length} tickers...`);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < tickers.length; i++) {
        const symbol = tickers[i] as string;
        console.log(`[${i + 1}/${tickers.length}] 🔄 Syncing ${symbol}...`);

        try {
            // 1. Sync Ticker Details (Logo, Industry, etc.)
            await AnalysisService.syncTickerDetails(symbol);

            // 2. Sync Financial Statements (Balance Sheet, Income Statement, etc.)
            await AnalysisService.syncFinancials(symbol);

            // 3. Sync Valuation History (Daily Prices/Market Cap)
            await AnalysisService.syncValuationHistory(symbol);

            // 4. Calculate Scores and Persist to Cache
            await AnalysisService.calculateScores(symbol);

            console.log(`✅ Successfully synced ${symbol}`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed to sync ${symbol}:`, error);
            errorCount++;
        }

        // Delay between tickers to respect API limits
        if (i < tickers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    console.log(`\n✨ Sync Complete!`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failures: ${errorCount}`);
}

async function main() {
    // Option to limit for testing
    const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : SP500_TICKERS.length;
    const delay = process.env.DELAY ? parseInt(process.env.DELAY, 10) : 1000; // 1s default for testing, 12s for free tier

    const testTickers = SP500_TICKERS.slice(0, limit);
    await syncTickerBatch(testTickers, delay);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });

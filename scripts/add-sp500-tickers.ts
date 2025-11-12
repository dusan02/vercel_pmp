/**
 * Script to add SP500 tickers to database
 * 
 * Usage: tsx scripts/add-sp500-tickers.ts
 */

import { prisma } from '../src/lib/prisma';
import { addTickersToUniverse, UNIVERSE_TYPES } from '../src/lib/universeHelpers';

// SP500 tickers extracted from the provided list
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

async function main() {
  console.log('🚀 Adding SP500 tickers to database...');
  console.log(`📊 Total tickers: ${SP500_TICKERS.length}`);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches to avoid overwhelming the database
  const batchSize = 50;
  for (let i = 0; i < SP500_TICKERS.length; i += batchSize) {
    const batch = SP500_TICKERS.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(SP500_TICKERS.length / batchSize)} (${batch.length} tickers)...`);

    for (const symbol of batch) {
      try {
        // Upsert ticker to database
        await prisma.ticker.upsert({
          where: { symbol },
          update: {
            // Update if exists, but keep existing data
          },
          create: {
            symbol,
            name: symbol, // Will be enriched later with actual company names
          }
        });

        // Add to universe
        await addTickersToUniverse(UNIVERSE_TYPES.SP500, [symbol]);

        added++;
        if (added % 10 === 0) {
          process.stdout.write('.');
        }
      } catch (error) {
        console.error(`\n❌ Error adding ${symbol}:`, error);
        errors++;
      }
    }
  }

  console.log(`\n\n✅ Completed!`);
  console.log(`   Added: ${added}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${SP500_TICKERS.length}`);

  // Verify count
  const dbCount = await prisma.ticker.count({
    where: {
      symbol: { in: SP500_TICKERS }
    }
  });

  console.log(`\n📊 Verification: ${dbCount} tickers found in database`);

  // Check universe
  const { getAllTrackedTickers } = await import('../src/lib/universeHelpers');
  const universeTickers = await getAllTrackedTickers();
  console.log(`📊 Universe count: ${universeTickers.length} total tracked tickers`);
}

main()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


/**
 * Script to find tickers with likely incorrect sector/industry assignments
 * 
 * This script identifies common patterns of incorrect sector/industry mappings
 * based on known company types and industry standards.
 * 
 * Usage:
 * npx tsx scripts/find-incorrect-sectors.ts
 */

import { prisma } from '../src/lib/db/prisma.js';

// Known incorrect patterns - tickers that are likely misclassified
const SUSPICIOUS_PATTERNS: Array<{
  description: string;
  sector?: string;
  industry?: string;
  examples?: string[];
}> = [
  {
    description: 'Technology companies in Consumer Defensive / Packaged Foods',
    sector: 'Consumer Defensive',
    industry: 'Packaged Foods',
    examples: ['SWKS', 'AKAM']
  },
  {
    description: 'Technology companies in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['ACN', 'MCHP', 'MCK', 'MCO', 'MKC', 'MMC']
  },
  {
    description: 'Financial Services / Insurance companies in Technology / Software',
    sector: 'Technology',
    industry: 'Software',
    examples: ['AIG', 'AIZ']
  },
  {
    description: 'Real Estate / REIT companies in Financial Services',
    sector: 'Financial Services',
    industry: 'Credit Services',
    examples: ['AVB', 'MAA', 'MAS', 'INVH', 'NVR']
  },
  {
    description: 'Technology companies in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['AXON', 'DDOG', 'SONY']
  },
  {
    description: 'Financial Services / Insurance in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['AON', 'BRO']
  },
  {
    description: 'Consumer Defensive / Packaging in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['AMCR']
  },
  {
    description: 'Consumer Defensive / Household Products in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['AOS']
  },
  {
    description: 'Financial Services / Asset Management in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['APO']
  },
  {
    description: 'Energy companies in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['UBER']
  },
  {
    description: 'Industrials / Aerospace & Defense in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['EBAY']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['EFX', 'FDS', 'FE', 'FIG', 'FIS', 'FOX', 'FOXA', 'RF', 'RJF']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Discount Stores',
    sector: 'Consumer Cyclical',
    industry: 'Discount Stores',
    examples: ['UAL']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Lodging',
    sector: 'Consumer Cyclical',
    industry: 'Lodging',
    examples: ['EXPE']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Defensive / Packaged Foods',
    sector: 'Consumer Defensive',
    industry: 'Packaged Foods',
    examples: ['KEYS']
  },
  {
    description: 'Technology / Communication Equipment in Energy / Oil & Gas Integrated',
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    examples: ['UBER']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['HCA', 'HMC', 'HOOD', 'IBKR', 'ICE', 'INCY', 'MFC', 'MKC', 'MMC', 'MSCI', 'NCLH', 'OMC', 'PAYC', 'PCAR', 'RACE', 'SBAC', 'SMCI', 'VICI', 'VMC', 'WCN', 'WDC', 'WEC']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Credit Services',
    sector: 'Financial Services',
    industry: 'Credit Services',
    examples: ['LUV', 'LVS', 'LYV']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Insurance',
    sector: 'Financial Services',
    industry: 'Insurance',
    examples: ['GLW']
  },
  {
    description: 'Technology / Communication Equipment in Healthcare',
    sector: 'Healthcare',
    industry: 'Healthcare Plans',
    examples: ['DHI']
  },
  {
    description: 'Technology / Communication Equipment in Industrials',
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    examples: ['HBAN', 'SAN', 'SAP', 'SRE']
  },
  {
    description: 'Technology / Communication Equipment in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['HST', 'IMO', 'ON', 'ORLY', 'PODD', 'POOL', 'ROL', 'ROP', 'SOLS', 'SOLV', 'WY', 'WYNN']
  },
  {
    description: 'Technology / Communication Equipment in Utilities',
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    examples: ['BUD', 'DB', 'EPD', 'WBD']
  },
  {
    description: 'Technology / Software—Application in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['ITUB']
  },
  {
    description: 'Technology / Software—Application in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['TAP', 'TCOM', 'TD', 'TDY', 'TEL', 'TER', 'TPL', 'TPR', 'TRGP', 'TRI', 'TRMB', 'TROW', 'TRP', 'TRV', 'TSCO', 'TSN', 'TT', 'TTE', 'TXT', 'TYL', 'VRT', 'VST', 'VTR', 'VTRS', 'WAT', 'WST', 'WTW']
  },
  {
    description: 'Technology / Semiconductors in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['MUFG']
  },
  {
    description: 'Consumer Cyclical / Discount Stores in Energy / Oil & Gas Integrated',
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    examples: ['SLB']
  },
  {
    description: 'Consumer Cyclical / Discount Stores in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['LULU']
  },
  {
    description: 'Consumer Cyclical / Discount Stores in Financial Services / Capital Markets',
    sector: 'Financial Services',
    industry: 'Capital Markets',
    examples: ['KKR']
  },
  {
    description: 'Consumer Cyclical / Discount Stores in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['ROST']
  },
  {
    description: 'Consumer Cyclical / Lodging in Industrials / Aerospace & Defense',
    sector: 'Industrials',
    industry: 'Aerospace & Defense',
    examples: ['HAS']
  },
  {
    description: 'Consumer Cyclical / Travel Services in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['HLT']
  },
  {
    description: 'Healthcare / Drug Manufacturers without - General suffix',
    sector: 'Healthcare',
    industry: 'Drug Manufacturers',
    examples: ['ABBV', 'AZN', 'BMY', 'GEN', 'GSK', 'JNJ', 'MRK', 'NVO', 'NVS', 'PFE', 'SNY', 'TAK']
  },
  {
    description: 'Basic Materials / Other Industrial Metals & Mining in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['BDX', 'BXP', 'EIX', 'EXE', 'EXPD', 'EXR', 'IEX', 'LHX', 'MPLX', 'PAYX', 'RBLX', 'RELX', 'RSG', 'XYL', 'XYZ']
  },
  {
    description: 'Basic Materials / Other Industrial Metals & Mining in Real Estate / REIT',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['RIO']
  },
  {
    description: 'Basic Materials / Other Industrial Metals & Mining in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['STLD']
  },
  {
    description: 'Energy / Oil & Gas Integrated in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['BEN', 'BHP']
  },
  {
    description: 'Energy / Oil & Gas Integrated in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['ARE', 'ARM', 'LII', 'WPM']
  },
  {
    description: 'Energy / Oil & Gas Integrated in Utilities / Utilities - Regulated Electric',
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    examples: ['ARES']
  },
  {
    description: 'Financial Services / Banks in Technology / Software',
    sector: 'Technology',
    industry: 'Software',
    examples: ['FITB']
  },
  {
    description: 'Financial Services / Banks in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['FICO', 'IVZ']
  },
  {
    description: 'Financial Services / Banks in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['DECK', 'FDS', 'FIG', 'FIS', 'FOX', 'FOXA', 'RF', 'RJF']
  },
  {
    description: 'Financial Services / Banks in Consumer Defensive / Packaged Foods',
    sector: 'Consumer Defensive',
    industry: 'Packaged Foods',
    examples: ['KHC', 'KIM']
  },
  {
    description: 'Financial Services / Banks in Healthcare / Healthcare Plans',
    sector: 'Healthcare',
    industry: 'Healthcare Plans',
    examples: ['CNC']
  },
  {
    description: 'Financial Services / Banks in Industrials / Specialty Industrial Machinery',
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    examples: ['KEY', 'NDAQ', 'NWSA', 'SAN', 'SAP', 'SNA', 'SRE']
  },
  {
    description: 'Financial Services / Banks in Real Estate / REIT - Specialty',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['BRO', 'DOC', 'SBAC']
  },
  {
    description: 'Financial Services / Banks in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['CDW', 'COIN', 'CSGP', 'CVNA', 'DXCM', 'FICO', 'GEHC', 'GLCNF', 'GNRC', 'GPC', 'HCA', 'HMC', 'HOOD', 'HSIC', 'IBKR', 'ICE', 'INCY', 'JCI', 'KBCSF', 'MCHP', 'MCK', 'MCO', 'MFC', 'MKC', 'MMC', 'MSCI', 'NCLH', 'NSC', 'OMC', 'PAYC', 'PCAR', 'RACE', 'SCCO', 'SMCI', 'SMFG', 'VICI', 'VMC', 'WCN', 'WDC', 'WEC']
  },
  {
    description: 'Financial Services / Capital Markets in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['MSI']
  },
  {
    description: 'Financial Services / Credit Services in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['GEV', 'VRSN']
  },
  {
    description: 'Financial Services / Insurance in Technology / Software',
    sector: 'Technology',
    industry: 'Software',
    examples: ['AIG', 'AIZ']
  },
  {
    description: 'Financial Services / Insurance in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['GLW']
  },
  {
    description: 'Financial Services / Insurance in Real Estate / REIT - Specialty',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['AON', 'BRO']
  },
  {
    description: 'Healthcare / Healthcare Plans in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['CNC']
  },
  {
    description: 'Healthcare / Healthcare Plans in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['DHI']
  },
  {
    description: 'Healthcare / Medical Devices in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['IDXX']
  },
  {
    description: 'Industrials / Aerospace & Defense in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['BAM', 'EBAY', 'GDDY', 'HBAN']
  },
  {
    description: 'Industrials / Specialty Industrial Machinery in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['AMP', 'KEY', 'NDAQ', 'NWSA', 'SAN', 'SAP', 'SNA', 'SRE']
  },
  {
    description: 'Industrials / Specialty Industrial Machinery in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['FAST', 'FTV', 'GBTC', 'HST', 'JBHT', 'LNT', 'MNST', 'MSTR', 'MTB', 'MTCH', 'MTD', 'NTAP', 'NTRS', 'OTIS', 'PTC', 'ROST', 'STE', 'STT', 'STX', 'STZ', 'TAP', 'TCOM', 'TD', 'TDY', 'TEL', 'TER', 'TPL', 'TPR', 'TRGP', 'TRI', 'TRMB', 'TROW', 'TRP', 'TRV', 'TSCO', 'TSN', 'TT', 'TTE', 'TXT', 'TYL', 'VRT', 'VST', 'VTR', 'VTRS', 'WAT', 'WST', 'WTW']
  },
  {
    description: 'Real Estate / REIT - Specialty in Financial Services / Credit Services',
    sector: 'Financial Services',
    industry: 'Credit Services',
    examples: ['AVB', 'MAA', 'MAS', 'INVH', 'NVR']
  },
  {
    description: 'Real Estate / REIT - Specialty in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['AXON', 'DDOG', 'HST', 'IMO', 'ON', 'ORLY', 'PODD', 'POOL', 'ROL', 'ROP', 'SOLS', 'SOLV', 'SONY', 'WY', 'WYNN']
  },
  {
    description: 'Real Estate / REIT - Specialty in Consumer Defensive / Packaged Foods',
    sector: 'Consumer Defensive',
    industry: 'Packaged Foods',
    examples: ['SPG']
  },
  {
    description: 'Real Estate / REIT - Specialty in Energy / Oil & Gas Integrated',
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    examples: ['MO', 'MOS']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Auto Manufacturers',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    examples: ['EFX', 'FDS', 'FE', 'FIG', 'FIS', 'FOX', 'FOXA', 'IFF', 'IP', 'RF', 'RJF']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Discount Stores',
    sector: 'Consumer Cyclical',
    industry: 'Discount Stores',
    examples: ['UAL']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Cyclical / Lodging',
    sector: 'Consumer Cyclical',
    industry: 'Lodging',
    examples: ['EXPE']
  },
  {
    description: 'Technology / Communication Equipment in Consumer Defensive / Packaged Foods',
    sector: 'Consumer Defensive',
    industry: 'Packaged Foods',
    examples: ['KEYS']
  },
  {
    description: 'Technology / Communication Equipment in Energy / Oil & Gas Integrated',
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    examples: ['ET', 'ETN', 'ETR', 'TTE', 'UBER']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['CDW', 'COIN', 'CSGP', 'CVNA', 'DXCM', 'FICO', 'GEHC', 'GLCNF', 'GNRC', 'GPC', 'HCA', 'HMC', 'HOOD', 'HSIC', 'IBKR', 'ICE', 'INCY', 'JCI', 'KBCSF', 'MCHP', 'MCK', 'MCO', 'MFC', 'MKC', 'MMC', 'MSCI', 'NCLH', 'NSC', 'OMC', 'PAYC', 'PCAR', 'RACE', 'SCCO', 'SMCI', 'SMFG', 'VICI', 'VMC', 'WCN', 'WDC', 'WEC']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Credit Services',
    sector: 'Financial Services',
    industry: 'Credit Services',
    examples: ['GEV', 'LUV', 'LVS', 'LYV', 'VRSN']
  },
  {
    description: 'Technology / Communication Equipment in Financial Services / Insurance',
    sector: 'Financial Services',
    industry: 'Insurance',
    examples: ['GLW']
  },
  {
    description: 'Technology / Communication Equipment in Healthcare / Healthcare Plans',
    sector: 'Healthcare',
    industry: 'Healthcare Plans',
    examples: ['DHI']
  },
  {
    description: 'Technology / Communication Equipment in Industrials / Specialty Industrial Machinery',
    sector: 'Industrials',
    industry: 'Specialty Industrial Machinery',
    examples: ['CPRT', 'CPT', 'CTAS', 'CTRA', 'CTSH', 'CTVA', 'DLTR', 'DTE', 'EQT', 'FAST', 'FLUT', 'FTV', 'GBTC', 'HST', 'JBHT', 'LNT', 'MET', 'MNST', 'MSTR', 'MTB', 'MTCH', 'MTD', 'NTAP', 'NTRS', 'OTIS', 'PTC', 'ROST', 'STE', 'STLD', 'STT', 'STX', 'STZ', 'TAP', 'TCOM', 'TD', 'TDY', 'TEL', 'TER', 'TPL', 'TPR', 'TRGP', 'TRI', 'TRMB', 'TROW', 'TRP', 'TRV', 'TSCO', 'TSN', 'TT', 'TTE', 'TXT', 'TYL', 'VLTO', 'VRT', 'VST', 'VTR', 'VTRS', 'WAT', 'WST', 'WTW']
  },
  {
    description: 'Technology / Communication Equipment in Real Estate / REIT - Specialty',
    sector: 'Real Estate',
    industry: 'REIT - Specialty',
    examples: ['AXON', 'DDOG', 'HST', 'IMO', 'ON', 'ORLY', 'PODD', 'POOL', 'ROL', 'ROP', 'SOLS', 'SOLV', 'SONY', 'WY', 'WYNN']
  },
  {
    description: 'Technology / Communication Equipment in Utilities / Utilities - Regulated Electric',
    sector: 'Utilities',
    industry: 'Utilities - Regulated Electric',
    examples: ['BUD', 'DB', 'EPD', 'WBD']
  },
  {
    description: 'Technology / Software in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['FITB']
  },
  {
    description: 'Technology / Software—Application in Financial Services / Banks',
    sector: 'Financial Services',
    industry: 'Banks',
    examples: ['ITUB']
  },
  {
    description: 'Technology / Software—Application in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['BABA', 'INTU', 'ITUB', 'MELI', 'NET', 'NOW', 'NTES', 'PDD', 'SHOP', 'SNOW', 'SPOT', 'TEAM', 'TCEHY', 'VEEV', 'ZS']
  },
  {
    description: 'Technology / Semiconductors in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['AMAT', 'MUFG']
  },
  {
    description: 'Utilities / Utilities - Regulated Electric in Energy / Oil & Gas Integrated',
    sector: 'Energy',
    industry: 'Oil & Gas Integrated',
    examples: ['ARES']
  },
  {
    description: 'Utilities / Utilities - Regulated Electric in Technology / Communication Equipment',
    sector: 'Technology',
    industry: 'Communication Equipment',
    examples: ['BUD', 'DB', 'EPD', 'WBD']
  }
];

async function findIncorrectSectors() {
  console.log('🔍 Searching for tickers with likely incorrect sector/industry assignments...\n');

  try {
    const allTickers = await prisma.ticker.findMany({
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
      },
      orderBy: {
        symbol: 'asc'
      }
    });

    console.log(`📊 Analyzing ${allTickers.length} tickers...\n`);

    const suspicious: Array<{
      ticker: string;
      name: string | null;
      currentSector: string | null;
      currentIndustry: string | null;
      pattern: string;
    }> = [];

    // Check each pattern
    for (const pattern of SUSPICIOUS_PATTERNS) {
      const matches = allTickers.filter(ticker => {
        if (pattern.sector && ticker.sector !== pattern.sector) return false;
        if (pattern.industry && ticker.industry !== pattern.industry) return false;
        return true;
      });

      if (matches.length > 0) {
        matches.forEach(ticker => {
          suspicious.push({
            ticker: ticker.symbol,
            name: ticker.name,
            currentSector: ticker.sector,
            currentIndustry: ticker.industry,
            pattern: pattern.description
          });
        });
      }
    }

    // Remove duplicates
    const uniqueSuspicious = suspicious.filter((item, index, self) =>
      index === self.findIndex(t => t.ticker === item.ticker)
    );

    console.log(`⚠️  Found ${uniqueSuspicious.length} potentially incorrect tickers:\n`);
    console.log('Symbol'.padEnd(8) + 'Name'.padEnd(40) + 'Current Sector'.padEnd(25) + 'Current Industry'.padEnd(35) + 'Issue');
    console.log('-'.repeat(120));

    uniqueSuspicious.forEach(item => {
      const symbol = item.ticker.padEnd(8);
      const name = (item.name || 'N/A').substring(0, 38).padEnd(40);
      const sector = (item.currentSector || 'NULL').padEnd(25);
      const industry = (item.currentIndustry || 'NULL').substring(0, 33).padEnd(35);
      const pattern = item.pattern;
      
      console.log(`${symbol}${name}${sector}${industry}${pattern}`);
    });

    console.log('\n' + '='.repeat(120));
    console.log(`\n📊 Summary: ${uniqueSuspicious.length} tickers need review`);

    // Export to JSON
    const fs = await import('fs/promises');
    const output = {
      total: uniqueSuspicious.length,
      timestamp: new Date().toISOString(),
      tickers: uniqueSuspicious
    };
    
    await fs.writeFile('suspicious-tickers.json', JSON.stringify(output, null, 2), 'utf-8');
    console.log('\n✅ Results exported to suspicious-tickers.json');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

findIncorrectSectors().catch(console.error);

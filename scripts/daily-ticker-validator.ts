/**
 * Daily Ticker Validator Script
 * 
 * Tento script sa spustí 1x denne a skontroluje všetky tickery:
 * - Má ticker správny symbol?
 * - Má ticker company name?
 * - Má ticker správny sector?
 * - Má ticker správny industry?
 * 
 * Opraví všetky chyby automaticky pomocou známych mappingov a validácie.
 * 
 * Usage: npx tsx scripts/daily-ticker-validator.ts
 * 
 * Alebo cez cron: 0 2 * * * cd /var/www/premarketprice && npx tsx scripts/daily-ticker-validator.ts
 */

import { prisma } from '../src/lib/db/prisma';
import { validateSectorIndustry, normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

// Kompletný mapping všetkých známych tickerov s ich správnymi sector/industry
const KNOWN_CORRECT_MAPPINGS: { [key: string]: { sector: string; industry: string; name?: string } } = {
  // Technology - Semiconductors
  'TSM': { sector: 'Technology', industry: 'Semiconductors', name: 'Taiwan Semiconductor Manufacturing Company' },
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment', name: 'ASML Holding' },
  'NVDA': { sector: 'Technology', industry: 'Semiconductors', name: 'NVIDIA' },
  'AMD': { sector: 'Technology', industry: 'Semiconductors', name: 'Advanced Micro Devices' },
  'INTC': { sector: 'Technology', industry: 'Semiconductors', name: 'Intel' },
  'AVGO': { sector: 'Technology', industry: 'Semiconductors', name: 'Broadcom' },
  'QCOM': { sector: 'Technology', industry: 'Semiconductors', name: 'Qualcomm' },
  'TXN': { sector: 'Technology', industry: 'Semiconductors', name: 'Texas Instruments' },
  'MU': { sector: 'Technology', industry: 'Semiconductors', name: 'Micron Technology' },
  
  // Technology - Software
  'MSFT': { sector: 'Technology', industry: 'Software', name: 'Microsoft' },
  'ADBE': { sector: 'Technology', industry: 'Software', name: 'Adobe' },
  'CRM': { sector: 'Technology', industry: 'Software', name: 'Salesforce' },
  'ORCL': { sector: 'Technology', industry: 'Software', name: 'Oracle' },
  'NOW': { sector: 'Technology', industry: 'Software', name: 'ServiceNow' },
  'INTU': { sector: 'Technology', industry: 'Software', name: 'Intuit' },
  
  // Technology - Internet Content & Information
  'GOOGL': { sector: 'Technology', industry: 'Internet Content & Information', name: 'Alphabet' },
  'GOOG': { sector: 'Technology', industry: 'Internet Content & Information', name: 'Alphabet' },
  'META': { sector: 'Technology', industry: 'Internet Content & Information', name: 'Meta Platforms' },
  
  // Technology - Consumer Electronics
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics', name: 'Apple' },
  
  // Consumer Cyclical - Travel Services
  'RCL': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Royal Caribbean Cruises' },
  'CCL': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Carnival Corporation' },
  'BKNG': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Booking Holdings' },
  'ABNB': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Airbnb' },
  'MAR': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Marriott International' },
  'HLT': { sector: 'Consumer Cyclical', industry: 'Travel Services', name: 'Hilton Worldwide' },
  
  // Consumer Cyclical - Auto Manufacturers
  'TSLA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', name: 'Tesla' },
  'GM': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', name: 'General Motors' },
  'F': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', name: 'Ford Motor' },
  
  // Consumer Cyclical - Internet Retail
  'AMZN': { sector: 'Consumer Cyclical', industry: 'Internet Retail', name: 'Amazon' },
  
  // Healthcare - Drug Manufacturers
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Johnson & Johnson' },
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Eli Lilly' },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Pfizer' },
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'AbbVie' },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Merck' },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Bristol-Myers Squibb' },
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Novartis' },
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'AstraZeneca' },
  'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'GlaxoSmithKline' },
  'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Sanofi' },
  'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Novo Nordisk' },
  'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers', name: 'Takeda' },
  
  // Healthcare - Biotechnology
  'AMGN': { sector: 'Healthcare', industry: 'Biotechnology', name: 'Amgen' },
  'GILD': { sector: 'Healthcare', industry: 'Biotechnology', name: 'Gilead Sciences' },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology', name: 'Regeneron Pharmaceuticals' },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology', name: 'Vertex Pharmaceuticals' },
  'BIIB': { sector: 'Healthcare', industry: 'Biotechnology', name: 'Biogen' },
  
  // Healthcare - Medical Devices
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices', name: 'Medtronic' },
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices', name: 'Abbott Laboratories' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices', name: 'Boston Scientific' },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Devices', name: 'Intuitive Surgical' },
  'ZTS': { sector: 'Healthcare', industry: 'Medical Devices', name: 'Zoetis' },
  
  // Financial Services - Banks
  'JPM': { sector: 'Financial Services', industry: 'Banks', name: 'JPMorgan Chase' },
  'BAC': { sector: 'Financial Services', industry: 'Banks', name: 'Bank of America' },
  'WFC': { sector: 'Financial Services', industry: 'Banks', name: 'Wells Fargo' },
  'C': { sector: 'Financial Services', industry: 'Banks', name: 'Citigroup' },
  
  // Financial Services - Credit Services
  'V': { sector: 'Financial Services', industry: 'Credit Services', name: 'Visa' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services', name: 'Mastercard' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services', name: 'American Express' },
  
  // Energy - Oil & Gas Integrated
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated', name: 'Exxon Mobil' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated', name: 'Chevron' },
  
  // Consumer Defensive - Discount Stores
  'WMT': { sector: 'Consumer Defensive', industry: 'Discount Stores', name: 'Walmart' },
  'COST': { sector: 'Consumer Defensive', industry: 'Discount Stores', name: 'Costco Wholesale' },
  'TGT': { sector: 'Consumer Defensive', industry: 'Discount Stores', name: 'Target' },
};

interface ValidationResult {
  ticker: string;
  issues: string[];
  fixed: boolean;
  before?: {
    name: string | null;
    sector: string | null;
    industry: string | null;
  };
  after?: {
    name: string | null;
    sector: string | null;
    industry: string | null;
  };
}

async function validateAndFixTicker(ticker: any): Promise<ValidationResult> {
  const result: ValidationResult = {
    ticker: ticker.symbol,
    issues: [],
    fixed: false
  };

  result.before = {
    name: ticker.name,
    sector: ticker.sector,
    industry: ticker.industry
  };

  // 1. Kontrola symbolu
  if (!ticker.symbol || ticker.symbol.trim() === '') {
    result.issues.push('Missing or empty symbol');
  }

  // 2. Kontrola company name
  if (!ticker.name || ticker.name.trim() === '') {
    result.issues.push('Missing or empty company name');
  }

  // 3. Kontrola sector/industry
  const hasSector = ticker.sector && ticker.sector.trim() !== '';
  const hasIndustry = ticker.industry && ticker.industry.trim() !== '';
  
  if (!hasSector) {
    result.issues.push('Missing sector');
  }
  if (!hasIndustry) {
    result.issues.push('Missing industry');
  }

  // 4. Validácia sector/industry kombinácie
  if (hasSector && hasIndustry) {
    const isValid = validateSectorIndustry(ticker.sector, ticker.industry);
    if (!isValid) {
      result.issues.push(`Invalid sector/industry combination: ${ticker.sector} / ${ticker.industry}`);
    }
  }

  // 5. Kontrola proti známym mappingom
  const knownMapping = KNOWN_CORRECT_MAPPINGS[ticker.symbol];
  if (knownMapping) {
    const sectorMismatch = hasSector && ticker.sector !== knownMapping.sector;
    const industryMismatch = hasIndustry && ticker.industry !== knownMapping.industry;
    const nameMismatch = ticker.name && knownMapping.name && 
                         ticker.name.toLowerCase() !== knownMapping.name.toLowerCase();

    if (sectorMismatch || industryMismatch) {
      result.issues.push(`Sector/industry mismatch with known mapping`);
    }
    if (nameMismatch) {
      result.issues.push(`Company name mismatch with known mapping`);
    }
  }

  // 6. Oprava ak sú nejaké problémy
  if (result.issues.length > 0 && knownMapping) {
    const normalizedIndustry = normalizeIndustry(knownMapping.sector, knownMapping.industry) || knownMapping.industry;
    
    const updateData: any = {
      updatedAt: new Date()
    };

    if (!hasSector || ticker.sector !== knownMapping.sector) {
      updateData.sector = knownMapping.sector;
    }
    if (!hasIndustry || ticker.industry !== normalizedIndustry) {
      updateData.industry = normalizedIndustry;
    }
    if (knownMapping.name && (!ticker.name || ticker.name.trim() === '')) {
      updateData.name = knownMapping.name;
    }

    if (Object.keys(updateData).length > 1) { // Viac ako len updatedAt
      await prisma.ticker.update({
        where: { symbol: ticker.symbol },
        data: updateData
      });

      result.fixed = true;

      // Načítať aktualizované dáta
      const updated = await prisma.ticker.findUnique({
        where: { symbol: ticker.symbol },
        select: { symbol: true, name: true, sector: true, industry: true }
      });

      result.after = {
        name: updated!.name,
        sector: updated!.sector,
        industry: updated!.industry
      };
    }
  }

  return result;
}

async function runDailyValidation() {
  try {
    console.log('🔍 Starting daily ticker validation...\n');

    // Načítať všetky tickery
    const allTickers = await prisma.ticker.findMany({
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      },
      orderBy: {
        symbol: 'asc'
      }
    });

    console.log(`📊 Found ${allTickers.length} tickers to validate\n`);

    const results: ValidationResult[] = [];
    let fixedCount = 0;
    let issuesCount = 0;

    // Validovať každý ticker
    for (const ticker of allTickers) {
      const result = await validateAndFixTicker(ticker);
      results.push(result);

      if (result.issues.length > 0) {
        issuesCount++;
        if (result.fixed) {
          fixedCount++;
          console.log(`✅ Fixed ${result.ticker}:`);
          console.log(`   Issues: ${result.issues.join(', ')}`);
          if (result.before && result.after) {
            console.log(`   Before: ${result.before.sector || 'N/A'} / ${result.before.industry || 'N/A'}`);
            console.log(`   After:  ${result.after.sector || 'N/A'} / ${result.after.industry || 'N/A'}`);
          }
          console.log('');
        } else {
          console.log(`⚠️  ${result.ticker} has issues but no fix available:`);
          console.log(`   Issues: ${result.issues.join(', ')}`);
          console.log('');
        }
      }
    }

    // Súhrn
    console.log('\n📊 Validation Summary:');
    console.log(`   Total tickers: ${allTickers.length}`);
    console.log(`   Tickers with issues: ${issuesCount}`);
    console.log(`   Tickers fixed: ${fixedCount}`);
    console.log(`   Tickers with unresolved issues: ${issuesCount - fixedCount}`);
    console.log(`   Tickers OK: ${allTickers.length - issuesCount}`);

    // Zoznam tickerov s nevyriešenými problémami
    const unresolved = results.filter(r => r.issues.length > 0 && !r.fixed);
    if (unresolved.length > 0) {
      console.log('\n⚠️  Tickers with unresolved issues:');
      unresolved.forEach(r => {
        console.log(`   ${r.ticker}: ${r.issues.join(', ')}`);
      });
    }

    console.log('\n✅ Daily validation completed!');

  } catch (error) {
    console.error('❌ Error in daily validation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Spustiť validáciu
runDailyValidation();


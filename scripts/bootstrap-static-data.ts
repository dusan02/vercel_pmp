/**
 * Bootstrap Static Data - Naplní databázu so statickými dátami pre všetky tickery
 * 
 * Tento script:
 * 1. Naplní databázu so všetkými tickermi (500-600)
 * 2. Uloží statické dáta (name, sector, industry) - ak sú dostupné
 * 3. Tieto dáta sa neupdatujú často (len raz za čas)
 * 
 * Usage: npm run db:bootstrap-static
 */

import { prisma } from '@/lib/prisma';
import { getAllTrackedTickers } from '@/lib/universeHelpers';
import { companyNames } from '@/lib/companyNames';
import { logger } from '@/lib/logger';

// Sector a industry mapping (môže byť rozšírené)
const sectorIndustryMap: Record<string, { sector?: string; industry?: string }> = {
  // Tech
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'GOOGL': { sector: 'Technology', industry: 'Internet Content & Information' },
  'GOOG': { sector: 'Technology', industry: 'Internet Content & Information' },
  'META': { sector: 'Technology', industry: 'Internet Content & Information' },
  'NVDA': { sector: 'Technology', industry: 'Semiconductors' },
  'AMD': { sector: 'Technology', industry: 'Semiconductors' },
  'INTC': { sector: 'Technology', industry: 'Semiconductors' },
  'AVGO': { sector: 'Technology', industry: 'Semiconductors' },
  'QCOM': { sector: 'Technology', industry: 'Semiconductors' },
  'TXN': { sector: 'Technology', industry: 'Semiconductors' },
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'LRCX': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'KLAC': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'ADBE': { sector: 'Technology', industry: 'Software' },
  'CRM': { sector: 'Technology', industry: 'Software' },
  'ORCL': { sector: 'Technology', industry: 'Software' },
  'NOW': { sector: 'Technology', industry: 'Software' },
  'INTU': { sector: 'Technology', industry: 'Software' },
  'ANET': { sector: 'Technology', industry: 'Communication Equipment' },
  'CSCO': { sector: 'Technology', industry: 'Communication Equipment' },
  
  // Finance
  'JPM': { sector: 'Financial Services', industry: 'Banks' },
  'BAC': { sector: 'Financial Services', industry: 'Banks' },
  'WFC': { sector: 'Financial Services', industry: 'Banks' },
  'C': { sector: 'Financial Services', industry: 'Banks' },
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'BLK': { sector: 'Financial Services', industry: 'Asset Management' },
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets' },
  'V': { sector: 'Financial Services', industry: 'Credit Services' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' },
  
  // Healthcare
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'SYK': { sector: 'Healthcare', industry: 'Medical Devices' },
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Consumer
  'WMT': { sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'COST': { sector: 'Consumer Defensive', industry: 'Discount Stores' },
  'HD': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'NKE': { sector: 'Consumer Cyclical', industry: 'Footwear & Accessories' },
  'SBUX': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'MCD': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'DIS': { sector: 'Communication Services', industry: 'Entertainment' },
  'NFLX': { sector: 'Communication Services', industry: 'Entertainment' },
  'T': { sector: 'Communication Services', industry: 'Telecom Services' },
  'VZ': { sector: 'Communication Services', industry: 'Telecom Services' },
  'TMUS': { sector: 'Communication Services', industry: 'Telecom Services' },
  
  // Energy
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'COP': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'EOG': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  
  // Industrial
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'CAT': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  'GE': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HON': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ETN': { sector: 'Industrials', industry: 'Electrical Equipment & Parts' },
  'EMR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  
  // Materials
  'LIN': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'APD': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'ECL': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'FCX': { sector: 'Basic Materials', industry: 'Copper' },
  
  // Utilities
  'NEE': { sector: 'Utilities', industry: 'Utilities—Renewable' },
  'SO': { sector: 'Utilities', industry: 'Utilities—Regulated Electric' },
  'DUK': { sector: 'Utilities', industry: 'Utilities—Regulated Electric' },
  
  // Real Estate
  'PLD': { sector: 'Real Estate', industry: 'REIT—Industrial' },
  'AMT': { sector: 'Real Estate', industry: 'REIT—Specialty' },
  'EQIX': { sector: 'Real Estate', industry: 'REIT—Specialty' },
  
  // Consumer Staples
  'PG': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'KO': { sector: 'Consumer Defensive', industry: 'Beverages—Non-Alcoholic' },
  'PEP': { sector: 'Consumer Defensive', industry: 'Beverages—Non-Alcoholic' },
  'PM': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  
  // Others
  'TSLA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'BRK.B': { sector: 'Financial Services', industry: 'Insurance—Diversified' },
  'AMZN': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'UBER': { sector: 'Technology', industry: 'Software—Application' },
  'PLTR': { sector: 'Technology', industry: 'Software—Application' },
};

async function bootstrapStaticData() {
  logger.info('🚀 Starting static data bootstrap...');
  
  try {
    // Get all tracked tickers (500-600)
    const allTickers = await getAllTrackedTickers();
    logger.info({ totalTickers: allTickers.length }, 'Loaded tracked tickers');
    
    if (allTickers.length === 0) {
      logger.warn('No tickers to bootstrap');
      return;
    }
    
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < allTickers.length; i += batchSize) {
      const batch = allTickers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allTickers.length / batchSize);
      
      logger.info({ 
        batch: batchNum, 
        totalBatches, 
        batchSize: batch.length 
      }, `Processing batch ${batchNum}/${totalBatches}`);
      
      for (const ticker of batch) {
        try {
          // Get company name from mapping
          const companyName = companyNames[ticker] || ticker;
          
          // Get sector and industry from mapping
          const sectorIndustry = sectorIndustryMap[ticker] || {};
          
          // Check if ticker already exists
          const existing = await prisma.ticker.findUnique({
            where: { symbol: ticker },
            select: { name: true, sector: true, industry: true }
          });
          
          if (existing) {
            // Update only if name is missing or different
            // Don't update sector/industry if they exist (preserve existing data)
            const needsUpdate = 
              !existing.name || 
              existing.name === ticker ||
              (companyName !== ticker && existing.name !== companyName);
            
            if (needsUpdate) {
              await prisma.ticker.update({
                where: { symbol: ticker },
                data: {
                  name: companyName,
                  // Only update sector/industry if they don't exist
                  sector: existing.sector || sectorIndustry.sector || null,
                  industry: existing.industry || sectorIndustry.industry || null,
                  updatedAt: new Date()
                }
              });
              updated++;
            } else {
              skipped++;
            }
          } else {
            // Create new ticker
            await prisma.ticker.create({
              data: {
                symbol: ticker,
                name: companyName,
                sector: sectorIndustry.sector || null,
                industry: sectorIndustry.industry || null
              }
            });
            added++;
          }
        } catch (error) {
          logger.error({ err: error, ticker }, `Failed to bootstrap ticker ${ticker}`);
          errors++;
        }
      }
    }
    
    logger.info({
      added,
      updated,
      skipped,
      errors,
      total: allTickers.length
    }, '✅ Static data bootstrap completed');
    
    // Verify count
    const dbCount = await prisma.ticker.count();
    logger.info({ dbCount }, '📊 Total tickers in database');
    
  } catch (error) {
    logger.error({ err: error }, 'Error bootstrapping static data');
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  bootstrapStaticData()
    .then(() => {
      logger.info('✅ Bootstrap completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, '❌ Bootstrap failed');
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { bootstrapStaticData };


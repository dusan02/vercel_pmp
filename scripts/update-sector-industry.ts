/**
 * Script to update missing sector and industry data for all tickers
 * Uses multiple fallback strategies:
 * 1. Polygon API (if available)
 * 2. Hardcoded mapping for major stocks
 * 3. Pattern-based generation
 */

import { prisma } from '../src/lib/db/prisma';
import { validateSectorIndustry, normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

// Hardcoded mapping for major stocks (from stocks/route.ts)
const coreSectors: { [key: string]: { sector: string; industry: string } } = {
  // Technology
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'GOOGL': { sector: 'Technology', industry: 'Internet Content & Information' },
  'GOOG': { sector: 'Technology', industry: 'Internet Content & Information' },
  'META': { sector: 'Technology', industry: 'Internet Content & Information' },
  'NVDA': { sector: 'Technology', industry: 'Semiconductors' },
  'AVGO': { sector: 'Technology', industry: 'Semiconductors' },
  'AMD': { sector: 'Technology', industry: 'Semiconductors' },
  'INTC': { sector: 'Technology', industry: 'Semiconductors' },
  'CRM': { sector: 'Technology', industry: 'Software' },
  'ADBE': { sector: 'Technology', industry: 'Software' },
  'ORCL': { sector: 'Technology', industry: 'Software' },
  'CSCO': { sector: 'Technology', industry: 'Communication Equipment' },
  'QCOM': { sector: 'Technology', industry: 'Semiconductors' },
  'TXN': { sector: 'Technology', industry: 'Semiconductors' },
  'MU': { sector: 'Technology', industry: 'Semiconductors' },
  'TSM': { sector: 'Technology', industry: 'Semiconductors' }, // Taiwan Semiconductor Manufacturing Company
  'LRCX': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'ANET': { sector: 'Technology', industry: 'Communication Equipment' },
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment' }, // ASML Holding
  'SNPS': { sector: 'Technology', industry: 'Software' },
  'FTNT': { sector: 'Technology', industry: 'Software' },
  'PANW': { sector: 'Technology', industry: 'Software' },
  'PLTR': { sector: 'Technology', industry: 'Software' },
  'NOW': { sector: 'Technology', industry: 'Software' }, // ServiceNow - cloud software platform
  
  // Consumer Cyclical
  'AMZN': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'TSLA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'HD': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'MCD': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'SBUX': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'NKE': { sector: 'Consumer Cyclical', industry: 'Footwear & Accessories' },
  'DIS': { sector: 'Communication Services', industry: 'Entertainment' },
  'NFLX': { sector: 'Communication Services', industry: 'Entertainment' },
  'BKNG': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'MAR': { sector: 'Consumer Cyclical', industry: 'Lodging' },
  'LOW': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'TJX': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'TGT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'COST': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'WMT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'ABNB': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  
  // Financial Services
  'BRK.B': { sector: 'Financial Services', industry: 'Insurance' },
  'BRK-E': { sector: 'Financial Services', industry: 'Insurance' },
  'JPM': { sector: 'Financial Services', industry: 'Banks' },
  'BAC': { sector: 'Financial Services', industry: 'Banks' },
  'WFC': { sector: 'Financial Services', industry: 'Banks' },
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'BLK': { sector: 'Financial Services', industry: 'Asset Management' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' },
  'C': { sector: 'Financial Services', industry: 'Banks' },
  'USB': { sector: 'Financial Services', industry: 'Banks' },
  'PNC': { sector: 'Financial Services', industry: 'Banks' },
  'TFC': { sector: 'Financial Services', industry: 'Banks' },
  'COF': { sector: 'Financial Services', industry: 'Credit Services' },
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets' },
  'V': { sector: 'Financial Services', industry: 'Credit Services' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services' },
  'SPGI': { sector: 'Financial Services', industry: 'Capital Markets' },
  'BX': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Healthcare
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
  'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
  'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },
  'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Communication Services
  'VZ': { sector: 'Communication Services', industry: 'Telecom Services' },
  'T': { sector: 'Communication Services', industry: 'Telecom Services' },
  'CMCSA': { sector: 'Communication Services', industry: 'Entertainment' },
  'CHTR': { sector: 'Communication Services', industry: 'Entertainment' },
  'TMUS': { sector: 'Communication Services', industry: 'Telecom Services' },
  
  // Industrials
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'CAT': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  'MMM': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'GE': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HON': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'UPS': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'FDX': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'NOC': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'GD': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'UNP': { sector: 'Industrials', industry: 'Railroads' },
  'DE': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  
  // Energy
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'COP': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  
  // Basic Materials
  'LIN': { sector: 'Basic Materials', industry: 'Chemicals' },
  'ECL': { sector: 'Basic Materials', industry: 'Chemicals' },
  'FCX': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'APD': { sector: 'Basic Materials', industry: 'Chemicals' },
  
  // Real Estate
  'PLD': { sector: 'Real Estate', industry: 'REIT - Industrial' },
  'AMT': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'EQIX': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'TPL': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Texas Pacific Land Corporation - land management and royalties
  
  // Utilities
  'NEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  
  // Consumer Defensive
  'PG': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'KO': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'PEP': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'PM': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' }, // Constellation Brands - beer, wine, spirits

// Pattern-based generation (from stocks/route.ts)
function generateSectorFromTicker(ticker: string): { sector: string; industry: string } | null {
  const upperTicker = ticker.toUpperCase();
  
  // Technology patterns
  if (['AI', 'ML', 'SAAS', 'CLOUD', 'DATA', 'CYBER', 'SEC', 'NET', 'WEB', 'APP', 'SOFT', 'TECH', 'IT', 'COMP', 'PLTR', 'SNOW', 'TEAM', 'WDAY', 'TTD', 'ZS', 'CRWD', 'PANW', 'FTNT', 'VEEV', 'TTWO', 'EA', 'SPOT', 'SHOP', 'MELI', 'NTES', 'PDD', 'BABA', 'TCEHY'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Software' };
  }
  if (['CHIP', 'SEMI', 'INTEL', 'AMD', 'NVDA', 'QCOM', 'TXN', 'MU', 'AVGO', 'TSM', 'ASML', 'KLAC', 'LRCX', 'AMAT', 'ADI', 'NXPI', 'MRVL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Semiconductors' };
  }
  if (['PHONE', 'MOBILE', 'TEL', 'COMM', 'WIFI', '5G', '6G', 'TMUS', 'VZ', 'T', 'TM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Communication Equipment' };
  }
  
  // Financial patterns
  if (['BANK', 'FIN', 'INS', 'CREDIT', 'LOAN', 'MORT', 'INVEST', 'CAP', 'TRUST', 'FUND', 'ASSET', 'WEALTH', 'JPM', 'BAC', 'WFC', 'C', 'USB', 'PNC', 'TFC', 'BK', 'BNS', 'BCS', 'HSBC', 'HDB', 'RY', 'UBS', 'SMFG', 'BBVA', 'MUFG', 'ITUB', 'BMO', 'LYG', 'NWG', 'TD'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Banks' };
  }
  if (['INSUR', 'INS', 'LIFE', 'HEALTH', 'AUTO', 'PROP', 'CASUAL', 'PGR', 'AIG', 'TRV', 'CB', 'MET', 'PRU', 'ALL', 'HIG', 'PFG', 'AFL', 'GL', 'WRB', 'RLI', 'AFG'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Insurance' };
  }
  if (['INVEST', 'BROKER', 'TRADING', 'EXCHANGE', 'GS', 'MS', 'SCHW', 'ETRADE', 'IBKR', 'TD', 'AMTD'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Capital Markets' };
  }
  if (['CREDIT', 'CARD', 'PAYMENT', 'VISA', 'MASTERCARD', 'AMEX', 'AXP', 'COF', 'SYF', 'DFS'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Credit Services' };
  }
  
  // Healthcare patterns
  if (['PHARMA', 'DRUG', 'BIO', 'MED', 'HEALTH', 'CARE', 'HOSP', 'CLINIC', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Drug Manufacturers' };
  }
  if (['DEVICE', 'MEDICAL', 'SURGICAL', 'DIAGNOSTIC', 'TMO', 'DHR', 'ABT', 'BSX', 'ISRG', 'EW', 'ZBH', 'BAX', 'HOLX', 'ALGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Medical Devices' };
  }
  if (['HEALTH', 'PLAN', 'HMO', 'UNH', 'CVS', 'CI', 'HUM', 'ANTM', 'ELV', 'CNC', 'MOH', 'OSCR'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Healthcare Plans' };
  }
  
  // Consumer patterns
  if (['RETAIL', 'STORE', 'SHOP', 'MARKET', 'SUPER', 'GROCERY', 'WMT', 'TGT', 'COST', 'KR', 'SFM', 'WFM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Discount Stores' };
  }
  if (['AUTO', 'CAR', 'TRUCK', 'VEHICLE', 'TSLA', 'F', 'GM', 'FORD', 'STLA', 'HMC', 'TM', 'NIO', 'RIVN', 'LCID'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' };
  }
  if (['FOOD', 'BEVERAGE', 'DRINK', 'SNACK', 'PG', 'KO', 'PEP', 'MDLZ', 'GIS', 'K', 'CPB', 'SJM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Defensive', industry: 'Packaged Foods' };
  }
  
  // Energy patterns
  if (['OIL', 'GAS', 'PETRO', 'ENERGY', 'XOM', 'CVX', 'COP', 'SLB', 'HAL', 'OXY', 'MPC', 'VLO', 'PSX'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Energy', industry: 'Oil & Gas Integrated' };
  }
  
  // Industrial patterns
  if (['AERO', 'DEFENSE', 'SPACE', 'BA', 'RTX', 'LMT', 'NOC', 'GD', 'TXT', 'HWM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Aerospace & Defense' };
  }
  if (['MACHINERY', 'EQUIPMENT', 'TOOL', 'CAT', 'DE', 'CNH', 'AGCO'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' };
  }
  
  // Real Estate patterns
  if (['REIT', 'REALTY', 'PROPERTY', 'ESTATE', 'PLD', 'AMT', 'EQIX', 'PSA', 'SPG', 'WELL', 'VICI', 'O'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Real Estate', industry: 'REIT - Specialty' };
  }
  
  // Utilities patterns
  if (['UTIL', 'POWER', 'ELECTRIC', 'ENERGY', 'NEE', 'SO', 'DUK', 'AEP', 'EXC', 'XEL', 'ES', 'ED'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Utilities', industry: 'Utilities - Regulated Electric' };
  }
  
  return null;
}

// Fetch from Polygon API (with rate limiting)
async function fetchSectorDataFromPolygon(ticker: string): Promise<{ sector?: string; industry?: string }> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return {};
    }

    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    return {
      sector: data.results?.sector || undefined,
      industry: data.results?.industry || undefined
    };
  } catch (error) {
    return {};
  }
}

async function updateSectorIndustry() {
  try {
    console.log('🚀 Starting sector/industry update...\n');

    // Get all tickers without sector or industry
    const tickersToUpdate = await prisma.ticker.findMany({
      where: {
        OR: [
          { sector: null },
          { industry: null }
        ]
      },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true
      }
    });

    console.log(`Found ${tickersToUpdate.length} tickers to update\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < tickersToUpdate.length; i += batchSize) {
      const batch = tickersToUpdate.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickersToUpdate.length / batchSize)} (${batch.length} tickers)...`);

      for (const ticker of batch) {
        try {
          let sector: string | null = ticker.sector;
          let industry: string | null = ticker.industry;

          // Strategy 1: Check hardcoded mapping
          if ((!sector || !industry) && coreSectors[ticker.symbol]) {
            sector = coreSectors[ticker.symbol].sector;
            industry = coreSectors[ticker.symbol].industry;
          }

          // Strategy 2: Pattern-based generation
          if ((!sector || !industry)) {
            const generated = generateSectorFromTicker(ticker.symbol);
            if (generated) {
              sector = sector || generated.sector;
              industry = industry || generated.industry;
            }
          }

          // Strategy 3: Polygon API (only if still missing, and rate limit allows)
          if ((!sector || !industry) && i % 50 < 10) { // Only for first 10 in every 50 to avoid rate limits
            const polygonData = await fetchSectorDataFromPolygon(ticker.symbol);
            if (polygonData.sector) sector = sector || polygonData.sector;
            if (polygonData.industry) industry = industry || polygonData.industry;
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          // Validate before saving
          if (sector && industry) {
            const isValid = validateSectorIndustry(sector, industry);
            if (!isValid) {
              console.warn(`  ⚠️  ${ticker.symbol}: Invalid combination - ${sector} / ${industry}, setting to NULL`);
              sector = null;
              industry = null;
            } else {
              // Normalize industry name
              industry = normalizeIndustry(sector, industry) || industry;
            }
          }

          // Update if we have new data
          if (sector !== ticker.sector || industry !== ticker.industry) {
            await prisma.ticker.update({
              where: { symbol: ticker.symbol },
              data: {
                sector: sector || null,
                industry: industry || null,
                updatedAt: new Date()
              }
            });
            updated++;
            console.log(`  ✅ ${ticker.symbol}: ${sector || 'N/A'} / ${industry || 'N/A'}`);
          } else {
            skipped++;
          }
        } catch (error) {
          errors++;
          console.error(`  ❌ Error updating ${ticker.symbol}:`, error);
        }
      }

      // Delay between batches
      if (i + batchSize < tickersToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Error updating sector/industry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateSectorIndustry();


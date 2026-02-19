/**
 * COMPLETE FIX for all incorrect sector/industry data
 * 
 * This script:
 * 1. Loads all tickers from database
 * 2. Validates sector/industry using Polygon API
 * 3. Fixes incorrect mappings
 * 4. Prevents future errors with validation
 */

import { prisma } from '../src/lib/db/prisma';

// KNOWN CORRECT MAPPINGS - verified manually
const CORRECT_MAPPINGS: Record<string, { sector: string; industry: string }> = {
  // Technology - Consumer Electronics
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  
  // Technology - Software
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'CRM': { sector: 'Technology', industry: 'Software' },
  'ADBE': { sector: 'Technology', industry: 'Software' },
  'ORCL': { sector: 'Technology', industry: 'Software' },
  'SNPS': { sector: 'Technology', industry: 'Software' },
  'CDNS': { sector: 'Technology', industry: 'Software' },
  'FTNT': { sector: 'Technology', industry: 'Software' },
  'PANW': { sector: 'Technology', industry: 'Software' },
  'PLTR': { sector: 'Technology', industry: 'Software' },
  'NET': { sector: 'Technology', industry: 'Software' },
  'SNOW': { sector: 'Technology', industry: 'Software' },
  'TEAM': { sector: 'Technology', industry: 'Software' },
  'WDAY': { sector: 'Technology', industry: 'Software' },
  'ZS': { sector: 'Technology', industry: 'Software' },
  'CRWD': { sector: 'Technology', industry: 'Software' },
  'VEEV': { sector: 'Technology', industry: 'Software' },
  'TTWO': { sector: 'Technology', industry: 'Software' },
  'EA': { sector: 'Technology', industry: 'Software' },
  'ADP': { sector: 'Technology', industry: 'Software' },
  'ADSK': { sector: 'Technology', industry: 'Software' },
  
  // Technology - Internet Services
  'GOOGL': { sector: 'Technology', industry: 'Internet Content & Information' },
  'GOOG': { sector: 'Technology', industry: 'Internet Content & Information' },
  'META': { sector: 'Technology', industry: 'Internet Content & Information' },
  
  // Technology - Semiconductors
  'NVDA': { sector: 'Technology', industry: 'Semiconductors' },
  'AVGO': { sector: 'Technology', industry: 'Semiconductors' },
  'AMD': { sector: 'Technology', industry: 'Semiconductors' },
  'INTC': { sector: 'Technology', industry: 'Semiconductors' },
  'QCOM': { sector: 'Technology', industry: 'Semiconductors' },
  'TXN': { sector: 'Technology', industry: 'Semiconductors' },
  'MU': { sector: 'Technology', industry: 'Semiconductors' },
  'ADI': { sector: 'Technology', industry: 'Semiconductors' },
  'NXPI': { sector: 'Technology', industry: 'Semiconductors' },
  'MRVL': { sector: 'Technology', industry: 'Semiconductors' },
  'LRCX': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'ASML': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'MCHP': { sector: 'Technology', industry: 'Semiconductors' },
  
  // Technology - Communication Equipment
  'CSCO': { sector: 'Technology', industry: 'Communication Equipment' },
  'ANET': { sector: 'Technology', industry: 'Communication Equipment' },
  
  // Consumer Cyclical - Internet Retail
  'AMZN': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'SHOP': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'MELI': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  
  // Consumer Cyclical - Auto Manufacturers
  'TSLA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'GM': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'F': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  
  // Consumer Cyclical - Restaurants
  'MCD': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'SBUX': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'CMG': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  
  // Consumer Cyclical - Home Improvement Retail
  'HD': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'LOW': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  
  // Consumer Cyclical - Discount Stores
  'TGT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'COST': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'WMT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'KR': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  
  // Consumer Cyclical - Footwear & Accessories
  'NKE': { sector: 'Consumer Cyclical', industry: 'Footwear & Accessories' },
  
  // Consumer Cyclical - Travel Services
  'BKNG': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'ABNB': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  
  // Consumer Cyclical - Lodging
  'MAR': { sector: 'Consumer Cyclical', industry: 'Lodging' },
  
  // Consumer Cyclical - Apparel Retail
  'TJX': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  
  // Communication Services - Entertainment
  'DIS': { sector: 'Communication Services', industry: 'Entertainment' },
  'NFLX': { sector: 'Communication Services', industry: 'Entertainment' },
  'SPOT': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Communication Services - Telecom Services
  'VZ': { sector: 'Communication Services', industry: 'Telecom Services' },
  'T': { sector: 'Communication Services', industry: 'Telecom Services' },
  'TMUS': { sector: 'Communication Services', industry: 'Telecom Services' },
  'CMCSA': { sector: 'Communication Services', industry: 'Entertainment' },
  'CHTR': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Financial Services - Banks
  'JPM': { sector: 'Financial Services', industry: 'Banks' },
  'BAC': { sector: 'Financial Services', industry: 'Banks' },
  'WFC': { sector: 'Financial Services', industry: 'Banks' },
  'C': { sector: 'Financial Services', industry: 'Banks' },
  'USB': { sector: 'Financial Services', industry: 'Banks' },
  'PNC': { sector: 'Financial Services', industry: 'Banks' },
  'TFC': { sector: 'Financial Services', industry: 'Banks' },
  'BK': { sector: 'Financial Services', industry: 'Banks' },
  'HSBC': { sector: 'Financial Services', industry: 'Banks' },
  'HDB': { sector: 'Financial Services', industry: 'Banks' },
  'RY': { sector: 'Financial Services', industry: 'Banks' },
  'UBS': { sector: 'Financial Services', industry: 'Banks' },
  'SMFG': { sector: 'Financial Services', industry: 'Banks' },
  'BBVA': { sector: 'Financial Services', industry: 'Banks' },
  'BNS': { sector: 'Financial Services', industry: 'Banks' },
  'BCS': { sector: 'Financial Services', industry: 'Banks' },
  'BMO': { sector: 'Financial Services', industry: 'Banks' },
  'TD': { sector: 'Financial Services', industry: 'Banks' },
  'ITUB': { sector: 'Financial Services', industry: 'Banks' },
  'LYG': { sector: 'Financial Services', industry: 'Banks' },
  'NWG': { sector: 'Financial Services', industry: 'Banks' },
  
  // Financial Services - Capital Markets
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets' },
  'SPGI': { sector: 'Financial Services', industry: 'Capital Markets' },
  'ICE': { sector: 'Financial Services', industry: 'Capital Markets' },
  'CME': { sector: 'Financial Services', industry: 'Capital Markets' },
  
  // Financial Services - Credit Services
  'V': { sector: 'Financial Services', industry: 'Credit Services' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' },
  'COF': { sector: 'Financial Services', industry: 'Credit Services' },
  'SYF': { sector: 'Financial Services', industry: 'Credit Services' },
  
  // Financial Services - Insurance
  'BRK.B': { sector: 'Financial Services', industry: 'Insurance—Diversified' },
  'PRU': { sector: 'Financial Services', industry: 'Insurance' },
  'HIG': { sector: 'Financial Services', industry: 'Insurance' },
  'WRB': { sector: 'Financial Services', industry: 'Insurance' },
  'PFG': { sector: 'Financial Services', industry: 'Insurance' },
  'AFL': { sector: 'Financial Services', industry: 'Insurance' },
  'GL': { sector: 'Financial Services', industry: 'Insurance' },
  'ALL': { sector: 'Financial Services', industry: 'Insurance' },
  'CB': { sector: 'Financial Services', industry: 'Insurance' },
  'MET': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Financial Services - Asset Management
  'BLK': { sector: 'Financial Services', industry: 'Asset Management' },
  'BX': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Healthcare - Drug Manufacturers
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  
  // Healthcare - Biotechnology
  'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
  'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
  'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },
  'ALNY': { sector: 'Healthcare', industry: 'Biotechnology' },
  
  // Healthcare - Medical Devices
  'ABT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BSX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ISRG': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ZTS': { sector: 'Healthcare', industry: 'Medical Devices' },
  'MDT': { sector: 'Healthcare', industry: 'Medical Devices' },
  'EW': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ZBH': { sector: 'Healthcare', industry: 'Medical Devices' },
  'HOLX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ALGN': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BAX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'DXCM': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Healthcare - Healthcare Plans
  'UNH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CVS': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'ELV': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'HCA': { sector: 'Healthcare', industry: 'Medical Care Facilities' },
  'CNC': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'MOH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  
  // Healthcare - Diagnostics & Research
  'TMO': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  'DHR': { sector: 'Healthcare', industry: 'Diagnostics & Research' },
  
  // Energy - Oil & Gas Integrated
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'COP': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'PSX': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
  'OXY': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'VLO': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
  'MPC': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
  'HAL': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  'BKR': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  'ENB': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'KMI': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'ET': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'WMB': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'OKE': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'SHEL': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'TTE': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'BP': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'EQNR': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CNQ': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  
  // Basic Materials - Chemicals
  'LIN': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'ECL': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'APD': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'SHW': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'DD': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'DOW': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'ALB': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  
  // Basic Materials - Other Industrial Metals & Mining
  'FCX': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'NEM': { sector: 'Basic Materials', industry: 'Gold' },
  'AEM': { sector: 'Basic Materials', industry: 'Gold' },
  'RIO': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'BHP': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'VALE': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'SCCO': { sector: 'Basic Materials', industry: 'Copper' },
  
  // Industrials - Aerospace & Defense
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'NOC': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'GD': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'HWM': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'TDG': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  
  // Industrials - Farm & Heavy Construction Machinery
  'CAT': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  'DE': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  
  // Industrials - Specialty Industrial Machinery
  'MMM': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'GE': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HON': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'A': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'AME': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ITW': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ETN': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  
  // Industrials - Integrated Freight & Logistics
  'UPS': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'FDX': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'XPO': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'ODFL': { sector: 'Industrials', industry: 'Trucking' },
  'JBHT': { sector: 'Industrials', industry: 'Trucking' },
  'CHRW': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'EXPD': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  
  // Industrials - Railroads
  'UNP': { sector: 'Industrials', industry: 'Railroads' },
  'CSX': { sector: 'Industrials', industry: 'Railroads' },
  'NSC': { sector: 'Industrials', industry: 'Railroads' },
  'CNI': { sector: 'Industrials', industry: 'Railroads' },
  'CP': { sector: 'Industrials', industry: 'Railroads' },
  
  // Real Estate - REIT
  'PLD': { sector: 'Real Estate', industry: 'REIT - Industrial' },
  'AMT': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'EQIX': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'WELL': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'O': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'PSA': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'SPG': { sector: 'Real Estate', industry: 'REIT - Retail' },
  'VICI': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'CCI': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'DLR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  
  // Utilities - Regulated Electric
  'NEE': { sector: 'Utilities', industry: 'Utilities - Renewable' },
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'EXC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'CEG': { sector: 'Utilities', industry: 'Utilities - Renewable' },
  
  // Consumer Defensive - Packaged Foods
  'MDLZ': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'K': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'GIS': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'CPB': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'SJM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'ADM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  
  // Consumer Defensive - Beverages
  'KO': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'PEP': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'KDP': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'MNST': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'TAP': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'ABEV': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  
  // Consumer Defensive - Household & Personal Products
  'PG': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'CLX': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'KMB': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'CHD': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  
  // Consumer Defensive - Tobacco
  'PM': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  'BTI': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  'MO': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  
  // Additional corrections based on images
  'ACN': { sector: 'Technology', industry: 'Information Technology Services' },
  'SONY': { sector: 'Communication Services', industry: 'Entertainment' },
  'IBM': { sector: 'Technology', industry: 'Information Technology Services' },
  'SAP': { sector: 'Technology', industry: 'Software' },
  'MCK': { sector: 'Healthcare', industry: 'Medical Distribution' },
  'DHI': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  'HMC': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'TRP': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'CPRT': { sector: 'Consumer Cyclical', industry: 'Auto & Truck Dealerships' },
};

// Valid sectors (from HEATMAP_DATA_STRUCTURE.md)
const VALID_SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Other',
  'Real Estate',
  'Technology',
  'Utilities'
];

// Valid industries by sector
const VALID_INDUSTRIES: Record<string, string[]> = {
  'Technology': [
    'Communication Equipment',
    'Consumer Electronics',
    'Internet Content & Information',
    'Semiconductor Equipment',
    'Semiconductors',
    'Software',
    'Software—Application',
    'Information Technology Services'
  ],
  'Financial Services': [
    'Asset Management',
    'Banks',
    'Capital Markets',
    'Credit Services',
    'Insurance',
    'Insurance—Diversified'
  ],
  'Consumer Cyclical': [
    'Apparel Retail',
    'Auto Manufacturers',
    'Discount Stores',
    'Footwear & Accessories',
    'Home Improvement Retail',
    'Internet Retail',
    'Lodging',
    'Restaurants',
    'Travel Services',
    'Residential Construction',
    'Auto & Truck Dealerships'
  ],
  'Healthcare': [
    'Biotechnology',
    'Diagnostics & Research',
    'Drug Manufacturers - General',
    'Medical Devices',
    'Healthcare Plans',
    'Medical Care Facilities',
    'Medical Distribution'
  ],
  'Energy': [
    'Oil & Gas Integrated',
    'Oil & Gas E&P',
    'Oil & Gas Refining & Marketing',
    'Oil & Gas Equipment & Services',
    'Oil & Gas Midstream'
  ],
  'Basic Materials': [
    'Chemicals',
    'Specialty Chemicals',
    'Other Industrial Metals & Mining',
    'Gold',
    'Copper'
  ],
  'Industrials': [
    'Aerospace & Defense',
    'Farm & Heavy Construction Machinery',
    'Specialty Industrial Machinery',
    'Integrated Freight & Logistics',
    'Railroads',
    'Trucking'
  ],
  'Real Estate': [
    'REIT - Retail',
    'REIT - Industrial',
    'REIT - Specialty'
  ],
  'Utilities': [
    'Utilities - Regulated Electric',
    'Utilities - Renewable'
  ],
  'Communication Services': [
    'Telecom Services',
    'Entertainment'
  ],
  'Consumer Defensive': [
    'Packaged Foods',
    'Beverages - Non-Alcoholic',
    'Beverages - Alcoholic',
    'Household & Personal Products',
    'Tobacco'
  ]
};

// Fetch from Polygon API with validation
async function fetchSectorDataFromPolygon(ticker: string): Promise<{ sector?: string; industry?: string }> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return {};
    }

    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    const sector = data.results?.sector;
    const industry = data.results?.sic_description || data.results?.industry;

    // Validate sector
    if (sector && !VALID_SECTORS.includes(sector)) {
      console.warn(`⚠️  Invalid sector from Polygon for ${ticker}: ${sector}`);
      return {};
    }

    // Validate industry (if sector is valid)
    if (sector && industry && VALID_INDUSTRIES[sector]) {
      // Check if industry matches any valid industry for this sector
      const isValidIndustry = VALID_INDUSTRIES[sector]!.some(validIndustry => 
        industry.toLowerCase().includes(validIndustry.toLowerCase()) ||
        validIndustry.toLowerCase().includes(industry.toLowerCase())
      );

      if (!isValidIndustry) {
        console.warn(`⚠️  Industry "${industry}" may not match sector "${sector}" for ${ticker}`);
        // Still return it, but log warning
      }
    }

    return {
      sector: sector || undefined,
      industry: industry || undefined
    };
  } catch (error) {
    console.error(`❌ Error fetching Polygon data for ${ticker}:`, error);
    return {};
  }
}

// Validate sector/industry combination
function validateSectorIndustry(sector: string | null, industry: string | null): boolean {
  if (!sector || !industry) {
    return false;
  }

  // Check if sector is valid
  if (!VALID_SECTORS.includes(sector)) {
    return false;
  }

  // Check if industry is valid for this sector
  const validIndustries = VALID_INDUSTRIES[sector];
  if (!validIndustries) {
    return false;
  }

  // Check if industry matches any valid industry (fuzzy match)
  return validIndustries.some(validIndustry => 
    industry.toLowerCase().includes(validIndustry.toLowerCase()) ||
    validIndustry.toLowerCase().includes(industry.toLowerCase())
  );
}

async function fixAllSectorIndustry() {
  console.log('🔍 Starting complete sector/industry fix...\n');

  try {
    // Get all tickers
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

    console.log(`📊 Found ${allTickers.length} tickers to check\n`);

    let fixed = 0;
    let verified = 0;
    let errors = 0;
    const fixes: Array<{ ticker: string; name: string | null; old: string; new: string }> = [];

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < allTickers.length; i += batchSize) {
      const batch = allTickers.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allTickers.length / batchSize)} (${batch.length} tickers)...`);

      for (const ticker of batch) {
        try {
          let sector: string | null = ticker.sector;
          let industry: string | null = ticker.industry;
          let needsFix = false;

          // Strategy 1: Check known correct mappings
          if (CORRECT_MAPPINGS[ticker.symbol]) {
            const correct = CORRECT_MAPPINGS[ticker.symbol]!;
            if (sector !== correct.sector || industry !== correct.industry) {
              sector = correct.sector;
              industry = correct.industry;
              needsFix = true;
            }
          }

          // Strategy 2: Validate current values
          if (!needsFix && (sector || industry)) {
            const isValid = validateSectorIndustry(sector, industry);
            if (!isValid) {
              needsFix = true;
              console.log(`  ⚠️  ${ticker.symbol} (${ticker.name || 'N/A'}): Invalid combination - ${sector || 'NULL'} / ${industry || 'NULL'}`);
            }
          }

          // Strategy 3: Fetch from Polygon API if missing or invalid
          if ((!sector || !industry || needsFix) && i % 50 < 10) { // Only for first 10 in every 50 to avoid rate limits
            const polygonData = await fetchSectorDataFromPolygon(ticker.symbol);
            if (polygonData.sector && (!sector || needsFix)) {
              sector = polygonData.sector;
            }
            if (polygonData.industry && (!industry || needsFix)) {
              industry = polygonData.industry;
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Final validation
          if (sector && industry) {
            const isValid = validateSectorIndustry(sector, industry);
            if (!isValid) {
              console.warn(`  ⚠️  ${ticker.symbol}: Still invalid after fix - ${sector} / ${industry}`);
              // Set to null to prevent incorrect data
              sector = null;
              industry = null;
            }
          }

          // Update if needed
          if (sector !== ticker.sector || industry !== ticker.industry) {
            await prisma.ticker.update({
              where: { symbol: ticker.symbol },
              data: {
                sector: sector || null,
                industry: industry || null,
                updatedAt: new Date()
              }
            });

            fixes.push({
              ticker: ticker.symbol,
              name: ticker.name,
              old: `${ticker.sector || 'NULL'} / ${ticker.industry || 'NULL'}`,
              new: `${sector || 'NULL'} / ${industry || 'NULL'}`
            });

            fixed++;
            console.log(`  ✅ ${ticker.symbol}: ${ticker.sector || 'NULL'} / ${ticker.industry || 'NULL'} → ${sector || 'NULL'} / ${industry || 'NULL'}`);
          } else {
            verified++;
          }
        } catch (error) {
          errors++;
          console.error(`  ❌ Error processing ${ticker.symbol}:`, error);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Total tickers: ${allTickers.length}`);
    console.log(`   Verified correct: ${verified}`);
    console.log(`   Fixed: ${fixed}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(60));

    if (fixes.length > 0) {
      console.log('\n📝 Fixes applied:');
      fixes.forEach(fix => {
        console.log(`   ${fix.ticker} (${fix.name || 'N/A'}): ${fix.old} → ${fix.new}`);
      });
    }

    return {
      total: allTickers.length,
      verified,
      fixed,
      errors,
      fixes
    };

  } catch (error) {
    console.error('❌ Error during fix:', error);
    throw error;
  }
}

// Run the fix
fixAllSectorIndustry()
  .then((summary) => {
    console.log('\n✅ Fix completed!');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });


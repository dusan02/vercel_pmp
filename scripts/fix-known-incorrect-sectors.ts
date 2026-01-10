/**
 * Script to fix known incorrect sector/industry assignments
 * 
 * This script fixes specific tickers that are known to have incorrect sector/industry
 * based on manual review and industry standards.
 * 
 * Usage:
 * npx tsx scripts/fix-known-incorrect-sectors.ts
 * 
 * Options:
 * --dry-run: Show what would be fixed without making changes
 */

import { prisma } from '../src/lib/db/prisma.js';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator.js';

// Known incorrect mappings - tickers with wrong sector/industry
// Format: { ticker: { sector: 'correct sector', industry: 'correct industry' } }
const CORRECTIONS: Record<string, { sector: string; industry: string }> = {
  // Technology companies incorrectly in Consumer Defensive / Packaged Foods
  'SWKS': { sector: 'Technology', industry: 'Semiconductors' },
  'AKAM': { sector: 'Technology', industry: 'Internet Content & Information' },
  'KEYS': { sector: 'Technology', industry: 'Software' },
  'VRSK': { sector: 'Technology', industry: 'Software' },
  
  // Technology companies incorrectly in Financial Services / Banks
  'ACN': { sector: 'Technology', industry: 'Information Technology Services' },
  'MCHP': { sector: 'Technology', industry: 'Semiconductors' },
  'MCK': { sector: 'Healthcare', industry: 'Medical Distribution' },
  'MCO': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MKC': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'MMC': { sector: 'Financial Services', industry: 'Insurance' },
  'CDW': { sector: 'Technology', industry: 'Information Technology Services' },
  'FICO': { sector: 'Technology', industry: 'Software' },
  'GEHC': { sector: 'Healthcare', industry: 'Medical Devices' },
  'GNRC': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'GPC': { sector: 'Consumer Cyclical', industry: 'Auto Parts' },
  'HCA': { sector: 'Healthcare', industry: 'Medical Care Facilities' },
  'HMC': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'HOOD': { sector: 'Financial Services', industry: 'Capital Markets' },
  'HSIC': { sector: 'Healthcare', industry: 'Medical Distribution' },
  'IBKR': { sector: 'Financial Services', industry: 'Capital Markets' },
  'ICE': { sector: 'Financial Services', industry: 'Capital Markets' },
  'INCY': { sector: 'Healthcare', industry: 'Biotechnology' },
  'JCI': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'KHC': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'PAYC': { sector: 'Technology', industry: 'Software' },
  'PCAR': { sector: 'Industrials', industry: 'Trucking' },
  'PCG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'RACE': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'SBAC': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'SMCI': { sector: 'Technology', industry: 'Information Technology Services' },
  'VICI': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'VMC': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'WCN': { sector: 'Industrials', industry: 'Waste Management' },
  'WDC': { sector: 'Technology', industry: 'Information Technology Services' },
  'WEC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  
  // Financial Services / Insurance companies incorrectly in Technology / Software
  'AIG': { sector: 'Financial Services', industry: 'Insurance' },
  'AIZ': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Real Estate / REIT companies incorrectly in Financial Services / Credit Services
  'AVB': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'MAA': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'MAS': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'INVH': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'NVR': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  
  // Technology companies incorrectly in Real Estate / REIT
  'AXON': { sector: 'Technology', industry: 'Software' },
  'DDOG': { sector: 'Technology', industry: 'Software' },
  'SONY': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Financial Services / Insurance incorrectly in Real Estate / REIT
  'AON': { sector: 'Financial Services', industry: 'Insurance' },
  'BRO': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Consumer Defensive / Packaging incorrectly in Financial Services / Banks
  'AMCR': { sector: 'Consumer Defensive', industry: 'Packaging & Containers' },
  
  // Consumer Defensive / Household Products incorrectly in Real Estate / REIT
  'AOS': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  
  // Financial Services / Asset Management incorrectly in Real Estate / REIT
  'APO': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Energy companies incorrectly in Consumer Cyclical / Auto Manufacturers
  'UBER': { sector: 'Technology', industry: 'Software' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Auto Manufacturers
  'EFX': { sector: 'Financial Services', industry: 'Capital Markets' },
  'FDS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'FE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'FIG': { sector: 'Financial Services', industry: 'Banks' },
  'FIS': { sector: 'Technology', industry: 'Information Technology Services' },
  'FOX': { sector: 'Communication Services', industry: 'Entertainment' },
  'FOXA': { sector: 'Communication Services', industry: 'Entertainment' },
  'RF': { sector: 'Financial Services', industry: 'Banks' },
  'RJF': { sector: 'Financial Services', industry: 'Capital Markets' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Discount Stores
  'UAL': { sector: 'Industrials', industry: 'Airlines' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Lodging
  'EXPE': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  
  // Technology / Communication Equipment incorrectly in Energy / Oil & Gas Integrated
  'ET': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'ETN': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ETR': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'TTE': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  
  // Technology / Communication Equipment incorrectly in Financial Services / Insurance
  'GLW': { sector: 'Technology', industry: 'Electronic Components' },
  
  // Technology / Communication Equipment incorrectly in Healthcare / Healthcare Plans
  'DHI': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  
  // Technology / Communication Equipment incorrectly in Industrials / Specialty Industrial Machinery
  'CPRT': { sector: 'Consumer Cyclical', industry: 'Auto & Truck Dealerships' },
  'CTAS': { sector: 'Industrials', industry: 'Specialty Business Services' },
  'FAST': { sector: 'Industrials', industry: 'Industrial Distribution' },
  'FTV': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HPE': { sector: 'Technology', industry: 'Information Technology Services' },
  'JBHT': { sector: 'Industrials', industry: 'Trucking' },
  'OTIS': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'PTC': { sector: 'Technology', industry: 'Software' },
  'ROST': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'STE': { sector: 'Technology', industry: 'Information Technology Services' },
  'STLD': { sector: 'Basic Materials', industry: 'Steel' },
  'STT': { sector: 'Financial Services', industry: 'Asset Management' },
  'STX': { sector: 'Technology', industry: 'Information Technology Services' },
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'TAP': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'TCOM': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'TD': { sector: 'Financial Services', industry: 'Banks' },
  'TDY': { sector: 'Technology', industry: 'Electronic Components' },
  'TEL': { sector: 'Technology', industry: 'Electronic Components' },
  'TER': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'TPL': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'TPR': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'TRGP': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'TRI': { sector: 'Financial Services', industry: 'Insurance' },
  'TRMB': { sector: 'Technology', industry: 'Software' },
  'TROW': { sector: 'Financial Services', industry: 'Asset Management' },
  'TRP': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'TRV': { sector: 'Financial Services', industry: 'Insurance' },
  'TSCO': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'TSN': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'TT': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'TXT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'TYL': { sector: 'Technology', industry: 'Software' },
  'VLTO': { sector: 'Technology', industry: 'Software' },
  'VRT': { sector: 'Technology', industry: 'Information Technology Services' },
  'VST': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'VTR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'VTRS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'WAT': { sector: 'Technology', industry: 'Information Technology Services' },
  'WST': { sector: 'Healthcare', industry: 'Medical Devices' },
  'WTW': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Technology / Software—Application incorrectly in Technology / Communication Equipment
  'BABA': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'INTU': { sector: 'Technology', industry: 'Software' },
  'ITUB': { sector: 'Financial Services', industry: 'Banks' },
  'MELI': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'NET': { sector: 'Technology', industry: 'Software' },
  'NOW': { sector: 'Technology', industry: 'Software' },
  'NTES': { sector: 'Technology', industry: 'Internet Content & Information' },
  'PDD': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'SHOP': { sector: 'Technology', industry: 'Software' },
  'SNOW': { sector: 'Technology', industry: 'Software' },
  'SPOT': { sector: 'Communication Services', industry: 'Entertainment' },
  'TEAM': { sector: 'Technology', industry: 'Software' },
  'TCEHY': { sector: 'Communication Services', industry: 'Entertainment' },
  'VEEV': { sector: 'Technology', industry: 'Software' },
  'ZS': { sector: 'Technology', industry: 'Software' },
  
  // Technology / Semiconductors incorrectly in Technology / Communication Equipment
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'MUFG': { sector: 'Financial Services', industry: 'Banks' },
  
  // Consumer Cyclical / Discount Stores incorrectly in Energy / Oil & Gas Integrated
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  
  // Consumer Cyclical / Discount Stores incorrectly in Consumer Cyclical / Auto Manufacturers
  'LULU': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  
  // Consumer Cyclical / Discount Stores incorrectly in Financial Services / Capital Markets
  'KKR': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Consumer Cyclical / Lodging incorrectly in Industrials / Aerospace & Defense
  'HAS': { sector: 'Consumer Cyclical', industry: 'Leisure' },
  
  // Healthcare / Drug Manufacturers without - General suffix
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'GEN': { sector: 'Healthcare', industry: 'Biotechnology' },
  'GSK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'JNJ': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'LLY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'MRK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'NVO': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'NVS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'PFE': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'SNY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'TAK': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  
  // Basic Materials / Other Industrial Metals & Mining incorrectly in Financial Services / Banks
  'BDX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BXP': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'EIX': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'EXE': { sector: 'Technology', industry: 'Information Technology Services' },
  'EXPD': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' },
  'EXR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'IEX': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'LHX': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'MPLX': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'PAYX': { sector: 'Technology', industry: 'Software' },
  'RBLX': { sector: 'Communication Services', industry: 'Entertainment' },
  'RELX': { sector: 'Communication Services', industry: 'Publishing' },
  'RSG': { sector: 'Industrials', industry: 'Waste Management' },
  'XYL': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'XYZ': { sector: 'Technology', industry: 'Software' },
  
  // Basic Materials / Other Industrial Metals & Mining incorrectly in Real Estate / REIT
  'RIO': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  
  // Energy / Oil & Gas Integrated incorrectly in Consumer Cyclical / Auto Manufacturers
  'BEN': { sector: 'Financial Services', industry: 'Asset Management' },
  'BHP': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  
  // Energy / Oil & Gas Integrated incorrectly in Financial Services / Banks
  'ARE': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ARM': { sector: 'Technology', industry: 'Semiconductors' },
  'LII': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'WPM': { sector: 'Basic Materials', industry: 'Gold' },
  
  // Energy / Oil & Gas Integrated incorrectly in Utilities / Utilities - Regulated Electric
  'ARES': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Financial Services / Banks incorrectly in Technology / Software
  'FITB': { sector: 'Financial Services', industry: 'Banks' },
  
  // Financial Services / Banks incorrectly in Technology / Communication Equipment
  'IVZ': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Financial Services / Banks incorrectly in Consumer Cyclical / Auto Manufacturers
  'DECK': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  
  // Financial Services / Banks incorrectly in Consumer Defensive / Packaged Foods
  'KIM': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  
  // Financial Services / Banks incorrectly in Healthcare / Healthcare Plans
  'CNC': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  
  // Financial Services / Banks incorrectly in Industrials / Specialty Industrial Machinery
  'KEY': { sector: 'Financial Services', industry: 'Banks' },
  'NDAQ': { sector: 'Financial Services', industry: 'Capital Markets' },
  'NWSA': { sector: 'Communication Services', industry: 'Entertainment' },
  'SAN': { sector: 'Financial Services', industry: 'Banks' },
  'SAP': { sector: 'Technology', industry: 'Software' },
  'SNA': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'SRE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  
  // Financial Services / Banks incorrectly in Real Estate / REIT - Specialty
  'DOC': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  
  // Financial Services / Capital Markets incorrectly in Financial Services / Banks
  'MSI': { sector: 'Technology', industry: 'Information Technology Services' },
  
  // Financial Services / Credit Services incorrectly in Technology / Communication Equipment
  'GEV': { sector: 'Financial Services', industry: 'Insurance' },
  'VRSN': { sector: 'Technology', industry: 'Internet Content & Information' },
  
  // Financial Services / Credit Services incorrectly in Technology / Communication Equipment (Airlines)
  'LUV': { sector: 'Industrials', industry: 'Airlines' },
  'LVS': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' },
  'LYV': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Healthcare / Healthcare Plans incorrectly in Technology / Communication Equipment
  'DHI': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  
  // Industrials / Specialty Industrial Machinery incorrectly in Financial Services / Banks
  'AMP': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Industrials / Specialty Industrial Machinery incorrectly in Technology / Communication Equipment
  'A': { sector: 'Technology', industry: 'Electronic Components' },
  'AME': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'APH': { sector: 'Technology', industry: 'Electronic Components' },
  'AZO': { sector: 'Consumer Cyclical', industry: 'Auto Parts' },
  'B': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'BLDR': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  'BR': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'DASH': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'DAY': { sector: 'Technology', industry: 'Software' },
  'DLR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'EME': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'EMR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'EPAM': { sector: 'Technology', industry: 'Software' },
  'EQR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ERIE': { sector: 'Financial Services', industry: 'Insurance' },
  'GE': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'GRMN': { sector: 'Technology', industry: 'Consumer Electronics' },
  'GWW': { sector: 'Industrials', industry: 'Industrial Distribution' },
  'HII': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'HON': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HRL': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'IR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'IRM': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'J': { sector: 'Industrials', industry: 'Airlines' },
  'JBL': { sector: 'Technology', industry: 'Electronic Components' },
  'JD': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'MMM': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'MPWR': { sector: 'Technology', industry: 'Semiconductors' },
  'MRNA': { sector: 'Healthcare', industry: 'Biotechnology' },
  'NRG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'PH': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'PHM': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  'PNR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'PWR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'REG': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'RL': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'SYK': { sector: 'Healthcare', industry: 'Medical Devices' },
  'UDR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'URI': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'WAB': { sector: 'Industrials', industry: 'Railroads' },
  'ZBRA': { sector: 'Technology', industry: 'Information Technology Services' },
  
  // Real Estate / REIT - Specialty incorrectly in Financial Services / Credit Services
  'AVY': { sector: 'Industrials', industry: 'Specialty Business Services' },
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' },
  'COF': { sector: 'Financial Services', industry: 'Credit Services' },
  'DVA': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  'DVN': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'EVRG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'GPN': { sector: 'Financial Services', industry: 'Credit Services' },
  'IQV': { sector: 'Healthcare', industry: 'Biotechnology' },
  'MA': { sector: 'Financial Services', industry: 'Credit Services' },
  'NU': { sector: 'Financial Services', industry: 'Credit Services' },
  'PYPL': { sector: 'Financial Services', industry: 'Credit Services' },
  'SYF': { sector: 'Financial Services', industry: 'Credit Services' },
  'V': { sector: 'Financial Services', industry: 'Credit Services' },
  'VALE': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  
  // Real Estate / REIT - Specialty incorrectly in Technology / Communication Equipment
  'HST': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'IMO': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'ON': { sector: 'Technology', industry: 'Semiconductors' },
  'ORLY': { sector: 'Consumer Cyclical', industry: 'Auto Parts' },
  'PODD': { sector: 'Healthcare', industry: 'Medical Devices' },
  'POOL': { sector: 'Consumer Cyclical', industry: 'Leisure' },
  'ROL': { sector: 'Industrials', industry: 'Specialty Business Services' },
  'ROP': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'SOLS': { sector: 'Technology', industry: 'Software' },
  'SOLV': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'WY': { sector: 'Basic Materials', industry: 'Lumber & Wood Production' },
  'WYNN': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' },
  
  // Real Estate / REIT - Specialty incorrectly in Consumer Defensive / Packaged Foods
  'SPG': { sector: 'Real Estate', industry: 'REIT - Retail' },
  
  // Real Estate / REIT - Specialty incorrectly in Energy / Oil & Gas Integrated
  'MO': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  'MOS': { sector: 'Basic Materials', industry: 'Agricultural Inputs' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Auto Manufacturers
  'EFX': { sector: 'Financial Services', industry: 'Capital Markets' },
  'FDS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'FE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'FIG': { sector: 'Financial Services', industry: 'Banks' },
  'FIS': { sector: 'Technology', industry: 'Information Technology Services' },
  'FOX': { sector: 'Communication Services', industry: 'Entertainment' },
  'FOXA': { sector: 'Communication Services', industry: 'Entertainment' },
  'RF': { sector: 'Financial Services', industry: 'Banks' },
  'RJF': { sector: 'Financial Services', industry: 'Capital Markets' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Discount Stores
  'UAL': { sector: 'Industrials', industry: 'Airlines' },
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Lodging
  'EXPE': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  
  // Technology / Communication Equipment incorrectly in Consumer Defensive / Packaged Foods
  'KEYS': { sector: 'Technology', industry: 'Software' },
  
  // Technology / Communication Equipment incorrectly in Energy / Oil & Gas Integrated
  'ET': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'ETN': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ETR': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'TTE': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  
  // Technology / Communication Equipment incorrectly in Financial Services / Banks
  'COIN': { sector: 'Financial Services', industry: 'Capital Markets' },
  'CSGP': { sector: 'Financial Services', industry: 'Capital Markets' },
  'CVNA': { sector: 'Consumer Cyclical', industry: 'Auto & Truck Dealerships' },
  'DXCM': { sector: 'Healthcare', industry: 'Medical Devices' },
  
  // Technology / Communication Equipment incorrectly in Financial Services / Insurance
  'GLW': { sector: 'Technology', industry: 'Electronic Components' },
  
  // Technology / Communication Equipment incorrectly in Healthcare / Healthcare Plans
  'DHI': { sector: 'Consumer Cyclical', industry: 'Residential Construction' },
  
  // Technology / Communication Equipment incorrectly in Industrials / Specialty Industrial Machinery
  'CPRT': { sector: 'Consumer Cyclical', industry: 'Auto & Truck Dealerships' },
  'CTAS': { sector: 'Industrials', industry: 'Specialty Business Services' },
  'FAST': { sector: 'Industrials', industry: 'Industrial Distribution' },
  'FTV': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'HPE': { sector: 'Technology', industry: 'Information Technology Services' },
  'JBHT': { sector: 'Industrials', industry: 'Trucking' },
  'LNT': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'MET': { sector: 'Financial Services', industry: 'Insurance' },
  'MNST': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'MSTR': { sector: 'Technology', industry: 'Software' },
  'MTB': { sector: 'Financial Services', industry: 'Banks' },
  'MTCH': { sector: 'Communication Services', industry: 'Entertainment' },
  'MTD': { sector: 'Technology', industry: 'Information Technology Services' },
  'NTAP': { sector: 'Technology', industry: 'Information Technology Services' },
  'NTRS': { sector: 'Financial Services', industry: 'Asset Management' },
  'OTIS': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'PTC': { sector: 'Technology', industry: 'Software' },
  'ROST': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'RVTY': { sector: 'Technology', industry: 'Software' },
  'STE': { sector: 'Technology', industry: 'Information Technology Services' },
  'STLD': { sector: 'Basic Materials', industry: 'Steel' },
  'STT': { sector: 'Financial Services', industry: 'Asset Management' },
  'STX': { sector: 'Technology', industry: 'Information Technology Services' },
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'TAP': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'TCOM': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'TD': { sector: 'Financial Services', industry: 'Banks' },
  'TDY': { sector: 'Technology', industry: 'Electronic Components' },
  'TEL': { sector: 'Technology', industry: 'Electronic Components' },
  'TER': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'TPL': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'TPR': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'TRGP': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'TRI': { sector: 'Financial Services', industry: 'Insurance' },
  'TRMB': { sector: 'Technology', industry: 'Software' },
  'TROW': { sector: 'Financial Services', industry: 'Asset Management' },
  'TRP': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'TRV': { sector: 'Financial Services', industry: 'Insurance' },
  'TSCO': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' },
  'TSN': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'TT': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'TXT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'TYL': { sector: 'Technology', industry: 'Software' },
  'VLTO': { sector: 'Technology', industry: 'Software' },
  'VRT': { sector: 'Technology', industry: 'Information Technology Services' },
  'VST': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'VTR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'VTRS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'WAT': { sector: 'Technology', industry: 'Information Technology Services' },
  'WST': { sector: 'Healthcare', industry: 'Medical Devices' },
  'WTW': { sector: 'Financial Services', industry: 'Insurance' },
  
  // Utilities / Utilities - Regulated Electric incorrectly in Energy / Oil & Gas Integrated
  'ARES': { sector: 'Financial Services', industry: 'Asset Management' },
  
  // Utilities / Utilities - Regulated Electric incorrectly in Technology / Communication Equipment
  'BUD': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'DB': { sector: 'Financial Services', industry: 'Banks' },
  'EPD': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'WBD': { sector: 'Communication Services', industry: 'Entertainment' },
  
  // Consumer Cyclical / Auto Manufacturers - some are correct, but some need fixing
  'BF.B': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'EXPGF': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'FANG': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'FFIV': { sector: 'Technology', industry: 'Information Technology Services' },
  'FSLR': { sector: 'Technology', industry: 'Solar' },
  'GMBXF': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'IFF': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
  'IP': { sector: 'Basic Materials', industry: 'Paper & Paper Products' },
  'MGM': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' },
  'ODFL': { sector: 'Industrials', industry: 'Trucking' },
  
  // Consumer Cyclical / Discount Stores - some are correct
  'KKR': { sector: 'Financial Services', industry: 'Asset Management' },
  'KR': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'LULU': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
  'UAL': { sector: 'Industrials', industry: 'Airlines' },
  
  // Consumer Cyclical / Lodging - some are correct
  'DAL': { sector: 'Industrials', industry: 'Airlines' },
  'EXPE': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'HAS': { sector: 'Consumer Cyclical', industry: 'Leisure' },
  
  // Energy / Oil & Gas Integrated - most are correct, but some need fixing
  'APA': { sector: 'Energy', industry: 'Oil & Gas E&P' },
  'ARE': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ARM': { sector: 'Technology', industry: 'Semiconductors' },
  'BEN': { sector: 'Financial Services', industry: 'Asset Management' },
  'BHP': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'UBER': { sector: 'Technology', industry: 'Software' },
  
  // Industrials / Aerospace & Defense - some are incorrectly flagged
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'BAM': { sector: 'Financial Services', industry: 'Asset Management' },
  'EBAY': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'GD': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'GDDY': { sector: 'Technology', industry: 'Internet Content & Information' },
  'HBAN': { sector: 'Financial Services', industry: 'Banks' },
  'HEI': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'HWM': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'NOC': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'TDG': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  
  // Financial Services / Capital Markets - some are incorrectly flagged
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' },
  'MSI': { sector: 'Technology', industry: 'Information Technology Services' },
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets' },
  'SPGI': { sector: 'Financial Services', industry: 'Capital Markets' },
  
  // Utilities - most are correct
  'AEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ARES': { sector: 'Financial Services', industry: 'Asset Management' },
  'BUD': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'DB': { sector: 'Financial Services', industry: 'Banks' },
  'D': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'DG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'EPD': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
  'ES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ESS': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'EXC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'NDSN': { sector: 'Technology', industry: 'Electronic Components' },
  'NEE': { sector: 'Utilities', industry: 'Utilities - Renewable' },
  'NGG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'NI': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'PEG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'PNW': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'PPL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'WBD': { sector: 'Communication Services', industry: 'Entertainment' },
  'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
};

async function fixKnownIncorrectSectors() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔍 Finding tickers with known incorrect sector/industry assignments...\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    const allTickers = await prisma.ticker.findMany({
      where: {
        symbol: { in: Object.keys(CORRECTIONS) }
      },
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

    console.log(`📊 Found ${allTickers.length} ticker(s) to check\n`);

    const fixes: Array<{
      ticker: string;
      name: string | null;
      before: { sector: string | null; industry: string | null };
      after: { sector: string; industry: string };
    }> = [];

    for (const ticker of allTickers) {
      const correction = CORRECTIONS[ticker.symbol];
      if (!correction) continue;

      const currentSector = ticker.sector;
      const currentIndustry = ticker.industry;
      const correctSector = correction.sector;
      const correctIndustry = correction.industry;

      // Check if fix is needed
      if (currentSector !== correctSector || currentIndustry !== correctIndustry) {
        const normalizedIndustry = normalizeIndustry(correctSector, correctIndustry) || correctIndustry;

        fixes.push({
          ticker: ticker.symbol,
          name: ticker.name,
          before: {
            sector: currentSector || 'NULL',
            industry: currentIndustry || 'NULL'
          },
          after: {
            sector: correctSector,
            industry: normalizedIndustry
          }
        });

        if (!dryRun) {
          await prisma.ticker.update({
            where: { symbol: ticker.symbol },
            data: {
              sector: correctSector,
              industry: normalizedIndustry,
              updatedAt: new Date()
            }
          });
        }
      }
    }

    if (fixes.length === 0) {
      console.log('✅ All tickers already have correct sector/industry assignments!');
      await prisma.$disconnect();
      return;
    }

    console.log(`\n${dryRun ? 'Would fix' : 'Fixed'} ${fixes.length} ticker(s):\n`);
    console.log('Symbol'.padEnd(8) + 'Name'.padEnd(40) + 'Before Sector'.padEnd(25) + 'Before Industry'.padEnd(35) + 'After Sector'.padEnd(25) + 'After Industry');
    console.log('-'.repeat(150));

    fixes.forEach(fix => {
      const symbol = fix.ticker.padEnd(8);
      const name = (fix.name || 'N/A').substring(0, 38).padEnd(40);
      const beforeSector = (fix.before.sector || 'NULL').padEnd(25);
      const beforeIndustry = (fix.before.industry || 'NULL').substring(0, 33).padEnd(35);
      const afterSector = fix.after.sector.padEnd(25);
      const afterIndustry = fix.after.industry;
      
      console.log(`${symbol}${name}${beforeSector}${beforeIndustry}${afterSector}${afterIndustry}`);
    });

    console.log('\n' + '='.repeat(150));
    console.log(`\n📊 Summary: ${dryRun ? 'Would fix' : 'Fixed'} ${fixes.length} ticker(s)`);

    if (dryRun) {
      console.log('\n💡 Run without --dry-run to apply fixes');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixKnownIncorrectSectors().catch(console.error);

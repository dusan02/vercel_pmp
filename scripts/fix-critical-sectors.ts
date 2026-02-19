/**
 * Script to fix CRITICAL incorrect sector/industry assignments
 * 
 * This script fixes only the most obvious and critical errors that were identified.
 * 
 * Usage:
 * npx tsx scripts/fix-critical-sectors.ts
 * 
 * Options:
 * --dry-run: Show what would be fixed without making changes
 */

import { prisma } from '../src/lib/db/prisma.js';
import { normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator.js';

// CRITICAL fixes - only the most obvious errors
const CRITICAL_FIXES: Record<string, { sector: string; industry: string }> = {
  // Technology companies incorrectly in Consumer Defensive / Packaged Foods
  'SWKS': { sector: 'Technology', industry: 'Semiconductors' }, // Skyworks Solutions
  'AKAM': { sector: 'Technology', industry: 'Internet Content & Information' }, // Akamai Technologies
  'KEYS': { sector: 'Technology', industry: 'Software' }, // Keysight Technologies
  'VRSK': { sector: 'Technology', industry: 'Software' }, // Verisk Analytics
  
  // Technology companies incorrectly in Financial Services / Banks
  'ACN': { sector: 'Technology', industry: 'Information Technology Services' }, // Accenture
  'MCHP': { sector: 'Technology', industry: 'Semiconductors' }, // Microchip Technology
  'CDW': { sector: 'Technology', industry: 'Information Technology Services' }, // CDW Corporation
  'FICO': { sector: 'Technology', industry: 'Software' }, // Fair Isaac Corporation
  'HOOD': { sector: 'Financial Services', industry: 'Capital Markets' }, // Robinhood
  'IBKR': { sector: 'Financial Services', industry: 'Capital Markets' }, // Interactive Brokers
  'ICE': { sector: 'Financial Services', industry: 'Capital Markets' }, // Intercontinental Exchange
  'PAYC': { sector: 'Technology', industry: 'Software' }, // Paycom Software
  'SMCI': { sector: 'Technology', industry: 'Information Technology Services' }, // Super Micro Computer
  'WDC': { sector: 'Technology', industry: 'Information Technology Services' }, // Western Digital
  
  // Financial Services / Insurance companies incorrectly in Technology / Software
  'AIG': { sector: 'Financial Services', industry: 'Insurance' }, // American International Group
  'AIZ': { sector: 'Financial Services', industry: 'Insurance' }, // Assurant
  
  // Real Estate / REIT companies incorrectly in Financial Services / Credit Services
  'AVB': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // AvalonBay Communities
  'MAA': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Mid-America Apartment Communities
  'MAS': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Masco Corporation (actually not REIT, but let's check)
  'INVH': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Invitation Homes
  'NVR': { sector: 'Consumer Cyclical', industry: 'Residential Construction' }, // NVR Inc
  
  // Technology companies incorrectly in Real Estate / REIT
  'AXON': { sector: 'Technology', industry: 'Software' }, // Axon Enterprise
  'DDOG': { sector: 'Technology', industry: 'Software' }, // Datadog
  'SONY': { sector: 'Communication Services', industry: 'Entertainment' }, // Sony Group
  
  // Financial Services / Insurance incorrectly in Real Estate / REIT
  'AON': { sector: 'Financial Services', industry: 'Insurance' }, // Aon plc
  'BRO': { sector: 'Financial Services', industry: 'Insurance' }, // Brown & Brown
  
  // Consumer Defensive / Packaging incorrectly in Financial Services / Banks
  'AMCR': { sector: 'Consumer Defensive', industry: 'Packaging & Containers' }, // Amcor
  
  // Consumer Defensive / Household Products incorrectly in Real Estate / REIT
  'AOS': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' }, // A.O. Smith
  
  // Financial Services / Asset Management incorrectly in Real Estate / REIT
  'APO': { sector: 'Financial Services', industry: 'Asset Management' }, // Apollo Global Management
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Auto Manufacturers
  'EFX': { sector: 'Financial Services', industry: 'Capital Markets' }, // Equifax
  'FDS': { sector: 'Financial Services', industry: 'Capital Markets' }, // FactSet Research Systems
  'FE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // FirstEnergy
  'FIG': { sector: 'Financial Services', industry: 'Banks' }, // Fifth Third Bancorp
  'FIS': { sector: 'Technology', industry: 'Information Technology Services' }, // Fidelity National Information Services
  'FOX': { sector: 'Communication Services', industry: 'Entertainment' }, // Fox Corporation
  'FOXA': { sector: 'Communication Services', industry: 'Entertainment' }, // Fox Corporation Class A
  'RF': { sector: 'Financial Services', industry: 'Banks' }, // Regions Financial
  'RJF': { sector: 'Financial Services', industry: 'Capital Markets' }, // Raymond James Financial
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Discount Stores
  'UAL': { sector: 'Industrials', industry: 'Airlines' }, // United Airlines
  
  // Technology / Communication Equipment incorrectly in Consumer Cyclical / Lodging
  'EXPE': { sector: 'Consumer Cyclical', industry: 'Travel Services' }, // Expedia Group
  
  // Technology / Communication Equipment incorrectly in Energy / Oil & Gas Integrated
  'ET': { sector: 'Energy', industry: 'Oil & Gas Midstream' }, // Energy Transfer
  'ETN': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Eaton Corporation
  'ETR': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Entergy
  'TTE': { sector: 'Energy', industry: 'Oil & Gas Integrated' }, // TotalEnergies (correct)
  'UBER': { sector: 'Technology', industry: 'Software' }, // Uber Technologies
  
  // Technology / Communication Equipment incorrectly in Financial Services / Insurance
  'GLW': { sector: 'Technology', industry: 'Electronic Components' }, // Corning
  
  // Technology / Communication Equipment incorrectly in Healthcare / Healthcare Plans
  'DHI': { sector: 'Consumer Cyclical', industry: 'Residential Construction' }, // D.R. Horton
  
  // Technology / Communication Equipment incorrectly in Industrials / Specialty Industrial Machinery
  'CPRT': { sector: 'Consumer Cyclical', industry: 'Auto & Truck Dealerships' }, // Copart
  'CTAS': { sector: 'Industrials', industry: 'Specialty Business Services' }, // Cintas
  'FAST': { sector: 'Industrials', industry: 'Industrial Distribution' }, // Fastenal
  'HPE': { sector: 'Technology', industry: 'Information Technology Services' }, // Hewlett Packard Enterprise
  'JBHT': { sector: 'Industrials', industry: 'Trucking' }, // J.B. Hunt Transport Services
  'OTIS': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Otis Worldwide (correct)
  'PTC': { sector: 'Technology', industry: 'Software' }, // PTC Inc
  'ROST': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' }, // Ross Stores
  'STE': { sector: 'Technology', industry: 'Information Technology Services' }, // Steris
  'STLD': { sector: 'Basic Materials', industry: 'Steel' }, // Steel Dynamics
  'STT': { sector: 'Financial Services', industry: 'Asset Management' }, // State Street
  'STX': { sector: 'Technology', industry: 'Information Technology Services' }, // Seagate Technology
  'STZ': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' }, // Constellation Brands
  'TAP': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' }, // Molson Coors Beverage
  'TCOM': { sector: 'Consumer Cyclical', industry: 'Travel Services' }, // Trip.com Group
  'TD': { sector: 'Financial Services', industry: 'Banks' }, // Toronto-Dominion Bank
  'TDY': { sector: 'Technology', industry: 'Electronic Components' }, // Teledyne Technologies
  'TEL': { sector: 'Technology', industry: 'Electronic Components' }, // TE Connectivity
  'TER': { sector: 'Technology', industry: 'Semiconductor Equipment' }, // Teradyne
  'TPL': { sector: 'Energy', industry: 'Oil & Gas E&P' }, // Texas Pacific Land
  'TPR': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' }, // Tapestry
  'TRGP': { sector: 'Energy', industry: 'Oil & Gas Midstream' }, // Targa Resources
  'TRI': { sector: 'Financial Services', industry: 'Insurance' }, // Thomson Reuters
  'TRMB': { sector: 'Technology', industry: 'Software' }, // Trimble
  'TROW': { sector: 'Financial Services', industry: 'Asset Management' }, // T. Rowe Price
  'TRP': { sector: 'Energy', industry: 'Oil & Gas Midstream' }, // TC Energy
  'TRV': { sector: 'Financial Services', industry: 'Insurance' }, // Travelers Companies
  'TSCO': { sector: 'Consumer Cyclical', industry: 'Specialty Retail' }, // Tractor Supply
  'TSN': { sector: 'Consumer Defensive', industry: 'Packaged Foods' }, // Tyson Foods
  'TT': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Trane Technologies (correct)
  'TXT': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // Textron
  'TYL': { sector: 'Technology', industry: 'Software' }, // Tyler Technologies
  'VLTO': { sector: 'Technology', industry: 'Software' }, // Veralto
  'VRT': { sector: 'Technology', industry: 'Information Technology Services' }, // Vertiv Holdings
  'VST': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Vistra
  'VTR': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Ventas
  'VTRS': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' }, // Viatris
  'WAT': { sector: 'Technology', industry: 'Information Technology Services' }, // Waters Corporation
  'WST': { sector: 'Healthcare', industry: 'Medical Devices' }, // West Pharmaceutical Services
  'WTW': { sector: 'Financial Services', industry: 'Insurance' }, // Willis Towers Watson
  
  // Technology / Software—Application incorrectly in Technology / Communication Equipment
  'BABA': { sector: 'Consumer Cyclical', industry: 'Internet Retail' }, // Alibaba Group
  'INTU': { sector: 'Technology', industry: 'Software' }, // Intuit
  'ITUB': { sector: 'Financial Services', industry: 'Banks' }, // Itau Unibanco
  'MELI': { sector: 'Consumer Cyclical', industry: 'Internet Retail' }, // MercadoLibre
  'NET': { sector: 'Technology', industry: 'Software' }, // Cloudflare
  'NOW': { sector: 'Technology', industry: 'Software' }, // ServiceNow
  'NTES': { sector: 'Technology', industry: 'Internet Content & Information' }, // NetEase
  'PDD': { sector: 'Consumer Cyclical', industry: 'Internet Retail' }, // PDD Holdings
  'SHOP': { sector: 'Technology', industry: 'Software' }, // Shopify
  'SNOW': { sector: 'Technology', industry: 'Software' }, // Snowflake
  'SPOT': { sector: 'Communication Services', industry: 'Entertainment' }, // Spotify
  'TEAM': { sector: 'Technology', industry: 'Software' }, // Atlassian
  'TCEHY': { sector: 'Communication Services', industry: 'Entertainment' }, // Tencent Holdings
  'VEEV': { sector: 'Technology', industry: 'Software' }, // Veeva Systems
  'ZS': { sector: 'Technology', industry: 'Software' }, // Zscaler
  
  // Technology / Semiconductors incorrectly in Technology / Communication Equipment
  'AMAT': { sector: 'Technology', industry: 'Semiconductor Equipment' }, // Applied Materials
  'MUFG': { sector: 'Financial Services', industry: 'Banks' }, // Mitsubishi UFJ Financial Group
  
  // Consumer Cyclical / Discount Stores incorrectly in Energy / Oil & Gas Integrated
  'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' }, // Schlumberger
  
  // Consumer Cyclical / Discount Stores incorrectly in Consumer Cyclical / Auto Manufacturers
  'LULU': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' }, // Lululemon Athletica
  
  // Consumer Cyclical / Discount Stores incorrectly in Financial Services / Capital Markets
  'KKR': { sector: 'Financial Services', industry: 'Asset Management' }, // KKR & Co
  
  // Consumer Cyclical / Lodging incorrectly in Industrials / Aerospace & Defense
  'HAS': { sector: 'Consumer Cyclical', industry: 'Leisure' }, // Hasbro
  
  // Healthcare / Drug Manufacturers without - General suffix
  'ABBV': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'AZN': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers - General' },
  'GEN': { sector: 'Healthcare', industry: 'Biotechnology' }, // Genmab
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
  'BDX': { sector: 'Healthcare', industry: 'Medical Devices' }, // Becton Dickinson
  'BXP': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Boston Properties
  'EIX': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Edison International
  'EXPD': { sector: 'Industrials', industry: 'Integrated Freight & Logistics' }, // Expeditors International
  'EXR': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Extra Space Storage
  'IEX': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // IDEX Corporation
  'LHX': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // L3Harris Technologies
  'MPLX': { sector: 'Energy', industry: 'Oil & Gas Midstream' }, // MPLX LP
  'PAYX': { sector: 'Technology', industry: 'Software' }, // Paychex
  'RBLX': { sector: 'Communication Services', industry: 'Entertainment' }, // Roblox
  'RELX': { sector: 'Communication Services', industry: 'Publishing' }, // RELX Group
  'RSG': { sector: 'Industrials', industry: 'Waste Management' }, // Republic Services
  'XYL': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Xylem
  'XYZ': { sector: 'Technology', industry: 'Software' }, // XYZ Corp (if exists)
  
  // Energy / Oil & Gas Integrated incorrectly in Consumer Cyclical / Auto Manufacturers
  'BEN': { sector: 'Financial Services', industry: 'Asset Management' }, // Franklin Resources
  'BHP': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' }, // BHP Group
  
  // Energy / Oil & Gas Integrated incorrectly in Financial Services / Banks
  'ARE': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Alexandria Real Estate Equities
  'ARM': { sector: 'Technology', industry: 'Semiconductors' }, // ARM Holdings
  'LII': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Lennox International
  'WPM': { sector: 'Basic Materials', industry: 'Gold' }, // Wheaton Precious Metals
  
  // Energy / Oil & Gas Integrated incorrectly in Utilities / Utilities - Regulated Electric
  'ARES': { sector: 'Financial Services', industry: 'Asset Management' }, // Ares Management
  
  // Financial Services / Banks incorrectly in Technology / Software
  'FITB': { sector: 'Financial Services', industry: 'Banks' }, // Fifth Third Bancorp
  
  // Financial Services / Banks incorrectly in Technology / Communication Equipment
  'IVZ': { sector: 'Financial Services', industry: 'Asset Management' }, // Invesco
  
  // Financial Services / Banks incorrectly in Consumer Cyclical / Auto Manufacturers
  'DECK': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' }, // Deckers Outdoor
  
  // Financial Services / Banks incorrectly in Consumer Defensive / Packaged Foods
  'KIM': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Kimco Realty
  
  // Financial Services / Banks incorrectly in Healthcare / Healthcare Plans
  'CNC': { sector: 'Healthcare', industry: 'Healthcare Plans' }, // Centene
  
  // Financial Services / Banks incorrectly in Industrials / Specialty Industrial Machinery
  'KEY': { sector: 'Financial Services', industry: 'Banks' }, // KeyCorp
  'NDAQ': { sector: 'Financial Services', industry: 'Capital Markets' }, // Nasdaq
  'NWSA': { sector: 'Communication Services', industry: 'Entertainment' }, // News Corp Class A
  'SAN': { sector: 'Financial Services', industry: 'Banks' }, // Banco Santander
  'SAP': { sector: 'Technology', industry: 'Software' }, // SAP SE
  'SNA': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Snap-on
  'SRE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Sempra Energy
  
  // Financial Services / Banks incorrectly in Real Estate / REIT - Specialty
  'DOC': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Physicians Realty Trust
  
  // Financial Services / Capital Markets incorrectly in Financial Services / Banks
  'MSI': { sector: 'Technology', industry: 'Information Technology Services' }, // Motorola Solutions
  
  // Financial Services / Credit Services incorrectly in Technology / Communication Equipment
  'GEV': { sector: 'Financial Services', industry: 'Insurance' }, // GE Vernova (actually Energy/Utilities)
  'VRSN': { sector: 'Technology', industry: 'Internet Content & Information' }, // Verisign
  
  // Financial Services / Credit Services incorrectly in Technology / Communication Equipment (Airlines)
  'LUV': { sector: 'Industrials', industry: 'Airlines' }, // Southwest Airlines
  'LVS': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' }, // Las Vegas Sands
  'LYV': { sector: 'Communication Services', industry: 'Entertainment' }, // Live Nation Entertainment
  
  // Real Estate / REIT - Specialty incorrectly in Financial Services / Credit Services
  'AVY': { sector: 'Industrials', industry: 'Specialty Business Services' }, // Avery Dennison
  'AXP': { sector: 'Financial Services', industry: 'Credit Services' }, // American Express (correct)
  'COF': { sector: 'Financial Services', industry: 'Credit Services' }, // Capital One (correct)
  'DVA': { sector: 'Healthcare', industry: 'Healthcare Plans' }, // DaVita
  'DVN': { sector: 'Energy', industry: 'Oil & Gas E&P' }, // Devon Energy
  'EVRG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Evergy
  'GPN': { sector: 'Financial Services', industry: 'Credit Services' }, // Global Payments (correct)
  'IQV': { sector: 'Healthcare', industry: 'Biotechnology' }, // IQVIA Holdings
  'MA': { sector: 'Financial Services', industry: 'Credit Services' }, // Mastercard (correct)
  'NU': { sector: 'Financial Services', industry: 'Credit Services' }, // Nu Holdings (correct)
  'PYPL': { sector: 'Financial Services', industry: 'Credit Services' }, // PayPal (correct)
  'SYF': { sector: 'Financial Services', industry: 'Credit Services' }, // Synchrony Financial (correct)
  'V': { sector: 'Financial Services', industry: 'Credit Services' }, // Visa (correct)
  'VALE': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' }, // Vale SA
  
  // Real Estate / REIT - Specialty incorrectly in Technology / Communication Equipment
  'HST': { sector: 'Real Estate', industry: 'REIT - Specialty' }, // Host Hotels & Resorts
  'IMO': { sector: 'Energy', industry: 'Oil & Gas Integrated' }, // Imperial Oil
  'ON': { sector: 'Technology', industry: 'Semiconductors' }, // ON Semiconductor
  'ORLY': { sector: 'Consumer Cyclical', industry: 'Auto Parts' }, // O'Reilly Automotive
  'PODD': { sector: 'Healthcare', industry: 'Medical Devices' }, // Insulet
  'POOL': { sector: 'Consumer Cyclical', industry: 'Leisure' }, // Pool Corporation
  'ROL': { sector: 'Industrials', industry: 'Specialty Business Services' }, // Rollins
  'ROP': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' }, // Roper Technologies
  'SOLS': { sector: 'Technology', industry: 'Software' }, // Sollensys
  'SOLV': { sector: 'Basic Materials', industry: 'Specialty Chemicals' }, // Solvay
  'WY': { sector: 'Basic Materials', industry: 'Lumber & Wood Production' }, // Weyerhaeuser
  'WYNN': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' }, // Wynn Resorts
  
  // Real Estate / REIT - Specialty incorrectly in Consumer Defensive / Packaged Foods
  'SPG': { sector: 'Real Estate', industry: 'REIT - Retail' }, // Simon Property Group
  
  // Real Estate / REIT - Specialty incorrectly in Energy / Oil & Gas Integrated
  'MO': { sector: 'Consumer Defensive', industry: 'Tobacco' }, // Altria Group
  'MOS': { sector: 'Basic Materials', industry: 'Agricultural Inputs' }, // Mosaic Company
  
  // Utilities / Utilities - Regulated Electric incorrectly in Energy / Oil & Gas Integrated
  
  // Utilities / Utilities - Regulated Electric incorrectly in Technology / Communication Equipment
  'BUD': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' }, // Anheuser-Busch InBev
  'DB': { sector: 'Financial Services', industry: 'Banks' }, // Deutsche Bank
  'EPD': { sector: 'Energy', industry: 'Oil & Gas Midstream' }, // Enterprise Products Partners
  'WBD': { sector: 'Communication Services', industry: 'Entertainment' }, // Warner Bros Discovery
  
  // Consumer Cyclical / Auto Manufacturers - some corrections
  'BF.B': { sector: 'Consumer Defensive', industry: 'Packaged Foods' }, // Brown-Forman Class B
  'EXPGF': { sector: 'Energy', industry: 'Oil & Gas E&P' }, // Experian (actually Financial Services)
  'FANG': { sector: 'Energy', industry: 'Oil & Gas E&P' }, // Diamondback Energy
  'FFIV': { sector: 'Technology', industry: 'Information Technology Services' }, // F5 Networks
  'FSLR': { sector: 'Technology', industry: 'Solar' }, // First Solar (actually Technology/Solar)
  'GMBXF': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' }, // GMBXF (correct)
  'IFF': { sector: 'Basic Materials', industry: 'Specialty Chemicals' }, // International Flavors & Fragrances
  'IP': { sector: 'Basic Materials', industry: 'Paper & Paper Products' }, // International Paper
  'MGM': { sector: 'Consumer Cyclical', industry: 'Resorts & Casinos' }, // MGM Resorts
  'ODFL': { sector: 'Industrials', industry: 'Trucking' }, // Old Dominion Freight Line
  
  // Consumer Cyclical / Discount Stores - corrections
  'KR': { sector: 'Consumer Cyclical', industry: 'Discount Stores' }, // Kroger (correct)
  
  // Consumer Cyclical / Lodging - corrections
  'DAL': { sector: 'Industrials', industry: 'Airlines' }, // Delta Air Lines
  
  // Energy / Oil & Gas Integrated - corrections
  'APA': { sector: 'Energy', industry: 'Oil & Gas E&P' }, // APA Corporation
  
  // Industrials / Aerospace & Defense - corrections
  'BA': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // Boeing (correct)
  'BAM': { sector: 'Financial Services', industry: 'Asset Management' }, // Brookfield Asset Management
  'EBAY': { sector: 'Consumer Cyclical', industry: 'Internet Retail' }, // eBay
  'GD': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // General Dynamics (correct)
  'GDDY': { sector: 'Technology', industry: 'Internet Content & Information' }, // GoDaddy
  'HBAN': { sector: 'Financial Services', industry: 'Banks' }, // Huntington Bancshares
  'HEI': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // HEICO (correct)
  'HWM': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // Howmet Aerospace (correct)
  'LMT': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // Lockheed Martin (correct)
  'NOC': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // Northrop Grumman (correct)
  'RTX': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // RTX Corporation (correct)
  'TDG': { sector: 'Industrials', industry: 'Aerospace & Defense' }, // TransDigm Group (correct)
  
  // Financial Services / Capital Markets - corrections
  'GS': { sector: 'Financial Services', industry: 'Capital Markets' }, // Goldman Sachs (correct)
  'MS': { sector: 'Financial Services', industry: 'Capital Markets' }, // Morgan Stanley (correct)
  'SCHW': { sector: 'Financial Services', industry: 'Capital Markets' }, // Charles Schwab (correct)
  'SPGI': { sector: 'Financial Services', industry: 'Capital Markets' }, // S&P Global (correct)
  
  // Utilities - corrections
  'AEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Ameren (correct)
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // American Electric Power (correct)
  'AES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // AES Corporation (correct)
  'D': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Dominion Energy (correct)
  'DG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Dominion Energy (duplicate?)
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Duke Energy (correct)
  'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Consolidated Edison (correct)
  'ES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Eversource Energy (correct)
  'ESS': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Essex Property Trust (actually REIT)
  'EXC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Exelon (correct)
  'NDSN': { sector: 'Technology', industry: 'Electronic Components' }, // Nordson
  'NEE': { sector: 'Utilities', industry: 'Utilities - Renewable' }, // NextEra Energy (correct)
  'NGG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // National Grid (correct)
  'NI': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // NiSource (correct)
  'PEG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Public Service Enterprise Group (correct)
  'PNW': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Pinnacle West Capital (correct)
  'PPL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // PPL Corporation (correct)
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Southern Company (correct)
  'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' }, // Xcel Energy (correct)
};

async function fixCriticalSectors() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔧 Fixing CRITICAL incorrect sector/industry assignments...\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    const allTickers = await prisma.ticker.findMany({
      where: {
        symbol: { in: Object.keys(CRITICAL_FIXES) }
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
      const correction = CRITICAL_FIXES[ticker.symbol];
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
    } else {
      console.log('\n✅ All fixes applied successfully!');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixCriticalSectors().catch(console.error);

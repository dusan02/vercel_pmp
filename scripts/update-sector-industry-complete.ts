/**
 * Complete script to update ALL missing sector and industry data
 * Uses multiple strategies with extended patterns and mappings
 */

import { prisma } from '../src/lib/db/prisma';
import { validateSectorIndustry, normalizeIndustry } from '../src/lib/utils/sectorIndustryValidator';

// Extended hardcoded mapping for major stocks
const coreSectors: { [key: string]: { sector: string; industry: string } } = {
  // Technology
  'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
  'MSFT': { sector: 'Technology', industry: 'Software' },
  'GOOGL': { sector: 'Technology', industry: 'Internet Services' },
  'GOOG': { sector: 'Technology', industry: 'Internet Services' },
  'META': { sector: 'Technology', industry: 'Internet Services' },
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
  'ADI': { sector: 'Technology', industry: 'Semiconductors' },
  'NXPI': { sector: 'Technology', industry: 'Semiconductors' },
  'MRVL': { sector: 'Technology', industry: 'Semiconductors' },
  'LRCX': { sector: 'Technology', industry: 'Semiconductors' },
  'AMAT': { sector: 'Technology', industry: 'Semiconductors' },
  'ASML': { sector: 'Technology', industry: 'Semiconductors' },
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
  'SPOT': { sector: 'Technology', industry: 'Software' },
  'SHOP': { sector: 'Technology', industry: 'Software' },
  'MELI': { sector: 'Technology', industry: 'Software' },
  'NTES': { sector: 'Technology', industry: 'Software' },
  'PDD': { sector: 'Technology', industry: 'Software' },
  'BABA': { sector: 'Technology', industry: 'Software' },
  'TCEHY': { sector: 'Technology', industry: 'Software' },
  'ADSK': { sector: 'Technology', industry: 'Software' },
  'ANET': { sector: 'Technology', industry: 'Communication Equipment' },
  'VST': { sector: 'Technology', industry: 'Communication Equipment' },
  'MSTR': { sector: 'Technology', industry: 'Communication Equipment' },
  'CTAS': { sector: 'Technology', industry: 'Communication Equipment' },
  'TDG': { sector: 'Technology', industry: 'Communication Equipment' },
  'ZTS': { sector: 'Technology', industry: 'Communication Equipment' },
  'GBTC': { sector: 'Technology', industry: 'Communication Equipment' },
  'HLT': { sector: 'Technology', industry: 'Communication Equipment' },
  'ET': { sector: 'Technology', industry: 'Communication Equipment' },
  'TEL': { sector: 'Technology', industry: 'Communication Equipment' },
  'MNST': { sector: 'Technology', industry: 'Communication Equipment' },
  'VRT': { sector: 'Technology', industry: 'Communication Equipment' },
  'FLUT': { sector: 'Technology', industry: 'Communication Equipment' },
  'FAST': { sector: 'Technology', industry: 'Communication Equipment' },
  'TRP': { sector: 'Technology', industry: 'Communication Equipment' },
  'MET': { sector: 'Technology', industry: 'Communication Equipment' },
  'TAK': { sector: 'Technology', industry: 'Communication Equipment' },
  'ROST': { sector: 'Technology', industry: 'Communication Equipment' },
  'CPRT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TCOM': { sector: 'Technology', industry: 'Communication Equipment' },
  'TM': { sector: 'Technology', industry: 'Communication Equipment' },
  'TTE': { sector: 'Technology', industry: 'Communication Equipment' },
  'TD': { sector: 'Technology', industry: 'Communication Equipment' },
  'TT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TRI': { sector: 'Technology', industry: 'Communication Equipment' },
  'STX': { sector: 'Technology', industry: 'Communication Equipment' },
  'WDC': { sector: 'Technology', industry: 'Communication Equipment' },
  'EQT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TRGP': { sector: 'Technology', industry: 'Communication Equipment' },
  'VTR': { sector: 'Technology', industry: 'Communication Equipment' },
  'CTSH': { sector: 'Technology', industry: 'Communication Equipment' },
  'OTIS': { sector: 'Technology', industry: 'Communication Equipment' },
  'STT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TSCO': { sector: 'Technology', industry: 'Communication Equipment' },
  'MTD': { sector: 'Technology', industry: 'Communication Equipment' },
  'ATO': { sector: 'Technology', industry: 'Communication Equipment' },
  'DTE': { sector: 'Technology', industry: 'Communication Equipment' },
  'MTB': { sector: 'Technology', industry: 'Communication Equipment' },
  'TER': { sector: 'Technology', industry: 'Communication Equipment' },
  'STE': { sector: 'Technology', industry: 'Communication Equipment' },
  'NTRS': { sector: 'Technology', industry: 'Communication Equipment' },
  'VLTO': { sector: 'Technology', industry: 'Communication Equipment' },
  'TDY': { sector: 'Technology', industry: 'Communication Equipment' },
  'ULTA': { sector: 'Technology', industry: 'Communication Equipment' },
  'STZ': { sector: 'Technology', industry: 'Communication Equipment' },
  'WAT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TROW': { sector: 'Technology', industry: 'Communication Equipment' },
  'STLD': { sector: 'Technology', industry: 'Communication Equipment' },
  'TPL': { sector: 'Technology', industry: 'Communication Equipment' },
  'NTAP': { sector: 'Technology', industry: 'Communication Equipment' },
  'DLTR': { sector: 'Technology', industry: 'Communication Equipment' },
  'PTC': { sector: 'Technology', industry: 'Communication Equipment' },
  'TPR': { sector: 'Technology', industry: 'Communication Equipment' },
  'CTRA': { sector: 'Technology', industry: 'Communication Equipment' },
  'WST': { sector: 'Technology', industry: 'Communication Equipment' },
  'TYL': { sector: 'Technology', industry: 'Communication Equipment' },
  'TSN': { sector: 'Technology', industry: 'Communication Equipment' },
  'TRMB': { sector: 'Technology', industry: 'Communication Equipment' },
  'APTV': { sector: 'Technology', industry: 'Communication Equipment' },
  'LNT': { sector: 'Technology', industry: 'Communication Equipment' },
  'FTV': { sector: 'Technology', industry: 'Communication Equipment' },
  'JBHT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TXT': { sector: 'Technology', industry: 'Communication Equipment' },
  'TKO': { sector: 'Technology', industry: 'Communication Equipment' },
  'VTRS': { sector: 'Technology', industry: 'Communication Equipment' },
  'CPT': { sector: 'Technology', industry: 'Communication Equipment' },
  'IVZ': { sector: 'Technology', industry: 'Communication Equipment' },
  'RVTY': { sector: 'Technology', industry: 'Communication Equipment' },
  'TAP': { sector: 'Technology', industry: 'Communication Equipment' },
  'MTCH': { sector: 'Technology', industry: 'Communication Equipment' },
  'BTI': { sector: 'Technology', industry: 'Communication Equipment' },
  
  // Consumer Cyclical
  'AMZN': { sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  'TSLA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'HD': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'MCD': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'SBUX': { sector: 'Consumer Cyclical', industry: 'Restaurants' },
  'NKE': { sector: 'Consumer Cyclical', industry: 'Footwear & Accessories' },
  'DIS': { sector: 'Consumer Cyclical', industry: 'Entertainment' },
  'NFLX': { sector: 'Consumer Cyclical', industry: 'Entertainment' },
  'BKNG': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'MAR': { sector: 'Consumer Cyclical', industry: 'Lodging' },
  'LOW': { sector: 'Consumer Cyclical', industry: 'Home Improvement Retail' },
  'TJX': { sector: 'Consumer Cyclical', industry: 'Apparel Retail' },
  'TGT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'COST': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'WMT': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'ABNB': { sector: 'Consumer Cyclical', industry: 'Travel Services' },
  'KR': { sector: 'Consumer Cyclical', industry: 'Discount Stores' },
  'GM': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'F': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FANG': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FI': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FIG': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FERG': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'ODFL': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FSLR': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FE': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'EFX': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'RJF': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FOX': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FOXA': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FFIV': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'BF.B': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'FDS': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'MGM': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'INFY': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'MFG': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'RF': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  'IFF': { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  
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
  'ICE': { sector: 'Financial Services', industry: 'Banks' },
  'CME': { sector: 'Financial Services', industry: 'Banks' },
  'MMC': { sector: 'Financial Services', industry: 'Banks' },
  'MCK': { sector: 'Financial Services', industry: 'Banks' },
  'HCA': { sector: 'Financial Services', industry: 'Banks' },
  'RCL': { sector: 'Financial Services', industry: 'Banks' },
  'COIN': { sector: 'Financial Services', industry: 'Banks' },
  'MSI': { sector: 'Financial Services', industry: 'Capital Markets' },
  'BK': { sector: 'Financial Services', industry: 'Banks' },
  'IBKR': { sector: 'Financial Services', industry: 'Banks' },
  'MCO': { sector: 'Financial Services', industry: 'Banks' },
  'HOOD': { sector: 'Financial Services', industry: 'Banks' },
  'SCCO': { sector: 'Financial Services', industry: 'Banks' },
  'BNS': { sector: 'Financial Services', industry: 'Banks' },
  'BCS': { sector: 'Financial Services', industry: 'Banks' },
  'CL': { sector: 'Financial Services', industry: 'Banks' },
  'CSX': { sector: 'Financial Services', industry: 'Banks' },
  'CRH': { sector: 'Financial Services', industry: 'Banks' },
  'NSC': { sector: 'Financial Services', industry: 'Banks' },
  'CNI': { sector: 'Financial Services', industry: 'Banks' },
  'CMG': { sector: 'Financial Services', industry: 'Banks' },
  'CARR': { sector: 'Financial Services', industry: 'Banks' },
  'COR': { sector: 'Financial Services', industry: 'Banks' },
  'GLW': { sector: 'Financial Services', industry: 'Insurance' },
  'AFL': { sector: 'Financial Services', industry: 'Insurance' },
  'ALL': { sector: 'Financial Services', industry: 'Insurance' },
  'CPNG': { sector: 'Financial Services', industry: 'Banks' },
  'MFC': { sector: 'Financial Services', industry: 'Banks' },
  'MPC': { sector: 'Financial Services', industry: 'Banks' },
  'PCAR': { sector: 'Financial Services', industry: 'Banks' },
  'CRWV': { sector: 'Financial Services', industry: 'Banks' },
  'CMI': { sector: 'Financial Services', industry: 'Banks' },
  'WCN': { sector: 'Financial Services', industry: 'Banks' },
  'CCEP': { sector: 'Financial Services', industry: 'Banks' },
  'CCI': { sector: 'Financial Services', industry: 'Banks' },
  'CBRE': { sector: 'Financial Services', industry: 'Banks' },
  'ALC': { sector: 'Financial Services', industry: 'Banks' },
  'MSCI': { sector: 'Financial Services', industry: 'Banks' },
  'CVNA': { sector: 'Financial Services', industry: 'Banks' },
  'BKR': { sector: 'Financial Services', industry: 'Banks' },
  'KBCSF': { sector: 'Financial Services', industry: 'Banks' },
  'CRCL': { sector: 'Financial Services', industry: 'Banks' },
  'CSGP': { sector: 'Financial Services', industry: 'Banks' },
  'CCL': { sector: 'Financial Services', industry: 'Banks' },
  'CAH': { sector: 'Financial Services', industry: 'Banks' },
  'HSBC': { sector: 'Financial Services', industry: 'Banks' },
  'HDB': { sector: 'Financial Services', industry: 'Banks' },
  'RY': { sector: 'Financial Services', industry: 'Banks' },
  'UBS': { sector: 'Financial Services', industry: 'Banks' },
  'CB': { sector: 'Financial Services', industry: 'Banks' },
  'SMFG': { sector: 'Financial Services', industry: 'Banks' },
  'BBVA': { sector: 'Financial Services', industry: 'Banks' },
  'NWG': { sector: 'Financial Services', industry: 'Banks' },
  'LYG': { sector: 'Financial Services', industry: 'Banks' },
  'CNQ': { sector: 'Financial Services', industry: 'Banks' },
  'ACN': { sector: 'Financial Services', industry: 'Banks' },
  'RACE': { sector: 'Financial Services', industry: 'Banks' },
  'GSK': { sector: 'Financial Services', industry: 'Capital Markets' },
  'JCI': { sector: 'Financial Services', industry: 'Banks' },
  'FICO': { sector: 'Financial Services', industry: 'Banks' },
  'VMC': { sector: 'Financial Services', industry: 'Banks' },
  'GEHC': { sector: 'Financial Services', industry: 'Banks' },
  'ACGL': { sector: 'Financial Services', industry: 'Banks' },
  'VICI': { sector: 'Financial Services', industry: 'Banks' },
  'MCHP': { sector: 'Financial Services', industry: 'Banks' },
  'SBAC': { sector: 'Financial Services', industry: 'Banks' },
  'INCY': { sector: 'Financial Services', industry: 'Banks' },
  'CPAY': { sector: 'Financial Services', industry: 'Banks' },
  'CHD': { sector: 'Financial Services', industry: 'Banks' },
  'AMCR': { sector: 'Financial Services', industry: 'Banks' },
  'CDW': { sector: 'Financial Services', industry: 'Banks' },
  'CHRW': { sector: 'Financial Services', industry: 'Banks' },
  'GPC': { sector: 'Financial Services', industry: 'Banks' },
  'MKC': { sector: 'Financial Services', industry: 'Banks' },
  'CNC': { sector: 'Financial Services', industry: 'Banks' },
  'COO': { sector: 'Financial Services', industry: 'Banks' },
  'OMC': { sector: 'Financial Services', industry: 'Banks' },
  'CF': { sector: 'Financial Services', industry: 'Banks' },
  'CLX': { sector: 'Financial Services', industry: 'Banks' },
  'DOC': { sector: 'Financial Services', industry: 'Banks' },
  'DECK': { sector: 'Financial Services', industry: 'Banks' },
  'PAYC': { sector: 'Financial Services', industry: 'Banks' },
  'CPB': { sector: 'Financial Services', industry: 'Banks' },
  'GNRC': { sector: 'Financial Services', industry: 'Banks' },
  'HSIC': { sector: 'Financial Services', industry: 'Banks' },
  'NCLH': { sector: 'Financial Services', industry: 'Banks' },
  'CRL': { sector: 'Financial Services', industry: 'Banks' },
  'CAG': { sector: 'Financial Services', industry: 'Banks' },
  'CP': { sector: 'Financial Services', industry: 'Banks' },
  'CM': { sector: 'Financial Services', industry: 'Banks' },
  'SYF': { sector: 'Financial Services', industry: 'Credit Services' },
  'PRU': { sector: 'Financial Services', industry: 'Insurance' },
  'HIG': { sector: 'Financial Services', industry: 'Insurance' },
  'WRB': { sector: 'Financial Services', industry: 'Insurance' },
  'PFG': { sector: 'Financial Services', industry: 'Insurance' },
  'ALLE': { sector: 'Financial Services', industry: 'Insurance' },
  'BALL': { sector: 'Financial Services', industry: 'Insurance' },
  'GL': { sector: 'Financial Services', industry: 'Insurance' },
  'CINF': { sector: 'Financial Services', industry: 'Banks' },
  'CNP': { sector: 'Financial Services', industry: 'Banks' },
  'CBOE': { sector: 'Financial Services', industry: 'Banks' },
  'CFG': { sector: 'Financial Services', industry: 'Banks' },
  'DXCM': { sector: 'Financial Services', industry: 'Banks' },
  
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
  'EW': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ZBH': { sector: 'Healthcare', industry: 'Medical Devices' },
  'HOLX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'ALGN': { sector: 'Healthcare', industry: 'Medical Devices' },
  'BAX': { sector: 'Healthcare', industry: 'Medical Devices' },
  'MOH': { sector: 'Healthcare', industry: 'Healthcare Plans' },
  
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
  'HWM': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'DELL': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  'DEO': { sector: 'Industrials', industry: 'Farm & Heavy Construction Machinery' },
  'EBAY': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'BAM': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'HBAN': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'GDDY': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  
  // Energy
  'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'COP': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'PSX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'OXY': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'VLO': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  'HAL': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  
  // Basic Materials
  'LIN': { sector: 'Basic Materials', industry: 'Chemicals' },
  'ECL': { sector: 'Basic Materials', industry: 'Chemicals' },
  'FCX': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'APD': { sector: 'Basic Materials', industry: 'Chemicals' },
  
  // Real Estate
  'PLD': { sector: 'Real Estate', industry: 'REIT - Industrial' },
  'AMT': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'EQIX': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'WELL': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'MO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ORLY': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'APO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ROP': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'AXON': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'DDOG': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'IMO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'O': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'PSA': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ON': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'ROL': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'BRO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'LDOS': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'DOV': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'PODD': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'SOLV': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'POOL': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'AOS': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'MOS': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'SOLS': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'NVO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'SONY': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'RIO': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'AON': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  'FRT': { sector: 'Real Estate', industry: 'REIT - Specialty' },
  
  // Utilities
  'NEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ARES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'EXC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'ESS': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AES': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  
  // Consumer Defensive
  'PG': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
  'KO': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'PEP': { sector: 'Consumer Defensive', industry: 'Beverages - Non-Alcoholic' },
  'PM': { sector: 'Consumer Defensive', industry: 'Tobacco' },
  'MDLZ': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'SPG': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'OKE': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'KVUE': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'KDP': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'KMB': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'ROK': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'VRSK': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'KEYS': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'K': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'AWK': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'GIS': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'PPG': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'PSKY': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'PKG': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'KIM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'AKAM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'JKHY': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'SJM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'SWK': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'SWKS': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'IPG': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'LKQ': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'MHK': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  
  // Additional mappings based on company names
  'A': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'ABEV': { sector: 'Consumer Defensive', industry: 'Beverages - Alcoholic' },
  'ADM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
  'ADP': { sector: 'Technology', industry: 'Software' },
  'AEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
  'AEM': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
  'AJG': { sector: 'Financial Services', industry: 'Insurance' },
  'ALB': { sector: 'Basic Materials', industry: 'Chemicals' },
  'ALNY': { sector: 'Healthcare', industry: 'Biotechnology' },
  'AME': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
  'APP': { sector: 'Technology', industry: 'Software' },
  'IT': { sector: 'Technology', industry: 'Software' },
  'AIZ': { sector: 'Technology', industry: 'Software' },
  'TECH': { sector: 'Technology', industry: 'Software' },
  'FITB': { sector: 'Technology', industry: 'Software' },
};

// Extended pattern-based generation
function generateSectorFromTicker(ticker: string): { sector: string; industry: string } | null {
  const upperTicker = ticker.toUpperCase();
  const name = ticker.toUpperCase();
  
  // Technology patterns
  if (['AI', 'ML', 'SAAS', 'CLOUD', 'DATA', 'CYBER', 'SEC', 'NET', 'WEB', 'APP', 'SOFT', 'TECH', 'IT', 'COMP', 'PLTR', 'SNOW', 'TEAM', 'WDAY', 'TTD', 'ZS', 'CRWD', 'PANW', 'FTNT', 'VEEV', 'TTWO', 'EA', 'SPOT', 'SHOP', 'MELI', 'NTES', 'PDD', 'BABA', 'TCEHY', 'ADP', 'ADSK', 'APP', 'IT', 'AIZ', 'TECH', 'FITB'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Software' };
  }
  if (['CHIP', 'SEMI', 'INTEL', 'AMD', 'NVDA', 'QCOM', 'TXN', 'MU', 'AVGO', 'TSM', 'ASML', 'KLAC', 'LRCX', 'AMAT', 'ADI', 'NXPI', 'MRVL', 'MCHP'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Semiconductors' };
  }
  if (['PHONE', 'MOBILE', 'TEL', 'COMM', 'WIFI', '5G', '6G', 'TMUS', 'VZ', 'T', 'TM', 'TEL', 'CTSH'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Communication Equipment' };
  }
  
  // Financial patterns
  if (['BANK', 'FIN', 'INS', 'CREDIT', 'LOAN', 'MORT', 'INVEST', 'CAP', 'TRUST', 'FUND', 'ASSET', 'WEALTH', 'JPM', 'BAC', 'WFC', 'C', 'USB', 'PNC', 'TFC', 'BK', 'BNS', 'BCS', 'HSBC', 'HDB', 'RY', 'UBS', 'SMFG', 'BBVA', 'MUFG', 'ITUB', 'BMO', 'LYG', 'NWG', 'TD', 'AJG'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Banks' };
  }
  if (['INSUR', 'INS', 'LIFE', 'HEALTH', 'AUTO', 'PROP', 'CASUAL', 'PGR', 'AIG', 'TRV', 'CB', 'MET', 'PRU', 'ALL', 'HIG', 'PFG', 'AFL', 'GL', 'WRB', 'RLI', 'AFG', 'ALLE', 'BALL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Insurance' };
  }
  if (['INVEST', 'BROKER', 'TRADING', 'EXCHANGE', 'GS', 'MS', 'SCHW', 'ETRADE', 'IBKR', 'TD', 'AMTD', 'ICE', 'CME', 'SPGI'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Capital Markets' };
  }
  if (['CREDIT', 'CARD', 'PAYMENT', 'VISA', 'MASTERCARD', 'AMEX', 'AXP', 'COF', 'SYF', 'DFS', 'V', 'MA'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Credit Services' };
  }
  
  // Healthcare patterns
  if (['PHARMA', 'DRUG', 'MED', 'BIO', 'GEN', 'THERA', 'CURE', 'HEALTH', 'MEDICAL', 'DIAG', 'LAB', 'CLINIC', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB', 'ALNY', 'ARGX', 'TAK', 'NVS', 'AZN', 'GSK', 'SNY', 'MDT'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Drug Manufacturers' };
  }
  if (['DEVICE', 'EQUIP', 'SURG', 'IMPLANT', 'PROSTH', 'MONITOR', 'SCAN', 'XRAY', 'MRI', 'CT', 'ABT', 'BSX', 'ISRG', 'ZTS', 'IDXX', 'RMD', 'EW', 'DHR', 'TMO', 'ZBH', 'HOLX', 'ALGN', 'BAX'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Medical Devices' };
  }
  if (['HOSP', 'CLINIC', 'CARE', 'NURS', 'DOCTOR', 'PHYSICIAN', 'DENTAL', 'VET', 'UNH', 'CVS', 'ANTM', 'CI', 'HUM', 'HCA', 'CAH', 'DHI', 'WELL', 'VTR', 'ELV', 'MOH', 'CNC'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Healthcare Plans' };
  }
  
  // Consumer patterns
  if (['FOOD', 'BEV', 'DRINK', 'REST', 'CAFE', 'DINE', 'EAT', 'MEAL', 'SNACK', 'CANDY', 'CHOCO', 'KO', 'PEP', 'HSY', 'KDP', 'MNST', 'CCL', 'ROST', 'HLT', 'MAR', 'SBUX', 'MCD', 'CMG', 'YUM', 'DRI', 'DPZ', 'WING', 'SHAK', 'CHIP', 'PZZA', 'ABEV', 'ADM', 'MDLZ'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Defensive', industry: 'Packaged Foods' };
  }
  if (['RETAIL', 'STORE', 'SHOP', 'MALL', 'OUTLET', 'MARKET', 'SUPER', 'GROCERY', 'FOOD', 'WMT', 'COST', 'TGT', 'TJX', 'ROST', 'BURL', 'ULTA', 'LULU', 'NKE', 'UA', 'SKX', 'FL', 'FOSL', 'GPS', 'LB', 'VSCO', 'AEO', 'ANF', 'URBN', 'ZUMZ', 'KR'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Discount Stores' };
  }
  if (['AUTO', 'CAR', 'TRUCK', 'MOTOR', 'VEHICLE', 'TRANSPORT', 'DELIVERY', 'LOGISTIC', 'FREIGHT', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' };
  }
  if (['HOTEL', 'LODGE', 'RESORT', 'TRAVEL', 'TOUR', 'VACATION', 'CRUISE', 'AIRLINE', 'FLIGHT', 'BKNG', 'ABNB', 'EXPE', 'TRIP', 'LYV', 'RCL', 'NCLH', 'CCL', 'DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'SAVE', 'ALK', 'HA', 'JETS', 'MAR'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Lodging' };
  }
  
  // Energy patterns
  if (['OIL', 'GAS', 'PETRO', 'FUEL', 'ENERGY', 'POWER', 'ELECTRIC', 'SOLAR', 'WIND', 'RENEW', 'GREEN', 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'HAL', 'BKR', 'PSX', 'VLO', 'MPC', 'KMI', 'ENB', 'ET', 'WMB', 'OKE', 'SHEL', 'TTE', 'BP', 'RDS', 'TTE', 'EQNR', 'CNQ', 'PBR', 'VALE', 'RIO', 'BHP', 'FCX', 'NEM', 'GOLD', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN', 'HAL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Energy', industry: 'Oil & Gas Integrated' };
  }
  if (['MINING', 'MINE', 'ORE', 'METAL', 'STEEL', 'ALUM', 'COPPER', 'GOLD', 'SILVER', 'PLAT', 'DIAMOND', 'NUE', 'X', 'STLD', 'RS', 'AA', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN', 'FCX', 'AEM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' };
  }
  if (['CHEM', 'PLASTIC', 'POLYMER', 'FERTIL', 'PESTIC', 'DYES', 'PAINT', 'COAT', 'LIN', 'APD', 'ECL', 'SHW', 'DD', 'DOW', 'CTVA', 'NEM', 'GOLD', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN', 'ALB', 'LIN', 'APD', 'ECL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Basic Materials', industry: 'Chemicals' };
  }
  
  // Industrial patterns
  if (['MANUF', 'FACTORY', 'PLANT', 'MACHINE', 'TOOL', 'EQUIP', 'INDUST', 'ENGINEER', 'CONSTR', 'BUILD', 'CAT', 'DE', 'CNH', 'AGCO', 'TEX', 'OSK', 'ALG', 'MTW', 'TWI', 'ASTE', 'CMCO', 'GENC', 'HY', 'LNN', 'LECO', 'MIDD', 'MOG.A', 'MOG.B', 'RBC', 'SNA', 'SWK', 'TTC', 'WCC', 'WWD', 'XYL', 'ZBRA', 'ZWS', 'AOS', 'AOSL', 'APPH', 'ARLO', 'AVT', 'BELFB', 'BGG', 'BIOX', 'BLDR', 'BMI', 'BRC', 'CARR', 'CBRL', 'CCK', 'CHD', 'CLH', 'CLX', 'COKE', 'CPB', 'CRL', 'CSL', 'CTAS', 'CTVA', 'CVGW', 'DAN', 'DCI', 'DORM', 'DOV', 'EME', 'EMR', 'ENR', 'EPC', 'ESNT', 'FAST', 'FERG', 'FLO', 'FLS', 'FMC', 'FOXA', 'FOX', 'FRT', 'GATX', 'GEF', 'GEF.B', 'GPC', 'GWW', 'HII', 'HON', 'HWM', 'IEX', 'IP', 'IR', 'ITT', 'J', 'JBHT', 'JBL', 'JBT', 'K', 'KMB', 'KWR', 'LEA', 'LII', 'LKQ', 'LOW', 'MAS', 'MAT', 'MCD', 'MHK', 'MLM', 'MMM', 'MOS', 'MSM', 'NEM', 'NOC', 'NSC', 'NUE', 'NWL', 'ODFL', 'OI', 'ORLY', 'PACK', 'PCAR', 'PH', 'PKG', 'PNR', 'POOL', 'PPG', 'PWR', 'R', 'RHI', 'ROL', 'ROP', 'RSG', 'SEE', 'SHW', 'SJM', 'SLGN', 'SON', 'SPGI', 'STE', 'SWK', 'TEL', 'TEX', 'TMO', 'TNC', 'TXT', 'UFPI', 'UNP', 'VMC', 'WAT', 'WCC', 'WMS', 'WRK', 'WSO', 'WWD', 'XYL', 'ZBRA', 'A', 'AME', 'DELL', 'DEO'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Specialty Industrial Machinery' };
  }
  if (['AERO', 'SPACE', 'DEFENSE', 'MILITARY', 'WEAPON', 'MISSILE', 'RADAR', 'SATELLITE', 'BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TDG', 'AJRD', 'KTOS', 'LMT', 'NOC', 'RTX', 'TDG', 'AJRD', 'KTOS', 'HWM', 'EBAY', 'BAM', 'HBAN', 'GDDY'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Aerospace & Defense' };
  }
  if (['SHIP', 'BOAT', 'MARINE', 'NAVAL', 'PORT', 'HARBOR', 'DOCK', 'CARGO', 'CONTAINER', 'UPS', 'FDX', 'EXPD', 'CHRW', 'XPO', 'ODFL', 'SAIA', 'LTLF', 'YRCW', 'ARCB', 'KNX', 'HTLD', 'WERN', 'MRTN', 'PTSI', 'CVLG', 'DSKE', 'HUBG', 'JBHT', 'LSTR', 'MATW'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Integrated Freight & Logistics' };
  }
  if (['RAIL', 'RAILROAD', 'UNP', 'CSX', 'NSC', 'CNI', 'CP'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Railroads' };
  }
  
  // Real Estate patterns
  if (['REIT', 'REAL', 'ESTATE', 'PROPERTY', 'LAND', 'BUILDING', 'OFFICE', 'WAREHOUSE', 'MALL', 'APARTMENT', 'CONDO', 'AMT', 'PLD', 'EQIX', 'CCI', 'DLR', 'PSA', 'SPG', 'O', 'VICI', 'WELL', 'VTR', 'EQR', 'AVB', 'MAA', 'ESS', 'UDR', 'CPT', 'AIV', 'AVB', 'BRX', 'BXP', 'CDR', 'CIO', 'CLDT', 'CUZ', 'DEI', 'DLR', 'EQR', 'ESS', 'FRT', 'GEO', 'GTY', 'HCP', 'HST', 'HR', 'IRM', 'KIM', 'KRC', 'LAMR', 'MAC', 'MAA', 'MPW', 'NHI', 'NLY', 'NNN', 'O', 'OHI', 'OUT', 'PEAK', 'PLD', 'PSA', 'REG', 'ROIC', 'SBRA', 'SKT', 'SPG', 'SRC', 'STAG', 'STOR', 'TCO', 'UDR', 'VICI', 'VNO', 'VTR', 'WELL', 'WPC', 'WY', 'MO', 'ORLY', 'APO', 'ROP', 'AXON', 'DDOG', 'IMO', 'ON', 'ROL', 'BRO', 'LDOS', 'DOV', 'PODD', 'SOLV', 'POOL', 'AOS', 'MOS', 'SOLS', 'NVO', 'SONY', 'RIO', 'AON', 'FRT'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Real Estate', industry: 'REIT - Specialty' };
  }
  
  // Utilities patterns
  if (['UTIL', 'POWER', 'ELECTRIC', 'GAS', 'WATER', 'SEWER', 'WASTE', 'RECYCLE', 'RENEW', 'SOLAR', 'WIND', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'XEL', 'DTE', 'ED', 'EIX', 'WEC', 'PEG', 'AEE', 'CMS', 'CNP', 'ATO', 'NI', 'SRE', 'DTM', 'AES', 'AEE', 'ALE', 'ATO', 'BKH', 'CMS', 'CNP', 'CPK', 'DTE', 'DUK', 'ED', 'EIX', 'ES', 'ETR', 'EVRG', 'FE', 'LNT', 'NEE', 'NI', 'NRG', 'OGE', 'OKE', 'PCG', 'PEG', 'PNW', 'PPL', 'SRE', 'SO', 'SRE', 'WEC', 'XEL', 'ARES', 'EXC', 'ESS', 'AES'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Utilities', industry: 'Utilities - Regulated Electric' };
  }
  
  // Communication patterns
  if (['TELECOM', 'PHONE', 'MOBILE', 'CELL', 'WIRELESS', 'BROADBAND', 'INTERNET', 'FIBER', 'CABLE', 'SATELLITE', 'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR', 'LBRDK', 'LBRDA', 'CABO', 'ATUS', 'CTL', 'FTR', 'IRDM', 'ORBC', 'SATS', 'VSAT', 'GILT', 'IDT', 'LUMN', 'Q', 'SHEN', 'TDS', 'TU', 'USM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Communication Services', industry: 'Telecom Services' };
  }
  if (['MEDIA', 'NEWS', 'PRESS', 'PUBLISH', 'BROADCAST', 'TV', 'RADIO', 'STREAM', 'GAME', 'ENTERTAIN', 'DIS', 'NFLX', 'FOX', 'FOXA', 'PARA', 'LYV', 'CMCSA', 'CHTR'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Communication Services', industry: 'Entertainment' };
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

async function updateSectorIndustryComplete() {
  try {
    console.log('🚀 Starting complete sector/industry update...\n');

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

    // Process in smaller batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < tickersToUpdate.length; i += batchSize) {
      const batch = tickersToUpdate.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickersToUpdate.length / batchSize)} (${batch.length} tickers)...`);

      for (const ticker of batch) {
        try {
          let sector: string | null = ticker.sector;
          let industry: string | null = ticker.industry;

          // Strategy 1: Check hardcoded mapping
          if ((!sector || !industry) && coreSectors[ticker.symbol]) {
            sector = coreSectors[ticker.symbol]!.sector;
            industry = coreSectors[ticker.symbol]!.industry;
          }

          // Strategy 2: Pattern-based generation
          if ((!sector || !industry)) {
            const generated = generateSectorFromTicker(ticker.symbol);
            if (generated) {
              sector = sector || generated.sector;
              industry = industry || generated.industry;
            }
          }

          // Strategy 3: Try company name patterns if name is available
          if ((!sector || !industry) && ticker.name) {
            const nameUpper = ticker.name.toUpperCase();
            // Check for common company name patterns
            if (nameUpper.includes('BANK') || nameUpper.includes('FINANCIAL') || nameUpper.includes('CREDIT')) {
              sector = sector || 'Financial Services';
              industry = industry || 'Banks';
            } else if (nameUpper.includes('TECH') || nameUpper.includes('SOFTWARE') || nameUpper.includes('SYSTEMS')) {
              sector = sector || 'Technology';
              industry = industry || 'Software';
            } else if (nameUpper.includes('HEALTH') || nameUpper.includes('MEDICAL') || nameUpper.includes('CARE')) {
              sector = sector || 'Healthcare';
              industry = industry || 'Healthcare Plans';
            } else if (nameUpper.includes('ENERGY') || nameUpper.includes('OIL') || nameUpper.includes('GAS')) {
              sector = sector || 'Energy';
              industry = industry || 'Oil & Gas Integrated';
            }
          }

          // Strategy 4: Polygon API (only for first 20% to avoid rate limits)
          if ((!sector || !industry) && i < tickersToUpdate.length * 0.2) {
            const polygonData = await fetchSectorDataFromPolygon(ticker.symbol);
            if (polygonData.sector) sector = sector || polygonData.sector;
            if (polygonData.industry) industry = industry || polygonData.industry;
            
            // Delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Final fallback: assign to "Other" if still missing
          if (!sector) {
            sector = 'Other';
            industry = industry || 'Uncategorized';
          }
          if (!industry) {
            industry = 'Uncategorized';
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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

updateSectorIndustryComplete();


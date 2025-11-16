import { NextRequest, NextResponse } from 'next/server';
import { getCachedData, setCachedData, getCacheKey } from '@/lib/redis';
import { getCurrentPrice, getPreviousClose, getSharesOutstanding, computeMarketCap, computeMarketCapDiff, computePercentChange } from '@/lib/marketCapUtils';

// Function to generate sector data based on ticker patterns
function generateSectorFromTicker(ticker: string): { sector: string; industry: string } {
  const upperTicker = ticker.toUpperCase();
  
  // Technology patterns (expanded)
  if (['AI', 'ML', 'SAAS', 'CLOUD', 'DATA', 'CYBER', 'SEC', 'NET', 'WEB', 'APP', 'SOFT', 'TECH', 'IT', 'COMP', 'PLTR', 'SNOW', 'NET', 'TEAM', 'WDAY', 'TTD', 'ZS', 'CRWD', 'PANW', 'FTNT', 'VEEV', 'TTWO', 'EA', 'SPOT', 'SHOP', 'MELI', 'NTES', 'PDD', 'BABA', 'TCEHY'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Software' };
  }
  if (['CHIP', 'SEMI', 'INTEL', 'AMD', 'NVDA', 'QCOM', 'TXN', 'MU', 'AVGO', 'TSM', 'ASML', 'KLAC', 'LRCX', 'AMAT', 'ADI', 'NXPI', 'MRVL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Semiconductors' };
  }
  if (['PHONE', 'MOBILE', 'TEL', 'COMM', 'WIFI', '5G', '6G', 'TMUS', 'VZ', 'T', 'TM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Technology', industry: 'Communication Equipment' };
  }
  
  // Financial patterns (expanded)
  if (['BANK', 'FIN', 'INS', 'CREDIT', 'LOAN', 'MORT', 'INVEST', 'CAP', 'TRUST', 'FUND', 'ASSET', 'WEALTH', 'JPM', 'BAC', 'WFC', 'C', 'USB', 'PNC', 'TFC', 'BK', 'BNS', 'BCS', 'HSBC', 'HDB', 'RY', 'UBS', 'SMFG', 'BBVA', 'MUFG', 'ITUB', 'BMO', 'LYG', 'NWG', 'TD'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Banks' };
  }
  if (['INSUR', 'INS', 'LIFE', 'HEALTH', 'AUTO', 'PROP', 'CASUAL', 'PGR', 'TRV', 'MET', 'AIG', 'PRU', 'ALL', 'MFC', 'AON'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Insurance' };
  }
  if (['BROKER', 'TRADE', 'MARKET', 'EXCH', 'STOCK', 'BOND', 'ETF', 'MUTUAL', 'GS', 'MS', 'SCHW', 'BLK', 'SPGI', 'CME', 'ICE', 'NDAQ', 'IBKR', 'HOOD', 'ARES', 'KKR', 'BX', 'FIG'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Capital Markets' };
  }
  if (['PAY', 'PAYMENT', 'VISA', 'MASTERCARD', 'V', 'MA', 'PYPL', 'SQ', 'STRIPE', 'PAYX', 'GPN', 'FIS'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Financial Services', industry: 'Credit Services' };
  }
  
  // Healthcare patterns (expanded)
  if (['PHARMA', 'DRUG', 'MED', 'BIO', 'GEN', 'THERA', 'CURE', 'HEALTH', 'MEDICAL', 'DIAG', 'LAB', 'CLINIC', 'LLY', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB', 'ALNY', 'ARGX', 'TAK', 'NVS', 'AZN', 'GSK', 'SNY', 'MDT'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Drug Manufacturers' };
  }
  if (['DEVICE', 'EQUIP', 'SURG', 'IMPLANT', 'PROSTH', 'MONITOR', 'SCAN', 'XRAY', 'MRI', 'CT', 'ABT', 'BSX', 'ISRG', 'ZTS', 'IDXX', 'RMD', 'EW', 'DHR', 'TMO'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Medical Devices' };
  }
  if (['HOSP', 'CLINIC', 'CARE', 'NURS', 'DOCTOR', 'PHYSICIAN', 'DENTAL', 'VET', 'UNH', 'CVS', 'ANTM', 'CI', 'HUM', 'HCA', 'CAH', 'DHI', 'WELL', 'VTR'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Healthcare', industry: 'Healthcare Plans' };
  }
  
  // Consumer patterns (expanded)
  if (['FOOD', 'BEV', 'DRINK', 'REST', 'CAFE', 'DINE', 'EAT', 'MEAL', 'SNACK', 'CANDY', 'CHOCO', 'KO', 'PEP', 'HSY', 'KDP', 'MNST', 'CCL', 'ROST', 'HLT', 'MAR', 'SBUX', 'MCD', 'CMG', 'YUM', 'DRI', 'DPZ', 'WING', 'SHAK', 'CHIP', 'PZZA'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Defensive', industry: 'Packaged Foods' };
  }
  if (['RETAIL', 'STORE', 'SHOP', 'MALL', 'OUTLET', 'MARKET', 'SUPER', 'GROCERY', 'FOOD', 'WMT', 'COST', 'TGT', 'TJX', 'ROST', 'BURL', 'ULTA', 'LULU', 'NKE', 'UA', 'SKX', 'FL', 'FOSL', 'GPS', 'LB', 'VSCO', 'AEO', 'ANF', 'URBN', 'ZUMZ'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Discount Stores' };
  }
  if (['AUTO', 'CAR', 'TRUCK', 'MOTOR', 'VEHICLE', 'TRANSPORT', 'DELIVERY', 'LOGISTIC', 'FREIGHT', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' };
  }
  if (['HOTEL', 'LODGE', 'RESORT', 'TRAVEL', 'TOUR', 'VACATION', 'CRUISE', 'AIRLINE', 'FLIGHT', 'BKNG', 'ABNB', 'EXPE', 'TRIP', 'LYV', 'RCL', 'NCLH', 'CCL', 'DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'SAVE', 'ALK', 'HA', 'JETS'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Lodging' };
  }
  if (['GAME', 'GAMING', 'PLAY', 'FUN', 'ENTERTAIN', 'DIS', 'NFLX', 'RBLX', 'ATVI', 'EA', 'TTWO', 'ZNGA', 'GLUU', 'SCPL', 'SKLZ', 'U', 'PLTK', 'HUYA', 'DOYU', 'BILI', 'IQ', 'TME', 'SPOT', 'PINS', 'SNAP', 'TWTR', 'META', 'GOOGL', 'GOOG', 'BIDU', 'SINA', 'WB', 'YELP', 'GRUB', 'UBER', 'LYFT', 'DASH', 'SQ', 'SHOP', 'ETSY', 'AMZN', 'EBAY', 'JD', 'PDD', 'VIPS', 'TCEHY', 'BABA', 'TME', 'NIO', 'XPEV', 'LI', 'TSLA', 'RIVN', 'LCID', 'FSR', 'WKHS', 'NKLA', 'HYLN', 'CANOO', 'ARVL', 'LEV', 'GOEV', 'SOLO', 'WKHS', 'IDEX', 'AYRO', 'BLNK', 'CHPT', 'EVGO', 'VLTA', 'SBE', 'TPGY', 'CLII', 'DCRB', 'GIK', 'LGVW', 'THBR', 'PSTH', 'IPOB', 'IPOC', 'IPOD', 'IPOE', 'IPOF', 'IPOG', 'IPOH', 'IPOI', 'IPOJ', 'IPOK', 'IPOL', 'IPOM', 'IPON', 'IPOO', 'IPOP', 'IPOQ', 'IPOR', 'IPOS', 'IPOT', 'IPOU', 'IPOV', 'IPOW', 'IPOX', 'IPOY', 'IPOZ'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Consumer Cyclical', industry: 'Entertainment' };
  }
  
  // Energy patterns (expanded)
  if (['OIL', 'GAS', 'PETRO', 'FUEL', 'ENERGY', 'POWER', 'ELECTRIC', 'SOLAR', 'WIND', 'RENEW', 'GREEN', 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'HAL', 'BKR', 'PSX', 'VLO', 'MPC', 'KMI', 'ENB', 'ET', 'WMB', 'OKE', 'SHEL', 'TTE', 'BP', 'RDS', 'TTE', 'EQNR', 'CNQ', 'PBR', 'VALE', 'RIO', 'BHP', 'FCX', 'NEM', 'GOLD', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Energy', industry: 'Oil & Gas Integrated' };
  }
  if (['MINING', 'MINE', 'ORE', 'METAL', 'STEEL', 'ALUM', 'COPPER', 'GOLD', 'SILVER', 'PLAT', 'DIAMOND', 'NUE', 'X', 'STLD', 'RS', 'AA', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' };
  }
  if (['CHEM', 'PLASTIC', 'POLYMER', 'FERTIL', 'PESTIC', 'DYES', 'PAINT', 'COAT', 'LIN', 'APD', 'ECL', 'SHW', 'DD', 'DOW', 'CTVA', 'NEM', 'GOLD', 'KL', 'AEM', 'AG', 'PAAS', 'SLV', 'WPM', 'CRCL', 'KVUE', 'ARGX', 'FANG', 'OXY', 'IMO', 'SU', 'CVE', 'CNQ', 'AR', 'DVN', 'PXD', 'EOG', 'MRO', 'APA', 'HES', 'XEC', 'CXO', 'FANG', 'PARR', 'VLO', 'MPC', 'PSX', 'DK', 'CVI', 'ALTO', 'REGI', 'GPRE', 'PEIX', 'GPP', 'CLNE', 'BLDP', 'PLUG', 'FCEL', 'BE', 'HYZN', 'NKLA', 'WKHS', 'RIDE', 'GOEV', 'SOLO', 'AYRO', 'IDEX', 'CANOO', 'ARVL', 'LEV', 'RIVN', 'LCID', 'FSR', 'NIO', 'XPEV', 'LI', 'TSLA', 'GM', 'F', 'TM', 'HMC', 'PCAR', 'CTVA', 'BLL', 'CCK', 'OI', 'WRK', 'IP', 'PKG', 'SEE', 'AVY', 'SLGN'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Basic Materials', industry: 'Chemicals' };
  }
  
  // Industrial patterns (expanded)
  if (['MANUF', 'FACTORY', 'PLANT', 'MACHINE', 'TOOL', 'EQUIP', 'INDUST', 'ENGINEER', 'CONSTR', 'BUILD', 'CAT', 'DE', 'CNH', 'AGCO', 'TEX', 'OSK', 'ALG', 'MTW', 'TWI', 'ASTE', 'CMCO', 'GENC', 'HY', 'LNN', 'LECO', 'MIDD', 'MOG.A', 'MOG.B', 'RBC', 'SNA', 'SWK', 'TTC', 'WCC', 'WWD', 'XYL', 'ZBRA', 'ZWS', 'AOS', 'AOSL', 'APPH', 'ARLO', 'AVT', 'BELFB', 'BGG', 'BIOX', 'BLDR', 'BMI', 'BRC', 'CARR', 'CBRL', 'CCK', 'CHD', 'CLH', 'CLX', 'COKE', 'CPB', 'CRL', 'CSL', 'CTAS', 'CTVA', 'CVGW', 'DAN', 'DCI', 'DORM', 'DOV', 'EME', 'EMR', 'ENR', 'EPC', 'ESNT', 'FAST', 'FERG', 'FLO', 'FLS', 'FMC', 'FOXA', 'FOX', 'FRT', 'GATX', 'GEF', 'GEF.B', 'GPC', 'GWW', 'HII', 'HON', 'HWM', 'IEX', 'IP', 'IR', 'ITT', 'J', 'JBHT', 'JBL', 'JBT', 'K', 'KMB', 'KWR', 'LEA', 'LII', 'LKQ', 'LOW', 'MAS', 'MAT', 'MCD', 'MHK', 'MLM', 'MMM', 'MOS', 'MSM', 'NEM', 'NOC', 'NSC', 'NUE', 'NWL', 'ODFL', 'OI', 'ORLY', 'PACK', 'PCAR', 'PH', 'PKG', 'PNR', 'POOL', 'PPG', 'PWR', 'R', 'RHI', 'ROL', 'ROP', 'RSG', 'SEE', 'SHW', 'SJM', 'SLGN', 'SON', 'SPGI', 'STE', 'SWK', 'TEL', 'TEX', 'TMO', 'TNC', 'TXT', 'UFPI', 'UNP', 'VMC', 'WAT', 'WCC', 'WMS', 'WRK', 'WSO', 'WWD', 'XYL', 'ZBRA'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Specialty Industrial Machinery' };
  }
  if (['AERO', 'SPACE', 'DEFENSE', 'MILITARY', 'WEAPON', 'MISSILE', 'RADAR', 'SATELLITE', 'BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TDG', 'AJRD', 'KTOS', 'LMT', 'NOC', 'RTX', 'TDG', 'AJRD', 'KTOS', 'LMT', 'NOC', 'RTX', 'TDG', 'AJRD', 'KTOS'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Aerospace & Defense' };
  }
  if (['SHIP', 'BOAT', 'MARINE', 'NAVAL', 'PORT', 'HARBOR', 'DOCK', 'CARGO', 'CONTAINER', 'UPS', 'FDX', 'EXPD', 'CHRW', 'XPO', 'ODFL', 'SAIA', 'LTLF', 'YRCW', 'ARCB', 'KNX', 'HTLD', 'WERN', 'MRTN', 'PTSI', 'CVLG', 'DSKE', 'HUBG', 'JBHT', 'LSTR', 'MATW', 'R', 'RHI', 'ROL', 'ROP', 'RSG', 'SEE', 'SHW', 'SJM', 'SLGN', 'SON', 'SPGI', 'STE', 'SWK', 'TEL', 'TEX', 'TMO', 'TNC', 'TXT', 'UFPI', 'UNP', 'VMC', 'WAT', 'WCC', 'WMS', 'WRK', 'WSO', 'WWD', 'XYL', 'ZBRA'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Industrials', industry: 'Integrated Freight & Logistics' };
  }
  
  // Real Estate patterns (expanded)
  if (['REIT', 'REAL', 'ESTATE', 'PROPERTY', 'LAND', 'BUILDING', 'OFFICE', 'WAREHOUSE', 'MALL', 'APARTMENT', 'CONDO', 'AMT', 'PLD', 'EQIX', 'CCI', 'DLR', 'PSA', 'SPG', 'O', 'VICI', 'WELL', 'VTR', 'EQR', 'AVB', 'MAA', 'ESS', 'UDR', 'CPT', 'AIV', 'AVB', 'BRX', 'BXP', 'CDR', 'CIO', 'CLDT', 'CUZ', 'DEI', 'DLR', 'EQR', 'ESS', 'FRT', 'GEO', 'GTY', 'HCP', 'HST', 'HR', 'IRM', 'KIM', 'KRC', 'LAMR', 'MAC', 'MAA', 'MPW', 'NHI', 'NLY', 'NNN', 'O', 'OHI', 'OUT', 'PEAK', 'PLD', 'PSA', 'REG', 'ROIC', 'SBRA', 'SKT', 'SPG', 'SRC', 'STAG', 'STOR', 'TCO', 'UDR', 'VICI', 'VNO', 'VTR', 'WELL', 'WPC', 'WY'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Real Estate', industry: 'REIT - Specialty' };
  }
  
  // Utilities patterns (expanded)
  if (['UTIL', 'POWER', 'ELECTRIC', 'GAS', 'WATER', 'SEWER', 'WASTE', 'RECYCLE', 'RENEW', 'SOLAR', 'WIND', 'NEE', 'DUK', 'SO', 'D', 'AEP', 'XEL', 'DTE', 'ED', 'EIX', 'WEC', 'PEG', 'AEE', 'CMS', 'CNP', 'ATO', 'NI', 'SRE', 'DTM', 'AES', 'AEE', 'ALE', 'ATO', 'BKH', 'CMS', 'CNP', 'CPK', 'DTE', 'DUK', 'ED', 'EIX', 'ES', 'ETR', 'EVRG', 'FE', 'LNT', 'NEE', 'NI', 'NRG', 'OGE', 'OKE', 'PCG', 'PEG', 'PNW', 'PPL', 'SRE', 'SO', 'SRE', 'WEC', 'XEL'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Utilities', industry: 'Utilities - Regulated Electric' };
  }
  
  // Communication patterns (expanded)
  if (['TELECOM', 'PHONE', 'MOBILE', 'CELL', 'WIRELESS', 'BROADBAND', 'INTERNET', 'FIBER', 'CABLE', 'SATELLITE', 'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR', 'LBRDK', 'LBRDA', 'CABO', 'ATUS', 'CTL', 'FTR', 'IRDM', 'ORBC', 'SATS', 'VSAT', 'GILT', 'IDT', 'LUMN', 'Q', 'SHEN', 'TDS', 'TU', 'USM', 'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR', 'LBRDK', 'LBRDA', 'CABO', 'ATUS', 'CTL', 'FTR', 'IRDM', 'ORBC', 'SATS', 'VSAT', 'GILT', 'IDT', 'LUMN', 'Q', 'SHEN', 'TDS', 'TU', 'USM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Communication Services', industry: 'Telecom Services' };
  }
  if (['MEDIA', 'NEWS', 'PRESS', 'PUBLISH', 'BROADCAST', 'TV', 'RADIO', 'STREAM', 'GAME', 'ENTERTAIN', 'DIS', 'NFLX', 'FOX', 'FOXA', 'PARA', 'LYV', 'CMCSA', 'CHTR', 'LBRDK', 'LBRDA', 'CABO', 'ATUS', 'CTL', 'FTR', 'IRDM', 'ORBC', 'SATS', 'VSAT', 'GILT', 'IDT', 'LUMN', 'Q', 'SHEN', 'TDS', 'TU', 'USM', 'VZ', 'T', 'TMUS', 'CMCSA', 'CHTR', 'LBRDK', 'LBRDA', 'CABO', 'ATUS', 'CTL', 'FTR', 'IRDM', 'ORBC', 'SATS', 'VSAT', 'GILT', 'IDT', 'LUMN', 'Q', 'SHEN', 'TDS', 'TU', 'USM'].some(pattern => upperTicker.includes(pattern))) {
    return { sector: 'Communication Services', industry: 'Entertainment' };
  }
  
  // Default fallback based on common patterns
  if (upperTicker.length <= 3) {
    // Short tickers are often major companies - assign based on common patterns
    return { sector: 'Technology', industry: 'Software' };
  }
  
  // Final fallback: Ak sa nenašla žiadna zhoda, vrátiť generický sektor
  return { sector: 'Other', industry: 'Uncategorized' };
}

// Function to fetch sector data from Polygon v3 reference API
async function fetchSectorData(ticker: string): Promise<{ sector?: string; industry?: string }> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.warn('No Polygon API key available for sector data');
      return {};
    }

    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    console.log(`🔍 Fetching sector data for ${ticker} from: ${url.replace(apiKey, '***')}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`Failed to fetch sector data for ${ticker}: ${response.status} ${response.statusText}`);
      return {};
    }

    const data = await response.json();
    console.log(`🔍 Sector data response for ${ticker}:`, JSON.stringify(data, null, 2));
    
    const result = {
      sector: data.results?.sector || undefined,
      industry: data.results?.industry || undefined
    };
    
    console.log(`🔍 Extracted sector data for ${ticker}:`, result);
    return result;
  } catch (error) {
    console.warn(`Error fetching sector data for ${ticker}:`, error);
    return {};
  }
}

interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  sector?: string;
  industry?: string;
  lastUpdated: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    const project = searchParams.get('project') || 'pmp';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null;

    if (!tickers) {
      return NextResponse.json(
        { error: 'Tickers parameter is required' },
        { status: 400 }
      );
    }

    let tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
    
    // Apply limit if specified
    if (limit && limit > 0) {
      tickerList = tickerList.slice(0, limit);
      console.log(`🔍 Applied limit: ${limit}, processing ${tickerList.length} tickers`);
    }
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey) {
      console.error('❌ Polygon API key not configured');
      return NextResponse.json(
        { 
          success: false,
          error: 'Polygon API key not configured',
          message: 'Please configure POLYGON_API_KEY environment variable',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    console.log(`🔍 Fetching stocks for project: ${project}, tickers: ${tickerList.join(',')}`);

    const results: StockData[] = [];
    const errors: string[] = [];

    // Process tickers in parallel with better error handling
    const promises = tickerList.map(async (ticker, index) => {
      try {
        // Add delay between requests to avoid rate limiting
        // Increased delay to reduce rate limiting issues
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests
        }

        // Try to get from cache first
        const cacheKey = getCacheKey(project, ticker, 'stock');
        const cachedData = await getCachedData(cacheKey);

        if (cachedData) {
          console.log(`✅ Cache hit for ${ticker} in project ${project}`);
          results.push(cachedData);
          return;
        }

        console.log(`🔄 Cache miss for ${ticker} in project ${project}, fetching from Polygon...`);

        // Fetch fresh data from Polygon with better error handling
        const shares = await getSharesOutstanding(ticker);
        const prevClose = await getPreviousClose(ticker);
        
        // Get snapshot data from Polygon.io v2 API with timeout and retry logic
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
        
        let snapshotResponse;
        try {
          snapshotResponse = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(5000), // 5 second timeout
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'PremarketPrice/1.0'
            }
          });
        } catch (fetchError) {
          console.error(`❌ Fetch error for ${ticker}:`, fetchError);
          errors.push(`${ticker}: Network error - ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
          return;
        }
        
        if (!snapshotResponse.ok) {
          const errorMessage = `HTTP ${snapshotResponse.status}: ${snapshotResponse.statusText}`;
          console.error(`❌ API error for ${ticker}:`, errorMessage);
          
          // Handle specific error codes
          if (snapshotResponse.status === 429) {
            errors.push(`${ticker}: Rate limit exceeded - please try again later`);
          } else if (snapshotResponse.status === 401) {
            errors.push(`${ticker}: API key invalid or expired`);
          } else if (snapshotResponse.status === 403) {
            errors.push(`${ticker}: API access forbidden`);
          } else if (snapshotResponse.status === 404) {
            errors.push(`${ticker}: Ticker not found`);
          } else if (snapshotResponse.status >= 500) {
            errors.push(`${ticker}: Server error (${snapshotResponse.status})`);
          } else {
            errors.push(`${ticker}: ${errorMessage}`);
          }
          return;
        }

        let snapshotData;
        try {
          snapshotData = await snapshotResponse.json();
        } catch (parseError) {
          console.error(`❌ JSON parse error for ${ticker}:`, parseError);
          errors.push(`${ticker}: Invalid response format`);
          return;
        }

        // Validate response structure
        if (!snapshotData || typeof snapshotData !== 'object') {
          console.error(`❌ Invalid response structure for ${ticker}:`, snapshotData);
          errors.push(`${ticker}: Invalid response structure`);
          return;
        }

        // Get current price using robust fallback logic
        const currentPrice = getCurrentPrice(snapshotData);
        
        if (currentPrice === null || currentPrice === undefined) {
          console.error(`❌ No valid price data for ${ticker}:`, snapshotData);
          errors.push(`${ticker}: No valid price data`);
          return;
        }
        
        // Calculate derived values
        const percentChange = computePercentChange(currentPrice, prevClose);
        const marketCap = computeMarketCap(currentPrice, shares);
        const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);

        // Fetch sector data (non-blocking)
        const sectorData = await fetchSectorData(ticker);
        
        // Debug: Log sector data for first few tickers
        if (ticker === 'AAPL' || ticker === 'MSFT') {
          console.log(`🔍 Debug - Sector data for ${ticker}:`, sectorData);
        }

        // Intelligent sector data generation for all stocks
        let finalSectorData = sectorData;
        if (!sectorData.sector && !sectorData.industry) {
          // Core fallback mapping for major stocks
          const coreSectors: { [key: string]: { sector: string; industry: string } } = {
            // Technology (major players)
            'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
            'MSFT': { sector: 'Technology', industry: 'Software' },
            'GOOGL': { sector: 'Technology', industry: 'Internet Services' },
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
            
            // Consumer Cyclical (major players)
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
            
            // Financial Services (major players)
            'BRK.B': { sector: 'Financial Services', industry: 'Insurance' },
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
            'CB': { sector: 'Financial Services', industry: 'Insurance' },
            'TRV': { sector: 'Financial Services', industry: 'Insurance' },
            'MET': { sector: 'Financial Services', industry: 'Insurance' },
            'AIG': { sector: 'Financial Services', industry: 'Insurance' },
            'PRU': { sector: 'Financial Services', industry: 'Insurance' },
            
            // Healthcare (major players)
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
            'ANTM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
            'CI': { sector: 'Healthcare', industry: 'Healthcare Plans' },
            'HUM': { sector: 'Healthcare', industry: 'Healthcare Plans' },
            'BMY': { sector: 'Healthcare', industry: 'Drug Manufacturers' },
            'AMGN': { sector: 'Healthcare', industry: 'Biotechnology' },
            'GILD': { sector: 'Healthcare', industry: 'Biotechnology' },
            'REGN': { sector: 'Healthcare', industry: 'Biotechnology' },
            'VRTX': { sector: 'Healthcare', industry: 'Biotechnology' },
            'BIIB': { sector: 'Healthcare', industry: 'Biotechnology' },
            
            // Communication Services (major players)
            'VZ': { sector: 'Communication Services', industry: 'Telecom Services' },
            'T': { sector: 'Communication Services', industry: 'Telecom Services' },
            'CMCSA': { sector: 'Communication Services', industry: 'Entertainment' },
            'CHTR': { sector: 'Communication Services', industry: 'Entertainment' },
            'TMUS': { sector: 'Communication Services', industry: 'Telecom Services' },
            'FOX': { sector: 'Communication Services', industry: 'Entertainment' },
            'FOXA': { sector: 'Communication Services', industry: 'Entertainment' },
            'PARA': { sector: 'Communication Services', industry: 'Entertainment' },
            'LYV': { sector: 'Communication Services', industry: 'Entertainment' },
            
            // Industrials (major players)
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
            'EMR': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            'ETN': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            'ITW': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            'PH': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            'DOV': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            'XYL': { sector: 'Industrials', industry: 'Specialty Industrial Machinery' },
            
            // Consumer Defensive (major players)
            'PG': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
            'KO': { sector: 'Consumer Defensive', industry: 'Beverages' },
            'PEP': { sector: 'Consumer Defensive', industry: 'Beverages' },
            'PM': { sector: 'Consumer Defensive', industry: 'Tobacco' },
            'MO': { sector: 'Consumer Defensive', industry: 'Tobacco' },
            'CL': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
            'KMB': { sector: 'Consumer Defensive', industry: 'Household & Personal Products' },
            'GIS': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            'K': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            'HSY': { sector: 'Consumer Defensive', industry: 'Confectioners' },
            'SJM': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            'CAG': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            'KHC': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            'MDLZ': { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
            
            // Energy (major players)
            'XOM': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
            'CVX': { sector: 'Energy', industry: 'Oil & Gas Integrated' },
            'COP': { sector: 'Energy', industry: 'Oil & Gas E&P' },
            'EOG': { sector: 'Energy', industry: 'Oil & Gas E&P' },
            'SLB': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
            'HAL': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
            'BKR': { sector: 'Energy', industry: 'Oil & Gas Equipment & Services' },
            'PSX': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
            'VLO': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
            'MPC': { sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
            'KMI': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
            'ENB': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
            'ET': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
            'WMB': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
            'OKE': { sector: 'Energy', industry: 'Oil & Gas Midstream' },
            
            // Real Estate (major players)
            'AMT': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'PLD': { sector: 'Real Estate', industry: 'REIT - Industrial' },
            'EQIX': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'CCI': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'DLR': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'PSA': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'SPG': { sector: 'Real Estate', industry: 'REIT - Retail' },
            'O': { sector: 'Real Estate', industry: 'REIT - Retail' },
            'VICI': { sector: 'Real Estate', industry: 'REIT - Specialty' },
            'WELL': { sector: 'Real Estate', industry: 'REIT - Healthcare Facilities' },
            'VTR': { sector: 'Real Estate', industry: 'REIT - Healthcare Facilities' },
            'EQR': { sector: 'Real Estate', industry: 'REIT - Residential' },
            'AVB': { sector: 'Real Estate', industry: 'REIT - Residential' },
            'MAA': { sector: 'Real Estate', industry: 'REIT - Residential' },
            'ESS': { sector: 'Real Estate', industry: 'REIT - Residential' },
            
            // Utilities (major players)
            'NEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'DUK': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'SO': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'D': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'AEP': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'XEL': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'DTE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'ED': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'EIX': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'WEC': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'PEG': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'AEE': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'CMS': { sector: 'Utilities', industry: 'Utilities - Regulated Electric' },
            'CNP': { sector: 'Utilities', industry: 'Utilities - Regulated Gas' },
            'ATO': { sector: 'Utilities', industry: 'Utilities - Regulated Gas' },
            'NI': { sector: 'Utilities', industry: 'Utilities - Regulated Gas' },
            'SRE': { sector: 'Utilities', industry: 'Utilities - Regulated Gas' },
            'DTM': { sector: 'Utilities', industry: 'Utilities - Regulated Gas' },
            
            // Basic Materials (major players)
            'LIN': { sector: 'Basic Materials', industry: 'Chemicals' },
            'APD': { sector: 'Basic Materials', industry: 'Chemicals' },
            'ECL': { sector: 'Basic Materials', industry: 'Chemicals' },
            'SHW': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
            'DD': { sector: 'Basic Materials', industry: 'Specialty Chemicals' },
            'NEM': { sector: 'Basic Materials', industry: 'Gold' },
            'GOLD': { sector: 'Basic Materials', industry: 'Gold' },
            'FCX': { sector: 'Basic Materials', industry: 'Copper' },
            'BHP': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
            'RIO': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
            'VALE': { sector: 'Basic Materials', industry: 'Other Industrial Metals & Mining' },
            'NUE': { sector: 'Basic Materials', industry: 'Steel' },
            'X': { sector: 'Basic Materials', industry: 'Steel' },
            'STLD': { sector: 'Basic Materials', industry: 'Steel' },
            'RS': { sector: 'Basic Materials', industry: 'Steel' },
            'AA': { sector: 'Basic Materials', industry: 'Aluminum' },
            'KL': { sector: 'Basic Materials', industry: 'Gold' },
            'AEM': { sector: 'Basic Materials', industry: 'Gold' },
            'AG': { sector: 'Basic Materials', industry: 'Silver' },
            'PAAS': { sector: 'Basic Materials', industry: 'Silver' },
            'SLV': { sector: 'Basic Materials', industry: 'Silver' }
          };
          
          // Check if ticker is in core sectors
          if (coreSectors[ticker]) {
            finalSectorData = coreSectors[ticker];
            console.log(`🔍 Using core sector data for ${ticker}:`, finalSectorData);
          } else {
            // Generate sector data based on ticker patterns and company names
            finalSectorData = generateSectorFromTicker(ticker);
            console.log(`🔍 Generated sector data for ${ticker}:`, finalSectorData);
          }
        }

        const stockData: StockData = {
          ticker,
          currentPrice,
          closePrice: prevClose,
          percentChange,
          marketCap,
          marketCapDiff,
          lastUpdated: new Date().toISOString()
        };
        if (finalSectorData.sector) {
          stockData.sector = finalSectorData.sector;
        }
        if (finalSectorData.industry) {
          stockData.industry = finalSectorData.industry;
        }

        // Cache the result for 2 minutes
        await setCachedData(cacheKey, stockData, 120);

        results.push(stockData);
        console.log(`✅ Fetched and cached ${ticker} for project ${project}`);

      } catch (error) {
        console.error(`❌ Error processing ${ticker}:`, error);
        errors.push(`${ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
      }
    });

    await Promise.all(promises);

    // Filter out null results
    const validResults = results.filter(result => result !== null);

    console.log(`✅ Returning ${validResults.length} stocks for project ${project}`);

    // Return response with error information if there were any errors
    const response: any = {
      success: true,
      data: validResults,
      source: 'polygon',
      project,
      count: validResults.length,
      timestamp: new Date().toISOString()
    };

    // Add error information if there were any errors
    if (errors.length > 0) {
      response.warnings = errors;
      response.partial = true;
      response.message = `Successfully fetched ${validResults.length} stocks, but encountered ${errors.length} errors`;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error in /api/stocks:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 
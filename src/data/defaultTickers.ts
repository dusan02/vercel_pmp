export const DEFAULT_TICKERS = {
  pmp: [
    // Premium tier (50) - 1 min updates
    'NVDA', 'MSFT', 'AAPL', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AVGO', 'BRK.B', 'TSLA', 'TSM', 'JPM', 'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'TMUS', 'CSCO', 'PM', 'WFC', 'CRM', 'IBM', 'MS', 'ABT', 'GS', 'MCD', 'INTU', 'UNH', 'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'PEP', 'NOW',
    
    // Standard tier (100) - 3 min updates
    'UBER', 'VZ', 'TMO', 'BKNG', 'SCHW', 'ISRG', 'BLK', 'C', 'BA', 'SPGI', 'TXN', 'AMGN', 'QCOM', 'BSX', 'ANET', 'ADBE', 'NEE', 'SYK', 'AMAT', 'PGR', 'GILD', 'DHR', 'TJX', 'HON', 'DE', 'PFE', 'BX', 'COF', 'UNP', 'APH', 'KKR', 'LOW', 'LRCX', 'ADP', 'CMCSA', 'VRTX', 'KLAC', 'COP', 'MU', 'PANW', 'SNPS', 'CRWD', 'WELL', 'NKE', 'ADI', 'CEG', 'ICE', 'DASH', 'SO', 'MO', 'CME', 'AMT', 'SBUX', 'LMT', 'PLD', 'MMC', 'CDNS', 'DUK', 'WM', 'PH', 'BMY', 'MCK', 'DELL', 'HCA', 'SHW', 'RCL', 'INTC', 'NOC', 'ORLY', 'GD', 'MDLZ', 'COIN', 'EMR', 'ABNB', 'CVS', 'APO', 'MMM', 'EQIX', 'FTNT', 'HWM', 'ECL', 'WMB', 'ITW', 'FI', 'PNC', 'MSI', 'AJG', 'RSG', 'UPS', 'VST', 'BK', 'CI', 'MAR', 'GEV', 'APP', 'IBKR', 'MSTR', 'MCO', 'CTAS', 'TDG', 'HOOD', 'RBLX', 'SCCO', 'NET', 'BNS', 'BCS', 'NEM', 'USB', 'ING', 'SNOW', 'CL', 'EPD', 'ZTS', 'CSX', 'AZO',
    
    // Extended tier (150) - 5 min updates
    'MRVL', 'PYPL', 'CRH', 'DB', 'EOG', 'ADSK', 'AEM', 'APD', 'KMI', 'ELV', 'NSC', 'GBTC', 'HLT', 'ET', 'AEP', 'SPG', 'REGN', 'ARES', 'DLR', 'TEL', 'FIG', 'WDAY', 'PWR', 'ROP', 'TRV', 'NU', 'CNI', 'AXON', 'MNST', 'CMG', 'CARR', 'DEO', 'FCX', 'COR', 'TFC', 'URI', 'AMX', 'NDAQ', 'VRT', 'GLW', 'AFL', 'MPLX', 'NXPI', 'LNG', 'SRE', 'FLUT', 'ALL', 'ALNY', 'CPNG', 'FAST', 'LHX', 'MFC', 'E', 'D', 'FDX', 'O', 'MPC', 'PCAR', 'BDX', 'TRP', 'PAYX', 'CRWV', 'GM', 'MET', 'OKE', 'SLB', 'CMI', 'PSA', 'CTVA', 'PSX', 'WCN', 'TEAM', 'SU', 'GMBXF', 'AMP', 'CCEP', 'KR', 'DDOG', 'CCI', 'EW', 'VEEV', 'TAK', 'CBRE', 'XYZ', 'TGT', 'KDP', 'EXC', 'HLN', 'ROST', 'DHI', 'GWW', 'FERG', 'JD', 'PEG', 'AIG', 'CPRT', 'ALC', 'ZS', 'KMB', 'HMC', 'MSCI', 'IDXX', 'F', 'CVNA', 'BKR', 'OXY', 'FANG', 'IMO', 'XEL', 'EBAY', 'GRMN', 'AME', 'TTD', 'KBCSF', 'VALE', 'WPM', 'CRCL', 'KVUE', 'VLO', 'ARGX', 'FIS', 'RMD', 'TTWO', 'TCOM', 'CSGP', 'ETR', 'HEI', 'EA', 'CCL', 'ROK', 'HSY', 'SYY', 'VRSK', 'ED', 'MPWR', 'CAH', 'ABEV', 'B',
    
    // Extended+ tier (60) - 15 min updates
    'BABA', 'ASML', 'TM', 'AZN', 'NVS', 'LIN', 'NVO', 'HSBC', 'SHEL', 'HDB', 'RY', 'UL', 'SHOP', 'ETN', 'SONY', 'ARM', 'TTE', 'BHP', 'SPOT', 'SAN', 'TD', 'UBS', 'MDT', 'SNY', 'BUD', 'CB', 'TT', 'RIO', 'SMFG', 'BBVA', 'RELX', 'SE', 'TRI', 'PBR', 'NTES', 'BMO', 'RACE', 'AON', 'GSK', 'NWG', 'LYG', 'EQNR', 'CNQ', 'ITUB', 'ACN', 'MUFG', 'PDD', 'SAP', 'JCI', 'NGG', 'TCEHY', 'MELI', 'BAM', 'EXPGF', 'GLCNF', 'NPSNY', 'GMBXF'
  ],
  gl: [
    'TSLA', 'AMD', 'MU', 'META', 'NVDA', 'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'NFLX',
    'PLTR', 'SHOP', 'CRWD', 'SNOW', 'DDOG', 'NET', 'ZM', 'ROKU', 'SQ', 'PYPL',
    'UBER', 'LYFT', 'DASH', 'ABNB', 'SPOT', 'PINS', 'SNAP', 'TWTR', 'RBLX', 'HOOD'
  ],
  cm: [
    'LLY', 'AVGO', 'QCOM', 'ORCL', 'NVDA', 'AMD', 'INTC', 'TSM', 'ASML', 'KLAC',
    'AMAT', 'LRCX', 'MU', 'ADI', 'TXN', 'QCOM', 'MRVL', 'ON', 'MPWR', 'CRUS'
  ],
  cv: [
    'PEP', 'COST', 'WMT', 'TMO', 'HD', 'LOW', 'TGT', 'COST', 'TJX', 'DG',
    'DLTR', 'FIVE', 'BURL', 'ROST', 'ULTA', 'SBUX', 'MCD', 'YUM', 'CMG', 'DPZ'
  ]
};

export function getDefaultTickers(project: string): string[] {
  return DEFAULT_TICKERS[project as keyof typeof DEFAULT_TICKERS] || DEFAULT_TICKERS.pmp;
}

export function getProjectTickers(project: string, limit?: number): string[] {
  const tickers = getDefaultTickers(project);
  if (limit === undefined || limit === null) {
    return tickers;
  }
  // Handle negative or zero limits
  if (limit <= 0) {
    return [];
  }
  return tickers.slice(0, limit);
} 
export const DEFAULT_TICKERS = {
  pmp: [
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMZN', 'META', 'TSLA', 'BRK.A', 'BRK.B', 'JPM',
    'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR', 'PG',
    'ABBV', 'BAC', 'SAP', 'CVX', 'KO', 'GE', 'BABA', 'AMD', 'ASML', 'TMUS', 'CSCO',
    'PM', 'WFC', 'CRM', 'TM', 'IBM', 'AZN', 'NVS', 'MS', 'ABT', 'GS', 'INTU', 'MCD',
    'LIN', 'UNH', 'NVO', 'HSBC', 'SHEL', 'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'HDB',
    'PEP', 'NOW', 'UBER', 'RY', 'VZ', 'TMO', 'BKNG', 'SCHW', 'ISRG', 'BLK', 'C', 'BA',
    'SPGI', 'TXN', 'AMGN', 'QCOM', 'ACN', 'MUFG', 'PDD', 'BSX', 'SHOP', 'ETN', 'UL',
    'ADBE', 'ANET', 'SONY', 'ARM', 'NEE', 'SYK', 'AMAT', 'PGR', 'GILD', 'DHR', 'TJX',
    'HON', 'DE', 'PFE', 'BX', 'COF', 'UNP', 'TTE', 'BHP', 'SPOT', 'APH', 'KKR', 'LOW',
    'SAN', 'TD', 'LRCX', 'ADP', 'CMCSA', 'IBN', 'BTI', 'VRTX', 'KLAC', 'COP', 'MU',
    'UBS', 'PANW', 'SNPS', 'MDT', 'SNY', 'BUD', 'CRWD', 'WELL', 'NKE', 'ADI', 'CEG',
    'CB', 'ICE', 'DASH', 'SO', 'MO', 'CME', 'ENB', 'BN', 'AMT', 'SBUX', 'LMT', 'TT',
    'PLD', 'MMC', 'CDNS', 'RIO', 'SMFG', 'BBVA', 'DUK', 'RELX', 'WM', 'SE', 'PH', 'TRI',
    'BMY', 'MCK', 'DELL', 'HCA', 'SHW', 'RCL', 'INTC', 'NOC', 'ORLY', 'GD', 'MDLZ',
    'BP', 'PBR', 'COIN', 'NTES', 'BMO', 'EMR', 'ABNB', 'CVS', 'APO', 'RACE', 'MMM',
    'AON', 'GSK', 'EQIX', 'FTNT', 'HWM', 'ECL', 'WMB', 'ITW', 'FI', 'PNC', 'MSI',
    'AJG', 'MFG', 'RSG', 'UPS', 'NGG', 'VST', 'BK', 'JCI', 'CI', 'MAR', 'BNS', 'NEM',
    'USB', 'INFY', 'CL', 'BCS', 'ING', 'CM', 'CP', 'CSX', 'ZTS', 'LYG', 'CNQ', 'AZO',
    'EQNR', 'PYPL', 'ADSK', 'EOG', 'AEM', 'APD', 'DB', 'KMI', 'ELV', 'NSC', 'HLT',
    'AEP', 'TEL', 'REGN', 'WDAY', 'PWR', 'DLR', 'ROP', 'TRV', 'MNST', 'NU', 'CNI',
    'AXON', 'CMG', 'CARR', 'FCX', 'COR', 'NWG', 'TFC', 'URI', 'NDAQ', 'AMX', 'DEO',
    'GLW', 'AFL', 'NXPI', 'SRE', 'SPG', 'FAST', 'MFC', 'E', 'FDX', 'MPC', 'PCAR',
    'BDX', 'PAYX', 'TRP', 'MET', 'SLB', 'OKE', 'WCN', 'SU', 'DDOG', 'TAK', 'CCEP',
    'ALC', 'HMC', 'GRMN'
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
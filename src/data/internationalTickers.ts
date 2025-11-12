/**
 * International NYSE Tickers - Top 100 large international companies listed on NYSE
 * These are companies from outside the US that trade on NYSE
 */

export const INTERNATIONAL_NYSE_TICKERS = [
  // Top 100 international NYSE tickers (by market cap)
  'TSM', 'ASML', 'BABA', 'TM', 'AZN', 'NVS', 'LIN', 'NVO', 'HSBC', 'SHEL',
  'HDB', 'RY', 'UL', 'SHOP', 'ETN', 'SONY', 'ARM', 'TTE', 'BHP', 'SPOT',
  'SAN', 'TD', 'UBS', 'MDT', 'SNY', 'BUD', 'CB', 'TT', 'RIO', 'SMFG',
  'BBVA', 'RELX', 'SE', 'TRI', 'PBR', 'NTES', 'BMO', 'RACE', 'AON', 'GSK',
  'NWG', 'LYG', 'EQNR', 'CNQ', 'ITUB', 'ACN', 'MUFG', 'PDD', 'SAP', 'JCI',
  'NGG', 'TCEHY', 'MELI', 'BAM', 'EXPGF', 'GLCNF', 'NPSNY', 'GMBXF', 'BP',
  'INFY', 'BCS', 'ING', 'BNS', 'CP', 'CM', 'MFG', 'ENB', 'BTI', 'IBN',
  'DEO', 'CRH', 'DB', 'EOG', 'AEM', 'APD', 'KMI', 'ELV', 'NSC', 'GBTC',
  'HLT', 'ET', 'AEP', 'SPG', 'REGN', 'ARES', 'DLR', 'TEL', 'FIG', 'WDAY',
  'PWR', 'ROP', 'TRV', 'NU', 'CNI', 'AXON', 'MNST', 'CMG', 'CARR', 'FCX'
] as const;

/**
 * Get international NYSE tickers
 * @returns Array of international ticker symbols
 */
export function getInternationalNYSETickers(): string[] {
  return [...INTERNATIONAL_NYSE_TICKERS];
}


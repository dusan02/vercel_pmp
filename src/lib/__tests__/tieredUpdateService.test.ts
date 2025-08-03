import { TieredUpdateService, createTieredUpdateService } from '../tieredUpdateService';

describe('TieredUpdateService', () => {
  let service: TieredUpdateService;

  beforeEach(() => {
    // Create service with all tickers from the 4 tiers
    const allTickers = [
      // Premium tier (50)
      'NVDA', 'MSFT', 'AAPL', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AVGO', 'BRK.B', 'TSLA', 'TSM', 'JPM', 'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'TMUS', 'CSCO', 'PM', 'WFC', 'CRM', 'IBM', 'MS', 'ABT', 'GS', 'MCD', 'INTU', 'UNH', 'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'PEP', 'NOW',
      // Standard tier (100)
      'UBER', 'VZ', 'TMO', 'BKNG', 'SCHW', 'ISRG', 'BLK', 'C', 'BA', 'SPGI', 'TXN', 'AMGN', 'QCOM', 'BSX', 'ANET', 'ADBE', 'NEE', 'SYK', 'AMAT', 'PGR', 'GILD', 'DHR', 'TJX', 'HON', 'DE', 'PFE', 'BX', 'COF', 'UNP', 'APH', 'KKR', 'LOW', 'LRCX', 'ADP', 'CMCSA', 'VRTX', 'KLAC', 'COP', 'MU', 'PANW', 'SNPS', 'CRWD', 'WELL', 'NKE', 'ADI', 'CEG', 'ICE', 'DASH', 'SO', 'MO', 'CME', 'AMT', 'SBUX', 'LMT', 'PLD', 'MMC', 'CDNS', 'DUK', 'WM', 'PH', 'BMY', 'MCK', 'DELL', 'HCA', 'SHW', 'RCL', 'INTC', 'NOC', 'ORLY', 'GD', 'MDLZ', 'COIN', 'EMR', 'ABNB', 'CVS', 'APO', 'MMM', 'EQIX', 'FTNT', 'HWM', 'ECL', 'WMB', 'ITW', 'FI', 'PNC', 'MSI', 'AJG', 'RSG', 'UPS', 'VST', 'BK', 'CI', 'MAR', 'GEV', 'APP', 'IBKR', 'MSTR', 'MCO', 'CTAS', 'TDG', 'HOOD', 'RBLX', 'SCCO', 'NET', 'BNS', 'BCS', 'NEM', 'USB', 'ING', 'SNOW', 'CL', 'EPD', 'ZTS', 'CSX', 'AZO',
      // Extended tier (150)
      'MRVL', 'PYPL', 'CRH', 'DB', 'EOG', 'ADSK', 'AEM', 'APD', 'KMI', 'ELV', 'NSC', 'GBTC', 'HLT', 'ET', 'AEP', 'SPG', 'REGN', 'ARES', 'DLR', 'TEL', 'FIG', 'WDAY', 'PWR', 'ROP', 'TRV', 'NU', 'CNI', 'AXON', 'MNST', 'CMG', 'CARR', 'DEO', 'FCX', 'COR', 'TFC', 'URI', 'AMX', 'NDAQ', 'VRT', 'GLW', 'AFL', 'MPLX', 'NXPI', 'LNG', 'SRE', 'FLUT', 'ALL', 'ALNY', 'CPNG', 'FAST', 'LHX', 'MFC', 'E', 'D', 'FDX', 'O', 'MPC', 'PCAR', 'BDX', 'TRP', 'PAYX', 'CRWV', 'GM', 'MET', 'OKE', 'SLB', 'CMI', 'PSA', 'CTVA', 'PSX', 'WCN', 'TEAM', 'SU', 'GMBXF', 'AMP', 'CCEP', 'KR', 'DDOG', 'CCI', 'EW', 'VEEV', 'TAK', 'CBRE', 'XYZ', 'TGT', 'KDP', 'EXC', 'HLN', 'ROST', 'DHI', 'GWW', 'FERG', 'JD', 'PEG', 'AIG', 'CPRT', 'ALC', 'ZS', 'KMB', 'HMC', 'MSCI', 'IDXX', 'F', 'CVNA', 'BKR', 'OXY', 'FANG', 'IMO', 'XEL', 'EBAY', 'GRMN', 'AME', 'TTD', 'KBCSF', 'VALE', 'WPM', 'CRCL', 'KVUE', 'VLO', 'ARGX', 'FIS', 'RMD', 'TTWO', 'TCOM', 'CSGP', 'ETR', 'HEI', 'EA', 'CCL', 'ROK', 'HSY', 'SYY', 'VRSK', 'ED', 'MPWR', 'CAH', 'ABEV', 'B',
      // Extended+ tier (60) - 15 min updates
      'BABA', 'ASML', 'TM', 'AZN', 'NVS', 'LIN', 'NVO', 'HSBC', 'SHEL', 'HDB', 'RY', 'UL', 'SHOP', 'ETN', 'SONY', 'ARM', 'TTE', 'BHP', 'SPOT', 'SAN', 'TD', 'UBS', 'MDT', 'SNY', 'BUD', 'CB', 'TT', 'RIO', 'SMFG', 'BBVA', 'RELX', 'SE', 'TRI', 'PBR', 'NTES', 'BMO', 'RACE', 'AON', 'GSK', 'NWG', 'LYG', 'EQNR', 'CNQ', 'ITUB', 'ACN', 'MUFG', 'PDD', 'SAP', 'JCI', 'NGG', 'TCEHY', 'MELI', 'BAM', 'EXPGF', 'GLCNF', 'NPSNY', 'GMBXF'
    ];
    service = createTieredUpdateService(allTickers);
  });

  describe('getTierTickers', () => {
    it('should return premium tier tickers', () => {
      const premiumTickers = service.getTierTickers('premium');
      expect(premiumTickers.length).toBeGreaterThan(0);
      expect(premiumTickers[0]).toBe('NVDA');
      expect(premiumTickers).toContain('NOW');
    });

    it('should return standard tier tickers', () => {
      const standardTickers = service.getTierTickers('standard');
      expect(standardTickers.length).toBeGreaterThan(0);
      expect(standardTickers[0]).toBe('UBER');
      expect(standardTickers).toContain('AZO');
    });

    it('should return extended tier tickers', () => {
      const extendedTickers = service.getTierTickers('extended');
      expect(extendedTickers.length).toBeGreaterThan(0);
      expect(extendedTickers[0]).toBe('MRVL');
      expect(extendedTickers).toContain('B');
    });

    it('should return extendedPlus tier tickers', () => {
      const extendedPlusTickers = service.getTierTickers('extendedPlus');
      expect(extendedPlusTickers.length).toBeGreaterThan(0);
      expect(extendedPlusTickers[0]).toBe('BABA');
      expect(extendedPlusTickers).toContain('NPSNY');
    });
  });

  describe('getUpdateStats', () => {
    it('should return valid statistics', () => {
      const stats = service.getUpdateStats();
      
      expect(stats.totalCompanies).toBe(360); // Changed from 400 to 360
      expect(stats.premiumCount).toBe(50);
      expect(stats.standardCount).toBe(100);
      expect(stats.extendedCount).toBe(150);
      expect(stats.extendedPlusCount).toBe(60); // Changed from 100 to 60
      expect(stats.apiCallsPerHour).toBeGreaterThan(0);
      expect(stats.nextUpdates.length).toBe(4);
    });
  });

  describe('getTickerTier', () => {
    it('should return correct tier for premium tickers', () => {
      const tier = service.getTickerTier('NVDA');
      expect(tier?.tier).toBe('premium');
      expect(tier?.frequency).toBe(1);
    });

    it('should return correct tier for standard tickers', () => {
      const tier = service.getTickerTier('UBER');
      expect(tier?.tier).toBe('standard');
      expect(tier?.frequency).toBe(3);
    });

    it('should return correct tier for extended tickers', () => {
      const tier = service.getTickerTier('MRVL');
      expect(tier?.tier).toBe('extended');
      expect(tier?.frequency).toBe(5);
    });

    it('should return correct tier for extendedPlus tickers', () => {
      const tier = service.getTickerTier('BABA');
      expect(tier?.tier).toBe('extendedPlus');
      expect(tier?.frequency).toBe(15); // Changed from 10 to 15 minutes
    });

    it('should return null for unknown ticker', () => {
      const tier = service.getTickerTier('UNKNOWN');
      expect(tier).toBeNull();
    });
  });

  describe('getTickersByTier', () => {
    it('should return all tiers grouped correctly', () => {
      const tiers = service.getTickersByTier();
      
      expect(Object.keys(tiers)).toHaveLength(4);
      expect(tiers.premium.length).toBeGreaterThan(0);
      expect(tiers.standard.length).toBeGreaterThan(0);
      expect(tiers.extended.length).toBeGreaterThan(0);
      expect(tiers.extendedPlus.length).toBeGreaterThan(0);
    });
  });

  describe('API calls calculation', () => {
    it('should calculate API calls per hour correctly', () => {
      const stats = service.getUpdateStats();
      
      // Verify the calculation logic works
      const expectedCalculation = 
        (stats.premiumCount * 60) + 
        (stats.standardCount * 20) + 
        (stats.extendedCount * 12) + 
        (stats.extendedPlusCount * 4); // 15 min = 4 calls/hour
      
      expect(stats.apiCallsPerHour).toBe(expectedCalculation);
    });
  });

  describe('getTickersForUpdate', () => {
    it('should return tickers that need updating', () => {
      const tickersForUpdate = service.getTickersForUpdate();
      expect(Array.isArray(tickersForUpdate)).toBe(true);
    });
  });
}); 
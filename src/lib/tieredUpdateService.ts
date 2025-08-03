// Tiered Update Service for 402 companies with different update frequencies

interface CompanyTier {
  tier: 'premium' | 'standard' | 'extended' | 'extendedPlus';
  frequency: number; // minutes
  maxCompanies: number;
  description: string;
}

interface UpdateSchedule {
  tier: string;
  tickers: string[];
  nextUpdate: Date;
  frequency: number;
}

export class TieredUpdateService {
  private tiers: CompanyTier[] = [
    {
      tier: 'premium',
      frequency: 1,
      maxCompanies: 50,
      description: 'Top 50 by market cap - highest priority'
    },
    {
      tier: 'standard',
      frequency: 3,
      maxCompanies: 100,
      description: 'Companies #51-150 by market cap - medium priority'
    },
    {
      tier: 'extended',
      frequency: 5,
      maxCompanies: 150,
      description: 'Companies #151-300 by market cap - lower priority'
    },
    {
      tier: 'extendedPlus',
      frequency: 15, // Changed from 10 to 15 minutes for optimization
      maxCompanies: 60, // Changed from 100 to 60 to match actual unique tickers
      description: 'Companies #301-360 by market cap - lowest priority'
    }
  ];

  private updateSchedules: Map<string, UpdateSchedule> = new Map();
  private allTickers: string[] = [];

  constructor(tickers: string[]) {
    this.allTickers = tickers;
    this.initializeSchedules();
  }

  private initializeSchedules(): void {
    const now = new Date();
    
    this.tiers.forEach((tier, index) => {
      const startIndex = index === 0 ? 0 : 
                        index === 1 ? 50 : 
                        index === 2 ? 150 : 300; // Changed from 300 to 300 (no change needed)
      const endIndex = Math.min(startIndex + tier.maxCompanies, this.allTickers.length);
      const tierTickers = this.allTickers.slice(startIndex, endIndex);
      
      const staggerMinutes = index * 0.5;
      const nextUpdate = new Date(now.getTime() + (tier.frequency + staggerMinutes) * 60 * 1000);
      
      this.updateSchedules.set(tier.tier, {
        tier: tier.tier,
        tickers: tierTickers,
        nextUpdate,
        frequency: tier.frequency
      });
    });
  }

  /**
   * Get tickers that need updating
   */
  getTickersForUpdate(): string[] {
    const now = new Date();
    const tickersToUpdate: string[] = [];

    this.updateSchedules.forEach((schedule) => {
      if (now >= schedule.nextUpdate) {
        tickersToUpdate.push(...schedule.tickers);
        
        // Schedule next update
        schedule.nextUpdate = new Date(now.getTime() + schedule.frequency * 60 * 1000);
      }
    });

    return tickersToUpdate;
  }

  /**
   * Get update statistics
   */
  getUpdateStats(): {
    totalCompanies: number;
    premiumCount: number;
    standardCount: number;
    extendedCount: number;
    extendedPlusCount: number;
    nextUpdates: { tier: string; time: string; count: number }[];
    apiCallsPerHour: number;
  } {
    const stats = {
      totalCompanies: this.allTickers.length,
      premiumCount: 0,
      standardCount: 0,
      extendedCount: 0,
      extendedPlusCount: 0,
      nextUpdates: [] as { tier: string; time: string; count: number }[],
      apiCallsPerHour: 0
    };

    this.updateSchedules.forEach((schedule) => {
      const count = schedule.tickers.length;
      
      switch (schedule.tier) {
        case 'premium':
          stats.premiumCount = count;
          stats.apiCallsPerHour += count * 60; // 60 updates per hour
          break;
        case 'standard':
          stats.standardCount = count;
          stats.apiCallsPerHour += count * 20; // 20 updates per hour
          break;
        case 'extended':
          stats.extendedCount = count;
          stats.apiCallsPerHour += count * 12; // 12 updates per hour
          break;
        case 'extendedPlus':
          stats.extendedPlusCount = count;
          stats.apiCallsPerHour += count * 4; // Changed from 6 to 4 (15 min = 4 calls/hour)
          break;
      }

      stats.nextUpdates.push({
        tier: schedule.tier,
        time: schedule.nextUpdate.toISOString(),
        count
      });
    });

    return stats;
  }

  /**
   * Get tier information for a specific ticker
   */
  getTickerTier(ticker: string): CompanyTier | null {
    const tickerIndex = this.allTickers.indexOf(ticker);
    if (tickerIndex === -1) return null;

    if (tickerIndex < 50) return this.tiers[0]; // premium
    if (tickerIndex < 150) return this.tiers[1]; // standard
    if (tickerIndex < 300) return this.tiers[2]; // extended
    if (tickerIndex < 360) return this.tiers[3]; // extendedPlus - Changed from 400 to 360
    
    return null;
  }

  /**
   * Get all tickers grouped by tier
   */
  getTickersByTier(): { [tier: string]: string[] } {
    const result: { [tier: string]: string[] } = {};
    
    this.updateSchedules.forEach((schedule) => {
      result[schedule.tier] = schedule.tickers;
    });
    
    return result;
  }

  /**
   * Get specific tier tickers based on market cap ranking
   */
  getTierTickers(tier: 'premium' | 'standard' | 'extended' | 'extendedPlus'): string[] {
    switch (tier) {
      case 'premium':
        return [
          'NVDA', 'MSFT', 'AAPL', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AVGO', 'BRK.B', 'TSLA', 'TSM', 'JPM', 'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'TMUS', 'CSCO', 'PM', 'WFC', 'CRM', 'IBM', 'MS', 'ABT', 'GS', 'MCD', 'INTU', 'UNH', 'RTX', 'DIS', 'AXP', 'CAT', 'MRK', 'T', 'PEP', 'NOW'
        ];
      case 'standard':
        return [
          'UBER', 'VZ', 'TMO', 'BKNG', 'SCHW', 'ISRG', 'BLK', 'C', 'BA', 'SPGI', 'TXN', 'AMGN', 'QCOM', 'BSX', 'ANET', 'ADBE', 'NEE', 'SYK', 'AMAT', 'PGR', 'GILD', 'DHR', 'TJX', 'HON', 'DE', 'PFE', 'BX', 'COF', 'UNP', 'APH', 'KKR', 'LOW', 'LRCX', 'ADP', 'CMCSA', 'VRTX', 'KLAC', 'COP', 'MU', 'PANW', 'SNPS', 'CRWD', 'WELL', 'NKE', 'ADI', 'CEG', 'ICE', 'DASH', 'SO', 'MO', 'CME', 'AMT', 'SBUX', 'LMT', 'PLD', 'MMC', 'CDNS', 'DUK', 'WM', 'PH', 'BMY', 'MCK', 'DELL', 'HCA', 'SHW', 'RCL', 'INTC', 'NOC', 'ORLY', 'GD', 'MDLZ', 'COIN', 'EMR', 'ABNB', 'CVS', 'APO', 'MMM', 'EQIX', 'FTNT', 'HWM', 'ECL', 'WMB', 'ITW', 'FI', 'PNC', 'MSI', 'AJG', 'RSG', 'UPS', 'VST', 'BK', 'CI', 'MAR', 'GEV', 'APP', 'IBKR', 'MSTR', 'MCO', 'CTAS', 'TDG', 'HOOD', 'RBLX', 'SCCO', 'NET', 'BNS', 'BCS', 'NEM', 'USB', 'ING', 'SNOW', 'CL', 'EPD', 'ZTS', 'CSX', 'AZO'
        ];
      case 'extended':
        return [
          'MRVL', 'PYPL', 'CRH', 'DB', 'EOG', 'ADSK', 'AEM', 'APD', 'KMI', 'ELV', 'NSC', 'GBTC', 'HLT', 'ET', 'AEP', 'SPG', 'REGN', 'ARES', 'DLR', 'TEL', 'FIG', 'WDAY', 'PWR', 'ROP', 'TRV', 'NU', 'CNI', 'AXON', 'MNST', 'CMG', 'CARR', 'DEO', 'FCX', 'COR', 'TFC', 'URI', 'AMX', 'NDAQ', 'VRT', 'GLW', 'AFL', 'MPLX', 'NXPI', 'LNG', 'SRE', 'FLUT', 'ALL', 'ALNY', 'CPNG', 'FAST', 'LHX', 'MFC', 'E', 'D', 'FDX', 'O', 'MPC', 'PCAR', 'BDX', 'TRP', 'PAYX', 'CRWV', 'GM', 'MET', 'OKE', 'SLB', 'CMI', 'PSA', 'CTVA', 'PSX', 'WCN', 'TEAM', 'SU', 'GMBXF', 'AMP', 'CCEP', 'KR', 'DDOG', 'CCI', 'EW', 'VEEV', 'TAK', 'CBRE', 'XYZ', 'TGT', 'KDP', 'EXC', 'HLN', 'ROST', 'DHI', 'GWW', 'FERG', 'JD', 'PEG', 'AIG', 'CPRT', 'ALC', 'ZS', 'KMB', 'HMC', 'MSCI', 'IDXX', 'F', 'CVNA', 'BKR', 'OXY', 'FANG', 'IMO', 'XEL', 'EBAY', 'GRMN', 'AME', 'TTD', 'KBCSF', 'VALE', 'WPM', 'CRCL', 'KVUE', 'VLO', 'ARGX', 'FIS', 'RMD', 'TTWO', 'TCOM', 'CSGP', 'ETR', 'HEI', 'EA', 'CCL', 'ROK', 'HSY', 'SYY', 'VRSK', 'ED', 'MPWR', 'CAH', 'ABEV', 'B'
        ];
      case 'extendedPlus':
        return [
          // 60 unique international tickers (no duplicates)
          'BABA', 'ASML', 'TM', 'AZN', 'NVS', 'LIN', 'NVO', 'HSBC', 'SHEL', 'HDB', 'RY', 'UL', 'SHOP', 'ETN', 'SONY', 'ARM', 'TTE', 'BHP', 'SPOT', 'SAN', 'TD', 'UBS', 'MDT', 'SNY', 'BUD', 'CB', 'TT', 'RIO', 'SMFG', 'BBVA', 'RELX', 'SE', 'TRI', 'PBR', 'NTES', 'BMO', 'RACE', 'AON', 'GSK', 'NWG', 'LYG', 'EQNR', 'CNQ', 'ITUB', 'ACN', 'MUFG', 'PDD', 'SAP', 'JCI', 'NGG', 'TCEHY', 'MELI', 'BAM', 'EXPGF', 'GLCNF', 'NPSNY', 'GMBXF'
        ];
      default:
        return [];
    }
  }
}

// Helper function to create tiered service
export function createTieredUpdateService(tickers: string[]): TieredUpdateService {
  return new TieredUpdateService(tickers);
} 
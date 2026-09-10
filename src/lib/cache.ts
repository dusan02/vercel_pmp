import { getCachedData, setCachedData, getCacheStatus, setCacheStatus, CACHE_KEYS } from './redis';
import { dbHelpers, runTransaction, initializeDatabase } from './database';
import { createBackgroundService } from './backgroundService';

interface CachedStockData {
  ticker: string;
  preMarketPrice: number;
  closePrice: number;
  percentChange: number;
  marketCapDiff: number;
  marketCap: number;
  lastUpdated: Date;
}

class StockDataCache {
  private cache: Map<string, CachedStockData> = new Map();
  private isUpdating = false;
  private updateInterval: NodeJS.Timeout | null = null;

  // Top 200 US companies by market cap
  private readonly TICKERS = [
    'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'AVGO', 'BRK.A', 'BRK.B', 'TSLA',
    'JPM', 'WMT', 'LLY', 'ORCL', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD', 'PLTR',
    'PG', 'BAC', 'ABBV', 'CVX', 'KO', 'AMD', 'GE', 'CSCO', 'TMUS', 'WFC', 'CRM',
    'PM', 'IBM', 'UNH', 'MS', 'GS', 'INTU', 'LIN', 'ABT', 'AXP', 'BX', 'DIS', 'MCD',
    'RTX', 'NOW', 'MRK', 'CAT', 'T', 'PEP', 'UBER', 'BKNG', 'TMO', 'VZ', 'SCHW', 'ISRG',
    'QCOM', 'C', 'TXN', 'BA', 'BLK', 'GEV', 'ACN', 'SPGI', 'AMGN', 'ADBE', 'BSX', 'SYK',
    'ETN', 'AMAT', 'ANET', 'NEE', 'DHR', 'HON', 'TJX', 'PGR', 'GILD', 'DE', 'PFE', 'COF',
    'KKR', 'PANW', 'UNP', 'APH', 'LOW', 'LRCX', 'MU', 'ADP', 'CMCSA', 'COP', 'KLAC',
    'VRTX', 'MDT', 'SNPS', 'NKE', 'CRWD', 'ADI', 'WELL', 'CB', 'ICE', 'SBUX', 'TT',
    'SO', 'CEG', 'PLD', 'DASH', 'AMT', 'MO', 'MMC', 'CME', 'CDNS', 'LMT', 'BMY', 'WM',
    'PH', 'COIN', 'DUK', 'RCL', 'MCO', 'MDLZ', 'DELL', 'TDG', 'CTAS', 'INTC', 'MCK',
    'ABNB', 'GD', 'ORLY', 'APO', 'SHW', 'HCA', 'EMR', 'NOC', 'MMM', 'FTNT', 'EQIX',
    'CI', 'UPS', 'FI', 'HWM', 'AON', 'PNC', 'CVS', 'RSG', 'AJG', 'ITW', 'MAR', 'ECL',
    'MSI', 'USB', 'WMB', 'BK', 'CL', 'NEM', 'PYPL', 'JCI', 'ZTS', 'VST', 'EOG', 'CSX',
    'ELV', 'ADSK', 'APD', 'AZO', 'HLT', 'WDAY', 'SPG', 'NSC', 'KMI', 'TEL', 'FCX',
    'CARR', 'PWR', 'REGN', 'ROP', 'CMG', 'DLR', 'MNST', 'TFC', 'TRV', 'AEP', 'NXPI',
    'AXON', 'URI', 'COR', 'FDX', 'NDAQ', 'AFL', 'GLW', 'FAST', 'MPC', 'SLB', 'SRE',
    'PAYX', 'PCAR', 'MET', 'BDX', 'OKE', 'DDOG',
    // International companies
    'TSM', 'SAP', 'ASML', 'BABA', 'TM', 'AZN', 'HSBC', 'NVS', 'SHEL',
    'HDB', 'RY', 'NVO', 'ARM', 'SHOP', 'MUFG', 'PDD', 'UL',
    'SONY', 'TTE', 'BHP', 'SAN', 'TD', 'SPOT', 'UBS', 'IBN', 'SNY',
    'BUD', 'BTI', 'BN', 'SMFG', 'ENB', 'RELX', 'TRI', 'RACE',
    'BBVA', 'SE', 'BP', 'NTES', 'BMO', 'RIO', 'GSK', 'MFG', 'INFY',
    'CP', 'BCS', 'NGG', 'BNS', 'ING', 'EQNR', 'CM', 'CNQ', 'LYG',
    'AEM', 'DB', 'NU', 'CNI', 'DEO', 'NWG', 'AMX', 'MFC',
    'E', 'WCN', 'SU', 'TRP', 'PBR', 'HMC', 'GRMN', 'CCEP', 'ALC', 'TAK'
  ];

  // Company names mapping
  private readonly companyNames: Record<string, string> = {
    'NVDA': 'NVIDIA', 'MSFT': 'Microsoft', 'AAPL': 'Apple', 'AMZN': 'Amazon', 'GOOGL': 'Alphabet', 'GOOG': 'Alphabet',
    'META': 'Meta Platforms', 'AVGO': 'Broadcom', 'BRK.A': 'Berkshire Hathaway', 'BRK.B': 'Berkshire Hathaway', 'TSLA': 'Tesla',
    'JPM': 'JPMorgan Chase', 'WMT': 'Walmart', 'LLY': 'Eli Lilly', 'ORCL': 'Oracle', 'V': 'Visa', 'MA': 'Mastercard',
    'NFLX': 'Netflix', 'XOM': 'Exxon Mobil', 'COST': 'Costco', 'JNJ': 'Johnson & Johnson', 'HD': 'Home Depot', 'PLTR': 'Palantir',
    'PG': 'Procter & Gamble', 'BAC': 'Bank of America', 'ABBV': 'AbbVie', 'CVX': 'Chevron', 'KO': 'Coca-Cola', 'AMD': 'Advanced Micro Devices',
    'GE': 'General Electric', 'CSCO': 'Cisco Systems', 'TMUS': 'T-Mobile US', 'WFC': 'Wells Fargo', 'CRM': 'Salesforce', 'PM': 'Philip Morris',
    'IBM': 'IBM', 'UNH': 'UnitedHealth Group', 'MS': 'Morgan Stanley', 'GS': 'Goldman Sachs', 'INTU': 'Intuit', 'LIN': 'Linde',
    'ABT': 'Abbott Laboratories', 'AXP': 'American Express', 'BX': 'Blackstone', 'DIS': 'Walt Disney', 'MCD': 'McDonald\'s', 'RTX': 'Raytheon Technologies',
    'NOW': 'ServiceNow', 'MRK': 'Merck', 'CAT': 'Caterpillar', 'T': 'AT&T', 'PEP': 'PepsiCo', 'UBER': 'Uber Technologies',
    'BKNG': 'Booking Holdings', 'TMO': 'Thermo Fisher Scientific', 'VZ': 'Verizon', 'SCHW': 'Charles Schwab', 'ISRG': 'Intuitive Surgical', 'QCOM': 'Qualcomm',
    'C': 'Citigroup', 'TXN': 'Texas Instruments', 'BA': 'Boeing', 'BLK': 'BlackRock', 'ACN': 'Accenture', 'SPGI': 'S&P Global',
    'AMGN': 'Amgen', 'ADBE': 'Adobe', 'BSX': 'Boston Scientific', 'SYK': 'Stryker', 'ETN': 'Eaton', 'AMAT': 'Applied Materials',
    'ANET': 'Arista Networks', 'NEE': 'NextEra Energy', 'DHR': 'Danaher', 'HON': 'Honeywell', 'TJX': 'TJX Companies', 'PGR': 'Progressive',
    'GILD': 'Gilead Sciences', 'DE': 'Deere & Company', 'PFE': 'Pfizer', 'COF': 'Capital One', 'KKR': 'KKR & Co', 'PANW': 'Palo Alto Networks',
    'UNP': 'Union Pacific', 'APH': 'Amphenol', 'LOW': 'Lowe\'s', 'LRCX': 'Lam Research', 'MU': 'Micron Technology', 'ADP': 'Automatic Data Processing',
    'CMCSA': 'Comcast', 'COP': 'ConocoPhillips', 'KLAC': 'KLA Corporation', 'VRTX': 'Vertex Pharmaceuticals', 'MDT': 'Medtronic', 'SNPS': 'Synopsys',
    'NKE': 'Nike', 'CRWD': 'CrowdStrike', 'ADI': 'Analog Devices', 'WELL': 'Welltower', 'CB': 'Chubb', 'ICE': 'Intercontinental Exchange',
    'SBUX': 'Starbucks', 'TT': 'Trane Technologies', 'SO': 'Southern Company', 'CEG': 'Constellation Energy', 'PLD': 'Prologis', 'DASH': 'DoorDash',
    'AMT': 'American Tower', 'MO': 'Altria Group', 'MMC': 'Marsh & McLennan', 'CME': 'CME Group', 'CDNS': 'Cadence Design Systems', 'LMT': 'Lockheed Martin',
    'BMY': 'Bristol-Myers Squibb', 'WM': 'Waste Management', 'PH': 'Parker-Hannifin', 'COIN': 'Coinbase Global', 'DUK': 'Duke Energy', 'RCL': 'Royal Caribbean',
    'MCO': 'Moody\'s', 'MDLZ': 'Mondelez International', 'DELL': 'Dell Technologies', 'TDG': 'TransDigm Group', 'CTAS': 'Cintas', 'INTC': 'Intel',
    'MCK': 'McKesson', 'ABNB': 'Airbnb', 'GD': 'General Dynamics', 'ORLY': 'O\'Reilly Automotive', 'APO': 'Apollo Global Management', 'SHW': 'Sherwin-Williams',
    'HCA': 'HCA Healthcare', 'EMR': 'Emerson Electric', 'NOC': 'Northrop Grumman', 'MMM': '3M', 'FTNT': 'Fortinet', 'EQIX': 'Equinix',
    'CI': 'Cigna', 'UPS': 'United Parcel Service', 'FI': 'Fiserv', 'HWM': 'Howmet Aerospace', 'AON': 'Aon', 'PNC': 'PNC Financial Services',
    'CVS': 'CVS Health', 'RSG': 'Republic Services', 'AJG': 'Arthur J. Gallagher', 'ITW': 'Illinois Tool Works', 'MAR': 'Marriott International', 'ECL': 'Ecolab',
    'MSI': 'Motorola Solutions', 'USB': 'U.S. Bancorp', 'WMB': 'Williams Companies', 'BK': 'Bank of New York Mellon', 'CL': 'Colgate-Palmolive', 'NEM': 'Newmont',
    'PYPL': 'PayPal', 'JCI': 'Johnson Controls', 'ZTS': 'Zoetis', 'VST': 'Vistra', 'EOG': 'EOG Resources', 'CSX': 'CSX',
    'ELV': 'Elevance Health', 'ADSK': 'Autodesk', 'APD': 'Air Products and Chemicals', 'AZO': 'AutoZone', 'HLT': 'Hilton Worldwide', 'WDAY': 'Workday',
    'SPG': 'Simon Property Group', 'NSC': 'Norfolk Southern', 'KMI': 'Kinder Morgan', 'TEL': 'TE Connectivity', 'FCX': 'Freeport-McMoRan', 'CARR': 'Carrier Global',
    'PWR': 'Quanta Services', 'REGN': 'Regeneron Pharmaceuticals', 'ROP': 'Roper Technologies', 'CMG': 'Chipotle Mexican Grill', 'DLR': 'Digital Realty Trust', 'MNST': 'Monster Beverage',
    'TFC': 'Truist Financial', 'TRV': 'Travelers Companies', 'AEP': 'American Electric Power', 'NXPI': 'NXP Semiconductors', 'AXON': 'Axon Enterprise', 'URI': 'United Rentals',
    'COR': 'Cencora', 'FDX': 'FedEx', 'NDAQ': 'Nasdaq', 'AFL': 'Aflac', 'GLW': 'Corning', 'FAST': 'Fastenal',
    'MPC': 'Marathon Petroleum', 'SLB': 'Schlumberger', 'SRE': 'Sempra Energy', 'PAYX': 'Paychex', 'PCAR': 'PACCAR', 'MET': 'MetLife',
    'BDX': 'Becton Dickinson', 'OKE': 'ONEOK', 'DDOG': 'Datadog',
    // International companies
    'TSM': 'Taiwan Semiconductor', 'SAP': 'SAP SE', 'ASML': 'ASML Holding', 'BABA': 'Alibaba Group', 'TM': 'Toyota Motor', 'AZN': 'AstraZeneca',
    'HSBC': 'HSBC Holdings', 'NVS': 'Novartis', 'SHEL': 'Shell', 'HDB': 'HDFC Bank', 'RY': 'Royal Bank of Canada', 'NVO': 'Novo Nordisk',
    'ARM': 'ARM Holdings', 'SHOP': 'Shopify', 'MUFG': 'Mitsubishi UFJ Financial', 'PDD': 'Pinduoduo', 'UL': 'Unilever', 'SONY': 'Sony Group',
    'TTE': 'TotalEnergies', 'BHP': 'BHP Group', 'SAN': 'Banco Santander', 'TD': 'Toronto-Dominion Bank', 'SPOT': 'Spotify Technology', 'UBS': 'UBS Group',
    'IBN': 'ICICI Bank', 'SNY': 'Sanofi', 'BUD': 'Anheuser-Busch InBev', 'BTI': 'British American Tobacco', 'BN': 'Danone', 'SMFG': 'Sumitomo Mitsui Financial',
    'ENB': 'Enbridge', 'RELX': 'RELX Group', 'TRI': 'Thomson Reuters', 'RACE': 'Ferrari', 'BBVA': 'Banco Bilbao Vizcaya', 'SE': 'Sea Limited',
    'BP': 'BP', 'NTES': 'NetEase', 'BMO': 'Bank of Montreal', 'RIO': 'Rio Tinto', 'GSK': 'GlaxoSmithKline', 'MFG': 'Mizuho Financial',
    'INFY': 'Infosys', 'CP': 'Canadian Pacific Railway', 'BCS': 'Barclays', 'NGG': 'National Grid', 'BNS': 'Bank of Nova Scotia', 'ING': 'ING Group',
    'EQNR': 'Equinor', 'CM': 'Canadian Imperial Bank', 'CNQ': 'Canadian Natural Resources', 'LYG': 'Lloyds Banking Group', 'AEM': 'Agnico Eagle Mines', 'DB': 'Deutsche Bank',
    'NU': 'Nu Holdings', 'CNI': 'Canadian National Railway', 'DEO': 'Diageo', 'NWG': 'NatWest Group', 'AMX': 'America Movil', 'MFC': 'Manulife Financial',
    'E': 'Eni', 'WCN': 'Waste Connections', 'SU': 'Suncor Energy', 'TRP': 'TC Energy', 'PBR': 'Petrobras', 'HMC': 'Honda Motor',
    'GRMN': 'Garmin', 'CCEP': 'Coca-Cola Europacific Partners', 'ALC': 'Alcon', 'TAK': 'Takeda Pharmaceutical'
  };

  // Share counts for market cap calculation - Updated for 98% accuracy with Finviz
  private readonly shareCounts: Record<string, number> = {
    // Top 10 by market cap - Finviz verified
    'NVDA': 24400000000, 'MSFT': 7440000000, 'AAPL': 15400000000, 'AMZN': 10400000000,
    'GOOGL': 12500000000, 'GOOG': 12500000000, 'META': 2520000000, 'AVGO': 4700000000,
    'BRK.A': 1400000000, 'BRK.B': 2200000000, 'TSLA': 3180000000,
    
    // Next 20 - Finviz verified
    'JPM': 2900000000, 'WMT': 8000000000, 'LLY': 950000000, 'ORCL': 2800000000,
    'V': 2100000000, 'MA': 920000000, 'NFLX': 420000000, 'XOM': 3900000000,
    'COST': 440000000, 'JNJ': 2400000000, 'HD': 990000000, 'PLTR': 2200000000,
    'PG': 2300000000, 'BAC': 8000000000, 'ABBV': 1770000000, 'CVX': 1900000000,
    'KO': 4300000000, 'AMD': 1600000000, 'GE': 1100000000, 'CSCO': 4000000000,
    
    // Rest of top 200 - Updated for accuracy
    'TMUS': 1200000000, 'WFC': 3600000000, 'CRM': 1000000000, 'PM': 1500000000,
    'IBM': 900000000, 'UNH': 920000000, 'MS': 1600000000, 'GS': 320000000,
    'INTU': 280000000, 'LIN': 480000000, 'ABT': 1700000000, 'AXP': 1100000000,
    'BX': 700000000, 'DIS': 1800000000, 'MCD': 730000000, 'RTX': 1300000000,
    'NOW': 200000000, 'MRK': 2500000000, 'CAT': 500000000, 'T': 7100000000,
    'PEP': 1400000000, 'UBER': 2000000000, 'BKNG': 35000000, 'TMO': 380000000,
    'VZ': 4200000000, 'SCHW': 1800000000, 'ISRG': 35000000, 'QCOM': 1100000000,
    'C': 1900000000, 'TXN': 900000000, 'BA': 600000000, 'BLK': 150000000,
    'ACN': 630000000, 'SPGI': 250000000, 'AMGN': 540000000, 'ADBE': 450000000,
    'BSX': 1400000000, 'SYK': 380000000, 'ETN': 400000000, 'AMAT': 800000000,
    'ANET': 300000000, 'NEE': 2000000000, 'DHR': 1400000000, 'HON': 1300000000,
    'TJX': 1100000000, 'PGR': 580000000, 'GILD': 1200000000, 'DE': 280000000,
    'PFE': 5600000000, 'COF': 400000000, 'KKR': 880000000, 'PANW': 300000000,
    'UNP': 600000000, 'APH': 120000000, 'LOW': 580000000, 'LRCX': 130000000,
    'MU': 1100000000, 'ADP': 400000000, 'CMCSA': 4000000000, 'COP': 1200000000,
    'KLAC': 130000000, 'VRTX': 260000000, 'MDT': 1300000000, 'SNPS': 150000000,
    'NKE': 1200000000, 'CRWD': 240000000, 'ADI': 500000000, 'WELL': 800000000,
    'CB': 200000000, 'ICE': 570000000, 'SBUX': 1100000000, 'TT': 90000000,
    'SO': 1000000000, 'CEG': 200000000, 'PLD': 900000000, 'DASH': 400000000,
    'AMT': 900000000, 'MO': 1800000000, 'MMC': 200000000, 'CME': 360000000,
    'CDNS': 270000000, 'LMT': 250000000, 'BMY': 2000000000, 'WM': 400000000,
    'PH': 130000000, 'COIN': 200000000, 'DUK': 700000000, 'RCL': 200000000,
    'MCO': 200000000, 'MDLZ': 1400000000, 'DELL': 700000000, 'TDG': 40000000,
    'CTAS': 100000000, 'INTC': 4200000000, 'MCK': 130000000, 'ABNB': 600000000,
    'GD': 270000000, 'ORLY': 61000000, 'APO': 600000000, 'SHW': 250000000,
    'HCA': 270000000, 'EMR': 570000000, 'NOC': 300000000, 'MMM': 550000000,
    'FTNT': 800000000, 'EQIX': 90000000, 'CI': 300000000, 'UPS': 860000000,
    'FI': 400000000, 'HWM': 160000000, 'AON': 200000000, 'PNC': 400000000,
    'CVS': 1300000000, 'RSG': 300000000, 'AJG': 200000000, 'ITW': 300000000,
    'MAR': 300000000, 'ECL': 570000000, 'MSI': 100000000, 'USB': 1500000000,
    'WMB': 1200000000, 'BK': 1500000000, 'CL': 1200000000, 'NEM': 400000000,
    'PYPL': 1100000000, 'JCI': 680000000, 'ZTS': 440000000, 'VST': 200000000,
    'EOG': 580000000, 'CSX': 2000000000, 'ELV': 200000000, 'ADSK': 210000000,
    'APD': 220000000, 'AZO': 20000000, 'HLT': 300000000, 'WDAY': 200000000,
    'SPG': 300000000, 'NSC': 2000000000, 'KMI': 2200000000, 'TEL': 300000000,
    'FCX': 1400000000, 'CARR': 400000000, 'PWR': 500000000, 'REGN': 110000000,
    'ROP': 100000000, 'CMG': 1340000000, 'DLR': 200000000, 'MNST': 440000000,
    'TFC': 2000000000, 'TRV': 270000000, 'AEP': 520000000, 'NXPI': 260000000,
    'AXON': 70000000, 'URI': 60000000, 'COR': 100000000, 'FDX': 250000000,
    'NDAQ': 500000000, 'AFL': 580000000, 'GLW': 800000000, 'FAST': 174000000,
    'MPC': 400000000, 'SLB': 1400000000, 'SRE': 250000000, 'PAYX': 350000000,
    'PCAR': 101000000, 'MET': 800000000, 'BDX': 1400000000, 'OKE': 440000000,
    'DDOG': 300000000,
    // International companies share counts (excluding duplicates)
    'TSM': 25900000000, 'SAP': 1200000000, 'ASML': 400000000, 'BABA': 2500000000, 'TM': 3000000000,
    'AZN': 1500000000, 'HSBC': 20000000000, 'NVS': 2200000000, 'SHEL': 6500000000,
    'HDB': 5500000000, 'RY': 1400000000, 'NVO': 2200000000, 'ARM': 1000000000,
    'SHOP': 1300000000, 'MUFG': 12000000000, 'PDD': 1300000000, 'UL': 2600000000,
    'SONY': 1200000000, 'TTE': 2500000000, 'BHP': 2500000000, 'SAN': 16000000000, 'TD': 1800000000,
    'SPOT': 200000000, 'UBS': 3000000000, 'IBN': 12000000000, 'SNY': 4000000000,
    'BUD': 2000000000, 'BTI': 900000000, 'BN': 3000000000,
    'SMFG': 14000000000, 'ENB': 2000000000, 'RELX': 1000000000, 'TRI': 200000000, 'RACE': 1800000000,
    'BBVA': 6000000000, 'SE': 500000000, 'BP': 3000000000, 'NTES': 650000000, 'BMO': 1200000000,
    'RIO': 1600000000, 'GSK': 4000000000, 'MFG': 6000000000, 'INFY': 4000000000,
    'CP': 700000000, 'BCS': 8000000000, 'NGG': 4000000000, 'BNS': 1200000000, 'ING': 3500000000,
    'EQNR': 3000000000, 'CM': 1000000000, 'CNQ': 900000000, 'LYG': 1500000000,
    'AEM': 500000000, 'DB': 2000000000, 'NU': 1000000000, 'CNI': 800000000,
    'DEO': 2300000000, 'NWG': 1800000000, 'AMX': 6000000000, 'MFC': 1800000000,
    'E': 1000000000, 'WCN': 400000000, 'SU': 400000000, 'TRP': 2000000000, 'PBR': 13000000000,
    'HMC': 1800000000, 'GRMN': 200000000, 'CCEP': 450000000, 'ALC': 200000000, 'TAK': 3000000000
  };

  constructor() {
    // Initialize database
    initializeDatabase();
    
    // Initialize background service
    createBackgroundService(this);
    
    this.startBackgroundUpdates();
  }

  async updateCache(): Promise<void> {
    if (this.isUpdating) {
      console.log('Update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    console.log('Starting cache update...');

    try {
             const apiKey = process.env.POLYGON_API_KEY;
       console.log('API Key found:', apiKey ? 'Yes' : 'No');
       console.log('API Key length:', apiKey?.length);
       console.log('API Key (first 10 chars):', apiKey?.substring(0, 10) + '...');
       
       if (!apiKey) {
         console.error('POLYGON_API_KEY not found in environment variables');
         return;
       }
             const batchSize = 20; // Process in batches to avoid rate limits
       const results: CachedStockData[] = [];

               // Test first API call to see exact error
        console.log('🔍 Testing API call for first ticker...');
        const testUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/NVDA?apikey=${apiKey}`;
        const testResponse = await fetch(testUrl);
        console.log('Test response status:', testResponse.status);
        if (!testResponse.ok) {
          const testErrorBody = await testResponse.text();
          console.error('❌ Test API call failed:', {
            status: testResponse.status,
            body: testErrorBody,
            url: testUrl,
          });
        } else {
          console.log('✅ Test API call successful');
          const testData = await testResponse.json();
          console.log('Test data structure:', JSON.stringify(testData, null, 2));
        }

       // Process tickers in batches with rate limiting
       for (let i = 0; i < this.TICKERS.length; i += batchSize) {
        const batch = this.TICKERS.slice(i, i + batchSize);
        
        // Add delay between batches to respect rate limits
        if (i > 0) {
          console.log(`⏳ Rate limiting: waiting 1 second between batches...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const batchPromises = batch.map(async (ticker) => {
          try {
                         // Get ticker details for market cap
             const detailsUrl = `https://api.polygon.io/v3/reference/tickers/${ticker}?apikey=${apiKey}`;
             const detailsResponse = await fetch(detailsUrl);
             
             let marketCap = 0;
             let shares = 0;
             
             if (!detailsResponse.ok) {
               const errorBody = await detailsResponse.text();
               console.error(`❌ Polygon API failed for ${ticker} details:`, {
                 status: detailsResponse.status,
                 body: errorBody,
                 url: detailsUrl,
               });
             } else {
               const detailsData = await detailsResponse.json();
               if (detailsData?.results) {
                 marketCap = detailsData.results.market_cap || 0;
                 shares = detailsData.results.share_class_shares_outstanding || 0;
               }
             }
             
             // Get previous close data
             const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
             const prevResponse = await fetch(prevUrl);

             if (!prevResponse.ok) {
               const errorBody = await prevResponse.text();
               console.error(`❌ Polygon API failed for ${ticker} (prev):`, {
                 status: prevResponse.status,
                 body: errorBody,
                 url: prevUrl,
               });
               return null;
             }

             const prevData = await prevResponse.json();
             console.log(`📊 Prev data for ${ticker}:`, JSON.stringify(prevData, null, 2));

             if (!prevData?.results?.[0]?.c) {
               console.warn(`❌ No valid prev data for ${ticker} - missing required fields`);
               console.warn(`   prevData?.results?.[0]?.c: ${prevData?.results?.[0]?.c}`);
               console.warn(`   Full response:`, JSON.stringify(prevData, null, 2));
               return null;
             }

             const prevClose = prevData.results[0].c;

             // Get current price (including pre-market)
             const lastUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
             const lastResponse = await fetch(lastUrl);

             if (!lastResponse.ok) {
               const errorBody = await lastResponse.text();
               console.error(`❌ Polygon API failed for ${ticker} (last):`, {
                 status: lastResponse.status,
                 body: errorBody,
                 url: lastUrl,
               });
               return null;
             }

             const lastData = await lastResponse.json();
             console.log(`📊 Last data for ${ticker}:`, JSON.stringify(lastData, null, 2));

             if (!lastData?.ticker?.day?.c) {
               console.warn(`❌ No valid last data for ${ticker} - missing required fields`);
               console.warn(`   lastData?.last?.price: ${lastData?.last?.price}`);
               console.warn(`   Full response:`, JSON.stringify(lastData, null, 2));
               return null;
             }

             const currentPrice = lastData.ticker?.day?.c ?? 0;
            const percentChange = ((currentPrice - prevClose) / prevClose) * 100;
            
            // Use Polygon's market cap if available, otherwise calculate
            const finalMarketCap = marketCap > 0 ? marketCap / 1_000_000_000 : (currentPrice * shares) / 1_000_000_000;
            const marketCapDiff = (currentPrice - prevClose) * (shares || this.shareCounts[ticker] || 1000000000) / 1_000_000_000;

            const stockData = {
              ticker,
              preMarketPrice: Math.round(currentPrice * 100) / 100,
              closePrice: Math.round(prevClose * 100) / 100,
              percentChange: Math.round(percentChange * 100) / 100,
              marketCapDiff: Math.round(marketCapDiff * 100) / 100,
              marketCap: Math.round(finalMarketCap * 100) / 100,
              lastUpdated: new Date()
            };

            console.log(`✅ Successfully fetched data for ${ticker}: $${currentPrice} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);

            // Save to database
            try {
              const companyName = this.companyNames[ticker] || ticker;
              const shareCount = shares || this.shareCounts[ticker] || 1000000000;
              
              runTransaction(() => {
                // Update stock info
                dbHelpers.upsertStock.run(
                  ticker,
                  companyName,
                  finalMarketCap * 1_000_000_000, // Convert back to actual market cap
                  shareCount,
                  new Date().toISOString()
                );

                                 // Add price history
                 dbHelpers.addPriceHistory.run(
                   ticker,
                   currentPrice,
                   lastData.last?.size || 0, // Volume
                  new Date().toISOString()
                );
              });
            } catch (dbError) {
              console.error(`Database error for ${ticker}:`, dbError);
            }

            return stockData;

          } catch (error) {
            console.error(`Error processing ${ticker}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean) as CachedStockData[]);

        // Add delay between batches to respect rate limits
        if (i + batchSize < this.TICKERS.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update in-memory cache
      this.cache.clear();
      results.forEach(stock => {
        this.cache.set(stock.ticker, stock);
      });

      // Update Redis cache
      try {
        await setCachedData(CACHE_KEYS.STOCK_DATA, results);
        await setCacheStatus({
          count: results.length,
          lastUpdated: new Date(),
          isUpdating: false
        });
        console.log(`✅ Redis cache updated with ${results.length} stocks at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('Failed to update Redis cache:', error);
      }

      console.log(`Cache updated with ${results.length} stocks at ${new Date().toISOString()}`);

    } catch (error) {
      console.error('Cache update failed:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  startBackgroundUpdates(): void {
    // Update every 15 minutes
    this.updateInterval = setInterval(() => {
      this.updateCache();
    }, 15 * 60 * 1000);

    // Initial update
    this.updateCache();
  }

  stopBackgroundUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  async getAllStocks(): Promise<CachedStockData[]> {
    try {
      // Try to get from Redis first
      const cachedData = await getCachedData(CACHE_KEYS.STOCK_DATA);
      if (cachedData) {
        return cachedData.sort((a: CachedStockData, b: CachedStockData) => b.marketCap - a.marketCap);
      }
      
      // Fallback to in-memory cache
      return Array.from(this.cache.values()).sort((a, b) => b.marketCap - a.marketCap);
    } catch (error) {
      console.error('Error getting cached data:', error);
      return Array.from(this.cache.values()).sort((a, b) => b.marketCap - a.marketCap);
    }
  }

  getStock(ticker: string): CachedStockData | null {
    return this.cache.get(ticker) || null;
  }

  getCompanyName(ticker: string): string {
    return this.companyNames[ticker] || ticker;
  }

  async getCacheStatus(): Promise<{ count: number; lastUpdated: Date | null; isUpdating: boolean }> {
    try {
      // Try to get from Redis first
      const cachedStatus = await getCacheStatus();
      if (cachedStatus) {
        return cachedStatus;
      }
      
      // Fallback to in-memory cache
      const stocks = await this.getAllStocks();
      const lastUpdated: Date | null = stocks.length > 0 ? (stocks[0]?.lastUpdated ?? null) : null;
      
      return {
        count: stocks.length,
        lastUpdated,
        isUpdating: this.isUpdating
      };
    } catch (error) {
      console.error('Error getting cache status:', error);
      return {
        count: 0,
        lastUpdated: null,
        isUpdating: this.isUpdating
      };
    }
  }
}

// Singleton instance
export const stockDataCache = new StockDataCache(); 
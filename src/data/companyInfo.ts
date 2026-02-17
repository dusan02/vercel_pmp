// Mapping of tickers to their actual domains for logo fetching
// DEPRECATED: Use LogoFetcher service instead.
// export const tickerDomains: Record<string, string> = { ... };

// Color mapping for consistent company colors
export const companyColors: Record<string, string> = {
    'NVDA': '76B900', // NVIDIA green
    'MSFT': '00A4EF', // Microsoft blue
    'AAPL': '000000', // Apple black
    'AMZN': 'FF9900', // Amazon orange
    'GOOGL': '4285F4', // Google blue
    'GOOG': '4285F4', // Google blue
    'META': '1877F2', // Meta blue
    'TSLA': 'CC0000', // Tesla red
    'TSM': '0066CC', // TSMC blue
    'AVGO': 'CC0000', // Broadcom red
    'BRK.A': '7F604F', 'BRK.B': '7F604F', // Berkshire brown
    'JPM': '0066CC', // JPMorgan blue
    'WMT': '007DC3', // Walmart blue
    'LLY': '0066CC', // Lilly blue
    'ORCL': 'F80000', // Oracle red
    'V': '1A1F71', // Visa blue
    'MA': 'EB001B', // Mastercard red
    'NFLX': 'E50914', // Netflix red
    'XOM': '0066CC', // Exxon blue
    'COST': '0066CC', // Costco blue
    'JNJ': '0066CC', // Johnson & Johnson blue
    'HD': 'FF6600', // Home Depot orange
    'PLTR': '000000', // Palantir black
    'PG': '0066CC', // Procter & Gamble blue
    'ABBV': '0066CC', // AbbVie blue
    'CVX': '0066CC', // Chevron blue
    'KO': 'F40009', // Coca-Cola red
    'AMD': 'ED1C24', // AMD red
    'GE': '0066CC', // GE blue
    'CSCO': '0066CC', // Cisco blue
    'TMUS': 'E20074', // T-Mobile pink
    'WFC': 'D71E28', // Wells Fargo red
    'CRM': '1798C2', // Salesforce blue
    'PM': '0066CC', // Philip Morris blue
    'IBM': '0066CC', // IBM blue
    'UNH': '0066CC', // UnitedHealth blue
    'MS': '0066CC', // Morgan Stanley blue
    'GS': '0066CC', // Goldman Sachs blue
    'INTU': '0066CC', // Intuit blue
    'LIN': '0066CC', // Linde blue
    'ABT': '0066CC', // Abbott blue
    'AXP': '0066CC', // American Express blue
    'BX': '0066CC', // Blackstone blue
    'DIS': '0066CC', // Disney blue
    'MCD': 'FFC72C', // McDonald's yellow
    'RTX': '0066CC', // RTX blue
    'NOW': '0066CC', // ServiceNow blue
    'MRK': '0066CC', // Merck blue
    'CAT': 'FF6600', // Caterpillar orange
    'T': '0066CC', // AT&T blue
    'PEP': '0066CC', // PepsiCo blue
    'UBER': '000000', // Uber black
    'BKNG': '0066CC', // Booking blue
    'TMO': '0066CC', // Thermo Fisher blue
    'VZ': '0066CC', // Verizon blue
    'SCHW': '0066CC', // Schwab blue
    'ISRG': '0066CC', // Intuitive Surgical blue
    'QCOM': '0066CC', // Qualcomm blue
    'C': '0066CC', // Citigroup blue
    'TXN': '0066CC', // Texas Instruments blue
    'BA': '0066CC', // Boeing blue
    'BLK': '0066CC', // BlackRock blue
    'ACN': '0066CC', // Accenture blue
    'SPGI': '0066CC', // S&P Global blue
    'AMGN': '0066CC', // Amgen blue
    'ADBE': 'FF0000', // Adobe red
    'BSX': '0066CC', // Boston Scientific blue
    'SYK': '0066CC', // Stryker blue
    'ETN': '0066CC', // Eaton blue
    'AMAT': '0066CC', // Applied Materials blue
    'ANET': '0066CC', // Arista blue
    'NEE': '0066CC', // NextEra Energy blue
    'DHR': '0066CC', // Danaher blue
    'HON': '0066CC', // Honeywell blue
    'TJX': '0066CC', // TJX blue
    'PGR': '0066CC', // Progressive blue
    'GILD': '0066CC', // Gilead blue
    'DE': '0066CC', // Deere blue
    'PFE': '0066CC', // Pfizer blue
    'COF': '0066CC', // Capital One blue
    'KKR': '0066CC', // KKR blue
    'PANW': '0066CC', // Palo Alto Networks blue
    'UNP': '0066CC', // Union Pacific blue
    'APH': '0066CC', // Amphenol blue
    'LOW': '0066CC', // Lowe's blue
    'LRCX': '0066CC', // Lam Research blue
    'MU': '0066CC', // Micron blue
    'ADP': '0066CC', // ADP blue
    'CMCSA': '0066CC', // Comcast blue
    'COP': '0066CC', // ConocoPhillips blue
    'KLAC': '0066CC', // KLA blue
    'MDT': '0066CC', // Medtronic blue
    'SNPS': '0066CC', // Synopsys blue
    'NKE': '000000', // Nike black
    'CRWD': '0066CC', // CrowdStrike blue
    'ADI': '0066CC', // Analog Devices blue
    'WELL': '0066CC', // Welltower blue
    'CB': '0066CC', // Chubb blue
    'ICE': '0066CC', // ICE blue
    'SBUX': '0066CC', // Starbucks blue
    'TT': '0066CC', // Trane blue
    'SO': '0066CC', // Southern Company blue
    'CEG': '0066CC', // Constellation Energy blue
    'PLD': '0066CC', // Prologis blue
    'DASH': '000000', // DoorDash black
    'AMT': '0066CC', // American Tower blue
    'MO': '0066CC', // Altria blue
    'MMC': '0066CC', // Marsh McLennan blue
    'CME': '0066CC', // CME Group blue
    'CDNS': '0066CC', // Cadence blue
    'LMT': '0066CC', // Lockheed Martin blue
    'BMY': '0066CC', // Bristol-Myers Squibb blue
    'WM': '0066CC', // Waste Management blue
    'PH': '0066CC', // Parker blue
    'COIN': '0066CC', // Coinbase blue
    'DUK': '0066CC', // Duke Energy blue
    'RCL': '0066CC', // Royal Caribbean blue
    'MCO': '0066CC', // Moody's blue
    'MDLZ': '0066CC', // Mondelez blue
    'DELL': '0066CC', // Dell blue
    'TDG': '0066CC', // TransDigm blue
    'CTAS': '0066CC', // Cintas blue
    'INTC': '0066CC', // Intel blue
    'MCK': '0066CC', // McKesson blue
    'ABNB': 'FF5A5F', // Airbnb red
    'GD': '0066CC', // General Dynamics blue
    'ORLY': '0066CC', // O'Reilly Auto blue
    'APO': '0066CC', // Apollo blue
    'SHW': '0066CC', // Sherwin-Williams blue
    'HCA': '0066CC', // HCA Healthcare blue
    'EMR': '0066CC', // Emerson blue
    'NOC': '0066CC', // Northrop Grumman blue
    'MMM': '0066CC', // 3M blue
    'FTNT': '0066CC', // Fortinet blue
    'EQIX': '0066CC', // Equinix blue
    'CI': '0066CC', // Cigna blue
    'UPS': '351C15', // UPS brown
    'FI': '0066CC', // Fiserv blue
    'HWM': '0066CC', // Howmet blue
    'AON': '0066CC', // Aon blue
    'PNC': '0066CC', // PNC blue
    'CVS': '0066CC', // CVS blue
    'RSG': '0066CC', // Republic Services blue
    'AJG': '0066CC', // AJG blue
    'ITW': '0066CC', // ITW blue
    'MAR': '0066CC', // Marriott blue
    'ECL': '0066CC', // Ecolab blue
    'MSI': '0066CC', // Motorola Solutions blue
    'USB': '0066CC', // US Bank blue
    'WMB': '0066CC', // Williams blue
    'BK': '0066CC', // BNY Mellon blue
    'CL': '0066CC', // Colgate blue
    'NEM': '0066CC', // Newmont blue
    'PYPL': '0066CC', // PayPal blue
    'JCI': '0066CC', // Johnson Controls blue
    'ZTS': '0066CC', // Zoetis blue
    'VST': '0066CC', // Vistra blue
    'EOG': '0066CC', // EOG Resources blue
    'CSX': '0066CC', // CSX blue
    'ELV': '0066CC', // Elevance Health blue
    'ADSK': '0066CC', // Autodesk blue
    'APD': '0066CC', // Air Products blue
    'AZO': '0066CC', // AutoZone blue
    'HLT': '0066CC', // Hilton blue
    'WDAY': '0066CC', // Workday blue
    'SPG': '0066CC', // Simon Property Group blue
    'NSC': '0066CC', // Norfolk Southern blue
    'KMI': '0066CC', // Kinder Morgan blue
    'TEL': '0066CC', // TE Connectivity blue
    'FCX': '0066CC', // Freeport-McMoRan blue
    'CARR': '0066CC', // Carrier blue
    'PWR': '0066CC', // Quanta Services blue
    'REGN': '0066CC', // Regeneron blue
    'ROP': '0066CC', // Roper Technologies blue
    'CMG': '0066CC', // Chipotle blue
    'DLR': '0066CC', // Digital Realty blue
    'MNST': '0066CC', // Monster Beverage blue
    'TFC': '0066CC', // Truist blue
    'TRV': '0066CC', // Travelers blue
    'AEP': '0066CC', // AEP blue
    'NXPI': '0066CC', // NXP blue
    'AXON': '0066CC', // Axon blue
    'URI': '0066CC', // United Rentals blue
    'COR': '0066CC', // Cencora blue
    'FDX': '660099', // FedEx purple
    'NDAQ': '0066CC', // Nasdaq blue
    'AFL': '0066CC', // Aflac blue
    'GLW': '0066CC', // Corning blue
    'FAST': '0066CC', // Fastenal blue
    'MPC': '0066CC', // Marathon Petroleum blue
    'SLB': '0066CC', // Schlumberger blue
    'SRE': '0066CC', // Sempra blue
    'PAYX': '0066CC', // Paychex blue
    'PCAR': '0066CC', // PACCAR blue
    'MET': '0066CC', // MetLife blue
    'BDX': '0066CC', // BD blue
    'OKE': '0066CC', // Oneok blue
    'DDOG': '0066CC', // Datadog blue
    // International companies
    'SAP': '0066CC', 'ASML': '0066CC', 'BABA': 'FF6600', 'TM': '0066CC',
    'AZN': '0066CC', 'HSBC': '0066CC', 'NVS': '0066CC', 'SHEL': '0066CC',
    'HDB': '0066CC', 'RY': '0066CC', 'NVO': '0066CC', 'ARM': '0066CC',
    'SHOP': '0066CC', 'MUFG': '0066CC', 'PDD': '0066CC', 'UL': '0066CC',
    'SONY': '0066CC', 'TTE': '0066CC', 'BHP': '0066CC', 'SAN': '0066CC', 'TD': '0066CC',
    'SPOT': '1DB954', // Spotify green
    'UBS': '0066CC', 'IBN': '0066CC', 'SNY': '0066CC',
    'BUD': '0066CC', 'BTI': '0066CC', 'BN': '0066CC',
    'SMFG': '0066CC', 'ENB': '0066CC', 'RELX': '0066CC', 'TRI': '0066CC', 'RACE': 'CC0000', // Ferrari red
    'BBVA': '0066CC', 'SE': '0066CC', 'BP': '0066CC', 'NTES': '0066CC', 'BMO': '0066CC',
    'RIO': '0066CC', 'GSK': '0066CC', 'MFG': '0066CC', 'INFY': '0066CC',
    'CP': '0066CC', 'BCS': '0066CC', 'NGG': '0066CC', 'BNS': '0066CC', 'ING': '0066CC',
    'EQNR': '0066CC', 'CM': '0066CC', 'CNQ': '0066CC', 'LYG': '0066CC',
    'TCOM': 'trip.com', 'CTSH': 'cognizant.com', 'WAB': 'wabtec.com',
    'AEM': '0066CC', 'DB': '0066CC', 'NU': '0066CC', 'CNI': '0066CC',
    'DEO': '0066CC', 'NWG': '0066CC', 'AMX': '0066CC', 'MFC': '0066CC',
    'E': '0066CC', 'WCN': '0066CC', 'SU': '0066CC', 'TRP': '0066CC', 'PBR': '0066CC',
    'HMC': '0066CC', 'GRMN': '0066CC', 'CCEP': '0066CC', 'ALC': '0066CC', 'TAK': '0066CC'
};

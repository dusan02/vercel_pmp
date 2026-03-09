// Analyze duplicate tickers in tier lists
console.log("🔍 Analyzing duplicate tickers in tier lists");
console.log("============================================");

// All tickers from the 4 tiers (400 total)
const allTickers = [
  // Premium tier (50) - 1 min updates
  "NVDA", "MSFT", "AAPL", "GOOG", "GOOGL", "AMZN", "META", "AVGO", "BRK.B", "TSLA", "TSM", "JPM", "WMT", "ORCL", "LLY", "V", "MA", "NFLX", "XOM", "COST", "JNJ", "HD", "PLTR", "PG", "ABBV", "BAC", "CVX", "KO", "GE", "AMD", "TMUS", "CSCO", "PM", "WFC", "CRM", "IBM", "MS", "ABT", "GS", "MCD", "INTU", "UNH", "RTX", "DIS", "AXP", "CAT", "MRK", "T", "PEP", "NOW",
  // Standard tier (100) - 3 min updates
  "UBER", "VZ", "TMO", "BKNG", "SCHW", "ISRG", "BLK", "C", "BA", "SPGI", "TXN", "AMGN", "QCOM", "BSX", "ANET", "ADBE", "NEE", "SYK", "AMAT", "PGR", "GILD", "DHR", "TJX", "HON", "DE", "PFE", "BX", "COF", "UNP", "APH", "KKR", "LOW", "LRCX", "ADP", "CMCSA", "VRTX", "KLAC", "COP", "MU", "PANW", "SNPS", "CRWD", "WELL", "NKE", "ADI", "CEG", "ICE", "DASH", "SO", "MO", "CME", "AMT", "SBUX", "LMT", "PLD", "MMC", "CDNS", "DUK", "WM", "PH", "BMY", "MCK", "DELL", "HCA", "SHW", "RCL", "INTC", "NOC", "ORLY", "GD", "MDLZ", "COIN", "EMR", "ABNB", "CVS", "APO", "MMM", "EQIX", "FTNT", "HWM", "ECL", "WMB", "ITW", "FI", "PNC", "MSI", "AJG", "RSG", "UPS", "VST", "BK", "CI", "MAR", "GEV", "APP", "IBKR", "MSTR", "MCO", "CTAS", "TDG", "HOOD", "RBLX", "SCCO", "NET", "BNS", "BCS", "NEM", "USB", "ING", "SNOW", "CL", "EPD", "ZTS", "CSX", "AZO",
  // Extended tier (150) - 5 min updates
  "MRVL", "PYPL", "CRH", "DB", "EOG", "ADSK", "AEM", "APD", "KMI", "ELV", "NSC", "GBTC", "HLT", "ET", "AEP", "SPG", "REGN", "ARES", "DLR", "TEL", "FIG", "WDAY", "PWR", "ROP", "TRV", "NU", "CNI", "AXON", "MNST", "CMG", "CARR", "DEO", "FCX", "COR", "TFC", "URI", "AMX", "NDAQ", "VRT", "GLW", "AFL", "MPLX", "NXPI", "LNG", "SRE", "FLUT", "ALL", "ALNY", "CPNG", "FAST", "LHX", "MFC", "E", "D", "FDX", "O", "MPC", "PCAR", "BDX", "TRP", "PAYX", "CRWV", "GM", "MET", "OKE", "SLB", "CMI", "PSA", "CTVA", "PSX", "WCN", "TEAM", "SU", "GMBXF", "AMP", "CCEP", "KR", "DDOG", "CCI", "EW", "VEEV", "TAK", "CBRE", "XYZ", "TGT", "KDP", "EXC", "HLN", "ROST", "DHI", "GWW", "FERG", "JD", "PEG", "AIG", "CPRT", "ALC", "ZS", "KMB", "HMC", "MSCI", "IDXX", "F", "CVNA", "BKR", "OXY", "FANG", "IMO", "XEL", "EBAY", "GRMN", "AME", "TTD", "KBCSF", "VALE", "WPM", "CRCL", "KVUE", "VLO", "ARGX", "FIS", "RMD", "TTWO", "TCOM", "CSGP", "ETR", "HEI", "EA", "CCL", "ROK", "HSY", "SYY", "VRSK", "ED", "MPWR", "CAH", "ABEV", "B",
  // Extended+ tier (100) - 15 min updates
  "BABA", "ASML", "TM", "AZN", "NVS", "LIN", "NVO", "HSBC", "SHEL", "HDB", "RY", "UL", "SHOP", "ETN", "SONY", "ARM", "TTE", "BHP", "SPOT", "SAN", "TD", "UBS", "MDT", "SNY", "BUD", "CB", "TT", "RIO", "SMFG", "BBVA", "RELX", "SE", "TRI", "PBR", "NTES", "BMO", "RACE", "AON", "GSK", "NWG", "LYG", "EQNR", "CNQ", "ITUB", "ACN", "MUFG", "PDD", "SAP", "JCI", "NGG", "TCEHY", "MELI", "BAM", "ITUB", "EXPGF", "GLCNF", "NPSNY", "GMBXF", "SQ", "PYPL", "ZM", "SNAP", "TWTR", "UBER", "LYFT", "UNH", "ANTM", "HUM", "BIIB", "REGN", "VRTX", "NFLX", "TSLA", "GOOGL", "GOOG", "META", "AMZN", "MSFT", "AAPL", "NVDA", "AVGO", "BRK.B", "JPM", "WMT", "ORCL", "LLY", "V", "MA", "XOM", "COST", "JNJ", "HD", "PLTR", "PG", "ABBV", "BAC", "CVX", "KO"
];

console.log(`\n📊 Raw counts:`);
console.log(`Premium tier: ${allTickers.slice(0, 50).length} tickers`);
console.log(`Standard tier: ${allTickers.slice(50, 150).length} tickers`);
console.log(`Extended tier: ${allTickers.slice(150, 300).length} tickers`);
console.log(`Extended+ tier: ${allTickers.slice(300).length} tickers`);
console.log(`Total raw: ${allTickers.length} tickers`);

// Expected counts from user's original list
console.log(`\n🎯 Expected counts (400 tickers):`);
console.log(`Premium tier: 50 tickers`);
console.log(`Standard tier: 100 tickers`);
console.log(`Extended tier: 150 tickers`);
console.log(`Extended+ tier: 100 tickers`);
console.log(`Total expected: 400 tickers`);

// Find unique tickers
const uniqueTickers = [...new Set(allTickers)];
console.log(`\n🔍 Unique tickers: ${uniqueTickers.length}`);

// Find duplicates
const duplicates = [];
const seen = new Set();

allTickers.forEach((ticker, index) => {
  if (seen.has(ticker)) {
    duplicates.push({
      ticker,
      firstIndex: allTickers.indexOf(ticker),
      duplicateIndex: index,
      tier: index < 50 ? 'premium' : index < 150 ? 'standard' : index < 300 ? 'extended' : 'extendedPlus'
    });
  } else {
    seen.add(ticker);
  }
});

console.log(`\n❌ Found ${duplicates.length} duplicates:`);
duplicates.forEach(dup => {
  console.log(`  - ${dup.ticker}: appears at index ${dup.firstIndex} and ${dup.duplicateIndex} (${dup.tier} tier)`);
});

// Show tier breakdown with unique counts
const premiumUnique = [...new Set(allTickers.slice(0, 50))];
const standardUnique = [...new Set(allTickers.slice(50, 150))];
const extendedUnique = [...new Set(allTickers.slice(150, 300))];
const extendedPlusUnique = [...new Set(allTickers.slice(300))];

console.log(`\n📋 Actual counts by tier:`);
console.log(`Premium: ${premiumUnique.length} unique (vs 50 expected)`);
console.log(`Standard: ${standardUnique.length} unique (vs 100 expected)`);
console.log(`Extended: ${extendedUnique.length} unique (vs 150 expected)`);
console.log(`Extended+: ${extendedPlusUnique.length} unique (vs 100 expected)`);

console.log(`\n🎯 Summary:`);
console.log(`Expected total: 400 tickers`);
console.log(`Actual total: ${uniqueTickers.length} tickers`);
console.log(`Duplicates: ${duplicates.length} tickers`);
console.log(`\n💡 The issue is that we have ${duplicates.length} duplicate ticker(s)!`);

// Simple test for Tiered Update Service (JavaScript version)

console.log("🚀 Testing Tiered Update Service");
console.log("================================");

// Simple Tiered Update Service implementation for testing
class TieredUpdateService {
  constructor(tickers) {
    this.allTickers = tickers;
    this.tiers = [
      {
        tier: "premium",
        frequency: 1,
        maxCompanies: 50,
        description: "Top 50 by market cap - highest priority",
      },
      {
        tier: "standard",
        frequency: 3,
        maxCompanies: 100,
        description: "Companies #51-150 by market cap - medium priority",
      },
      {
        tier: "extended",
        frequency: 5,
        maxCompanies: 150,
        description: "Companies #151-300 by market cap - lower priority",
      },
      {
        tier: "extendedPlus",
        frequency: 15, // Changed from 10 to 15 minutes
        maxCompanies: 60, // Changed from 100 to 60 to match actual unique tickers
        description: "Companies #301-360 by market cap - lowest priority",
      },
    ];
    this.updateSchedules = new Map();
    this.initializeSchedules();
  }

  initializeSchedules() {
    const now = new Date();

    this.tiers.forEach((tier, index) => {
      const startIndex =
        index === 0 ? 0 : index === 1 ? 50 : index === 2 ? 150 : 300;
      const endIndex = Math.min(
        startIndex + tier.maxCompanies,
        this.allTickers.length
      );
      const tierTickers = this.allTickers.slice(startIndex, endIndex);

      const staggerMinutes = index * 0.5;
      const nextUpdate = new Date(
        now.getTime() + (tier.frequency + staggerMinutes) * 60 * 1000
      );

      this.updateSchedules.set(tier.tier, {
        tier: tier.tier,
        tickers: tierTickers,
        nextUpdate,
        frequency: tier.frequency,
      });
    });
  }

  getTickersForUpdate() {
    const now = new Date();
    const tickersToUpdate = [];

    this.updateSchedules.forEach((schedule) => {
      if (now >= schedule.nextUpdate) {
        tickersToUpdate.push(...schedule.tickers);
        schedule.nextUpdate = new Date(
          now.getTime() + schedule.frequency * 60 * 1000
        );
      }
    });

    return tickersToUpdate;
  }

  getUpdateStats() {
    const stats = {
      totalCompanies: this.allTickers.length,
      premiumCount: 0,
      standardCount: 0,
      extendedCount: 0,
      extendedPlusCount: 0,
      nextUpdates: [],
      apiCallsPerHour: 0,
    };

    this.updateSchedules.forEach((schedule) => {
      const count = schedule.tickers.length;

      switch (schedule.tier) {
        case "premium":
          stats.premiumCount = count;
          stats.apiCallsPerHour += count * 60;
          break;
        case "standard":
          stats.standardCount = count;
          stats.apiCallsPerHour += count * 20;
          break;
        case "extended":
          stats.extendedCount = count;
          stats.apiCallsPerHour += count * 12;
          break;
        case "extendedPlus":
          stats.extendedPlusCount = count;
          stats.apiCallsPerHour += count * 4; // Changed from 6 to 4 (15 min = 4 calls/hour)
          break;
      }

      stats.nextUpdates.push({
        tier: schedule.tier,
        time: schedule.nextUpdate.toISOString(),
        count,
      });
    });

    return stats;
  }

  getTickerTier(ticker) {
    const tickerIndex = this.allTickers.indexOf(ticker);
    if (tickerIndex === -1) return null;

    if (tickerIndex < 50) return this.tiers[0];
    if (tickerIndex < 150) return this.tiers[1];
    if (tickerIndex < 300) return this.tiers[2];
    if (tickerIndex < 360) return this.tiers[3];

    return null;
  }

  getTickersByTier() {
    const result = {};

    this.updateSchedules.forEach((schedule) => {
      result[schedule.tier] = schedule.tickers;
    });

    return result;
  }

  getTierTickers(tier) {
    switch (tier) {
      case "premium":
        return [
          "NVDA",
          "MSFT",
          "AAPL",
          "GOOG",
          "GOOGL",
          "AMZN",
          "META",
          "AVGO",
          "BRK.B",
          "TSLA",
          "TSM",
          "JPM",
          "WMT",
          "ORCL",
          "LLY",
          "V",
          "MA",
          "NFLX",
          "XOM",
          "COST",
          "JNJ",
          "HD",
          "PLTR",
          "PG",
          "ABBV",
          "BAC",
          "CVX",
          "KO",
          "GE",
          "AMD",
          "TMUS",
          "CSCO",
          "PM",
          "WFC",
          "CRM",
          "IBM",
          "MS",
          "ABT",
          "GS",
          "MCD",
          "INTU",
          "UNH",
          "RTX",
          "DIS",
          "AXP",
          "CAT",
          "MRK",
          "T",
          "PEP",
          "NOW",
        ];
      case "standard":
        return [
          "UBER",
          "VZ",
          "TMO",
          "BKNG",
          "SCHW",
          "ISRG",
          "BLK",
          "C",
          "BA",
          "SPGI",
          "TXN",
          "AMGN",
          "QCOM",
          "BSX",
          "ANET",
          "ADBE",
          "NEE",
          "SYK",
          "AMAT",
          "PGR",
          "GILD",
          "DHR",
          "TJX",
          "HON",
          "DE",
          "PFE",
          "BX",
          "COF",
          "UNP",
          "APH",
          "KKR",
          "LOW",
          "LRCX",
          "ADP",
          "CMCSA",
          "VRTX",
          "KLAC",
          "COP",
          "MU",
          "PANW",
          "SNPS",
          "CRWD",
          "WELL",
          "NKE",
          "ADI",
          "CEG",
          "ICE",
          "DASH",
          "SO",
          "MO",
          "CME",
          "AMT",
          "SBUX",
          "LMT",
          "PLD",
          "MMC",
          "CDNS",
          "DUK",
          "WM",
          "PH",
          "BMY",
          "MCK",
          "DELL",
          "HCA",
          "SHW",
          "RCL",
          "INTC",
          "NOC",
          "ORLY",
          "GD",
          "MDLZ",
          "COIN",
          "EMR",
          "ABNB",
          "CVS",
          "APO",
          "MMM",
          "EQIX",
          "FTNT",
          "HWM",
          "ECL",
          "WMB",
          "ITW",
          "FI",
          "PNC",
          "MSI",
          "AJG",
          "RSG",
          "UPS",
          "VST",
          "BK",
          "CI",
          "MAR",
          "GEV",
          "APP",
          "IBKR",
          "MSTR",
          "MCO",
          "CTAS",
          "TDG",
          "HOOD",
          "RBLX",
          "SCCO",
          "NET",
          "BNS",
          "BCS",
          "NEM",
          "USB",
          "ING",
          "SNOW",
          "CL",
          "EPD",
          "ZTS",
          "CSX",
          "AZO",
        ];
      case "extended":
        return [
          "MRVL",
          "PYPL",
          "CRH",
          "DB",
          "EOG",
          "ADSK",
          "AEM",
          "APD",
          "KMI",
          "ELV",
          "NSC",
          "GBTC",
          "HLT",
          "ET",
          "AEP",
          "SPG",
          "REGN",
          "ARES",
          "DLR",
          "TEL",
          "FIG",
          "WDAY",
          "PWR",
          "ROP",
          "TRV",
          "NU",
          "CNI",
          "AXON",
          "MNST",
          "CMG",
          "CARR",
          "DEO",
          "FCX",
          "COR",
          "TFC",
          "URI",
          "AMX",
          "NDAQ",
          "VRT",
          "GLW",
          "AFL",
          "MPLX",
          "NXPI",
          "LNG",
          "SRE",
          "FLUT",
          "ALL",
          "ALNY",
          "CPNG",
          "FAST",
          "LHX",
          "MFC",
          "E",
          "D",
          "FDX",
          "O",
          "MPC",
          "PCAR",
          "BDX",
          "TRP",
          "PAYX",
          "CRWV",
          "GM",
          "MET",
          "OKE",
          "SLB",
          "CMI",
          "PSA",
          "CTVA",
          "PSX",
          "WCN",
          "TEAM",
          "SU",
          "GMBXF",
          "AMP",
          "CCEP",
          "KR",
          "DDOG",
          "CCI",
          "EW",
          "VEEV",
          "TAK",
          "CBRE",
          "XYZ",
          "TGT",
          "KDP",
          "EXC",
          "HLN",
          "ROST",
          "DHI",
          "GWW",
          "FERG",
          "JD",
          "PEG",
          "AIG",
          "CPRT",
          "ALC",
          "ZS",
          "KMB",
          "HMC",
          "MSCI",
          "IDXX",
          "F",
          "CVNA",
          "BKR",
          "OXY",
          "FANG",
          "IMO",
          "XEL",
          "EBAY",
          "GRMN",
          "AME",
          "TTD",
          "KBCSF",
          "VALE",
          "WPM",
          "CRCL",
          "KVUE",
          "VLO",
          "ARGX",
          "FIS",
          "RMD",
          "TTWO",
          "TCOM",
          "CSGP",
          "ETR",
          "HEI",
          "EA",
          "CCL",
          "ROK",
          "HSY",
          "SYY",
          "VRSK",
          "ED",
          "MPWR",
          "CAH",
          "ABEV",
          "B",
        ];
      case "extendedPlus":
        return [
          "BABA",
          "ASML",
          "TM",
          "AZN",
          "NVS",
          "LIN",
          "NVO",
          "HSBC",
          "SHEL",
          "HDB",
          "RY",
          "UL",
          "SHOP",
          "ETN",
          "SONY",
          "ARM",
          "TTE",
          "BHP",
          "SPOT",
          "SAN",
          "TD",
          "UBS",
          "MDT",
          "SNY",
          "BUD",
          "CB",
          "TT",
          "RIO",
          "SMFG",
          "BBVA",
          "RELX",
          "SE",
          "TRI",
          "PBR",
          "NTES",
          "BMO",
          "RACE",
          "AON",
          "GSK",
          "NWG",
          "LYG",
          "EQNR",
          "CNQ",
          "ITUB",
          "ACN",
          "MUFG",
          "PDD",
          "SAP",
          "JCI",
          "NGG",
          "TCEHY",
          "MELI",
          "BAM",
          "EXPGF",
          "GLCNF",
          "NPSNY",
        ];
      default:
        return [];
    }
  }
}

function createTieredUpdateService(tickers) {
  return new TieredUpdateService(tickers);
}

// Create service with all tickers
const allTickers = [
  // Premium tier (50) - 1 min updates
  "NVDA",
  "MSFT",
  "AAPL",
  "GOOG",
  "GOOGL",
  "AMZN",
  "META",
  "AVGO",
  "BRK.B",
  "TSLA",
  "TSM",
  "JPM",
  "WMT",
  "ORCL",
  "LLY",
  "V",
  "MA",
  "NFLX",
  "XOM",
  "COST",
  "JNJ",
  "HD",
  "PLTR",
  "PG",
  "ABBV",
  "BAC",
  "CVX",
  "KO",
  "GE",
  "AMD",
  "TMUS",
  "CSCO",
  "PM",
  "WFC",
  "CRM",
  "IBM",
  "MS",
  "ABT",
  "GS",
  "MCD",
  "INTU",
  "UNH",
  "RTX",
  "DIS",
  "AXP",
  "CAT",
  "MRK",
  "T",
  "PEP",
  "NOW",
  // Standard tier (100) - 3 min updates
  "UBER",
  "VZ",
  "TMO",
  "BKNG",
  "SCHW",
  "ISRG",
  "BLK",
  "C",
  "BA",
  "SPGI",
  "TXN",
  "AMGN",
  "QCOM",
  "BSX",
  "ANET",
  "ADBE",
  "NEE",
  "SYK",
  "AMAT",
  "PGR",
  "GILD",
  "DHR",
  "TJX",
  "HON",
  "DE",
  "PFE",
  "BX",
  "COF",
  "UNP",
  "APH",
  "KKR",
  "LOW",
  "LRCX",
  "ADP",
  "CMCSA",
  "VRTX",
  "KLAC",
  "COP",
  "MU",
  "PANW",
  "SNPS",
  "CRWD",
  "WELL",
  "NKE",
  "ADI",
  "CEG",
  "ICE",
  "DASH",
  "SO",
  "MO",
  "CME",
  "AMT",
  "SBUX",
  "LMT",
  "PLD",
  "MMC",
  "CDNS",
  "DUK",
  "WM",
  "PH",
  "BMY",
  "MCK",
  "DELL",
  "HCA",
  "SHW",
  "RCL",
  "INTC",
  "NOC",
  "ORLY",
  "GD",
  "MDLZ",
  "COIN",
  "EMR",
  "ABNB",
  "CVS",
  "APO",
  "MMM",
  "EQIX",
  "FTNT",
  "HWM",
  "ECL",
  "WMB",
  "ITW",
  "FI",
  "PNC",
  "MSI",
  "AJG",
  "RSG",
  "UPS",
  "VST",
  "BK",
  "CI",
  "MAR",
  "GEV",
  "APP",
  "IBKR",
  "MSTR",
  "MCO",
  "CTAS",
  "TDG",
  "HOOD",
  "RBLX",
  "SCCO",
  "NET",
  "BNS",
  "BCS",
  "NEM",
  "USB",
  "ING",
  "SNOW",
  "CL",
  "EPD",
  "ZTS",
  "CSX",
  "AZO",
  // Extended tier (150) - 5 min updates
  "MRVL",
  "PYPL",
  "CRH",
  "DB",
  "EOG",
  "ADSK",
  "AEM",
  "APD",
  "KMI",
  "ELV",
  "NSC",
  "GBTC",
  "HLT",
  "ET",
  "AEP",
  "SPG",
  "REGN",
  "ARES",
  "DLR",
  "TEL",
  "FIG",
  "WDAY",
  "PWR",
  "ROP",
  "TRV",
  "NU",
  "CNI",
  "AXON",
  "MNST",
  "CMG",
  "CARR",
  "DEO",
  "FCX",
  "COR",
  "TFC",
  "URI",
  "AMX",
  "NDAQ",
  "VRT",
  "GLW",
  "AFL",
  "MPLX",
  "NXPI",
  "LNG",
  "SRE",
  "FLUT",
  "ALL",
  "ALNY",
  "CPNG",
  "FAST",
  "LHX",
  "MFC",
  "E",
  "D",
  "FDX",
  "O",
  "MPC",
  "PCAR",
  "BDX",
  "TRP",
  "PAYX",
  "CRWV",
  "GM",
  "MET",
  "OKE",
  "SLB",
  "CMI",
  "PSA",
  "CTVA",
  "PSX",
  "WCN",
  "TEAM",
  "SU",
  "GMBXF",
  "AMP",
  "CCEP",
  "KR",
  "DDOG",
  "CCI",
  "EW",
  "VEEV",
  "TAK",
  "CBRE",
  "XYZ",
  "TGT",
  "KDP",
  "EXC",
  "HLN",
  "ROST",
  "DHI",
  "GWW",
  "FERG",
  "JD",
  "PEG",
  "AIG",
  "CPRT",
  "ALC",
  "ZS",
  "KMB",
  "HMC",
  "MSCI",
  "IDXX",
  "F",
  "CVNA",
  "BKR",
  "OXY",
  "FANG",
  "IMO",
  "XEL",
  "EBAY",
  "GRMN",
  "AME",
  "TTD",
  "KBCSF",
  "VALE",
  "WPM",
  "CRCL",
  "KVUE",
  "VLO",
  "ARGX",
  "FIS",
  "RMD",
  "TTWO",
  "TCOM",
  "CSGP",
  "ETR",
  "HEI",
  "EA",
  "CCL",
  "ROK",
  "HSY",
  "SYY",
  "VRSK",
  "ED",
  "MPWR",
  "CAH",
  "ABEV",
  "B",
  // Extended+ tier (60) - 15 min updates
    "BABA", "ASML", "TM", "AZN", "NVS", "LIN", "NVO", "HSBC", "SHEL", "HDB", "RY", "UL", "SHOP", "ETN", "SONY", "ARM", "TTE", "BHP", "SPOT", "SAN", "TD", "UBS", "MDT", "SNY", "BUD", "CB", "TT", "RIO", "SMFG", "BBVA", "RELX", "SE", "TRI", "PBR", "NTES", "BMO", "RACE", "AON", "GSK", "NWG", "LYG", "EQNR", "CNQ", "ITUB", "ACN", "MUFG", "PDD", "SAP", "JCI", "NGG", "TCEHY", "MELI", "BAM", "EXPGF", "GLCNF", "NPSNY", "GMBXF"
];

try {
  const service = createTieredUpdateService(allTickers);

  // Display statistics
  const stats = service.getUpdateStats();
  console.log("\n📊 Update Statistics:");
  console.log(`Total Companies: ${stats.totalCompanies}`);
  console.log(`Premium Tier (1 min): ${stats.premiumCount} companies`);
  console.log(`Standard Tier (3 min): ${stats.standardCount} companies`);
  console.log(`Extended Tier (5 min): ${stats.extendedCount} companies`);
  console.log(`Extended+ Tier (15 min): ${stats.extendedPlusCount} companies`);
  console.log(`API Calls per Hour: ${stats.apiCallsPerHour.toLocaleString()}`);

  // Display tier information
  console.log("\n🎯 Tier Information:");
  console.log("Premium (1 min): Top 50 by market cap - highest priority");
  console.log(
    "Standard (3 min): Companies #51-150 by market cap - medium priority"
  );
  console.log(
    "Extended (5 min): Companies #151-300 by market cap - lower priority"
  );
  console.log(
    "Extended+ (15 min): Companies #301-360 by market cap - lowest priority"
  );

  // Show next update times
  console.log("\n⏰ Next Update Times:");
  stats.nextUpdates.forEach((update) => {
    const time = new Date(update.time).toLocaleTimeString();
    console.log(`${update.tier}: ${update.count} companies at ${time}`);
  });

  // Example tier lookups
  console.log("\n🔍 Example Tier Lookups:");
  const examples = ["NVDA", "UBER", "MRVL", "BABA", "UNKNOWN"];
  examples.forEach((ticker) => {
    const tier = service.getTickerTier(ticker);
    if (tier) {
      console.log(
        `${ticker}: ${tier.tier} tier (${tier.frequency} min updates)`
      );
    } else {
      console.log(`${ticker}: Not found in any tier`);
    }
  });

  // Show tier tickers
  console.log("\n📋 Tier Tickers Preview:");
  const tiers = service.getTickersByTier();
  Object.entries(tiers).forEach(([tierName, tickers]) => {
    console.log(
      `${tierName}: ${tickers.slice(0, 5).join(", ")}... (${
        tickers.length
      } total)`
    );
  });

  console.log("\n✅ Test completed successfully!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
}

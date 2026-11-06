/**
 * Expand Ticker Universe Script
 *
 * Scales the PMP database from ~999 tickers to ~2,000+ tickers:
 * 1. Curated Core Index/Sector/Commodity/Crypto ETFs (assetType='ETF', tier=2, inHeatmap=false)
 * 2. Curated Leveraged & Inverse ETFs for Trading Ideas & Dip-Buying (assetType='LEVERAGED_ETF', tier=2, inHeatmap=false)
 * 3. Top N (default 1,000) liquid US Mid-Cap & Small-Cap common stocks on NYSE/NASDAQ
 *    ranked by daily dollar volume, enriched with Polygon Reference v3 metadata (sector, industry, shares, marketCap).
 *
 * Usage:
 *   npx tsx scripts/expand-ticker-universe.ts [--add=1000] [--dry-run]
 */

import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis';
import { addToUniverse, setPrevClose } from '../src/lib/redis/operations';
import { getDateET, createETDate } from '../src/lib/utils/dateET';
import { getTradingDay, getLastTradingDay } from '../src/lib/utils/timeUtils';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface CuratedEtfSpec {
  symbol: string;
  name: string;
  industry: string;
  assetType: 'ETF' | 'LEVERAGED_ETF';
}

const CURATED_ETFS: CuratedEtfSpec[] = [
  // Broad Index ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', industry: 'Broad Market Index ETF', assetType: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', industry: 'Broad Market Index ETF', assetType: 'ETF' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', industry: 'Small-Cap Index ETF', assetType: 'ETF' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', industry: 'Broad Market Index ETF', assetType: 'ETF' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', industry: 'Broad Market Index ETF', assetType: 'ETF' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', industry: 'Broad Market Index ETF', assetType: 'ETF' },
  { symbol: 'MDY', name: 'SPDR S&P MidCap 400 ETF Trust', industry: 'Mid-Cap Index ETF', assetType: 'ETF' },
  { symbol: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', industry: 'Broad Market Index ETF', assetType: 'ETF' },

  // Sector & Thematic ETFs
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', industry: 'Semiconductor ETF', assetType: 'ETF' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', industry: 'Semiconductor ETF', assetType: 'ETF' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', industry: 'Sector ETF - Technology', assetType: 'ETF' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', industry: 'Sector ETF - Financials', assetType: 'ETF' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', industry: 'Sector ETF - Healthcare', assetType: 'ETF' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', industry: 'Sector ETF - Energy', assetType: 'ETF' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', industry: 'Sector ETF - Industrials', assetType: 'ETF' },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', industry: 'Sector ETF - Consumer Cyclical', assetType: 'ETF' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', industry: 'Sector ETF - Consumer Defensive', assetType: 'ETF' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', industry: 'Sector ETF - Utilities', assetType: 'ETF' },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', industry: 'Sector ETF - Basic Materials', assetType: 'ETF' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', industry: 'Sector ETF - Real Estate', assetType: 'ETF' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', industry: 'Sector ETF - Communication', assetType: 'ETF' },
  { symbol: 'IGV', name: 'iShares Expanded Tech-Software Sector ETF', industry: 'Software ETF', assetType: 'ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', industry: 'Thematic Innovation ETF', assetType: 'ETF' },
  { symbol: 'XBI', name: 'SPDR S&P Biotech ETF', industry: 'Biotech ETF', assetType: 'ETF' },
  { symbol: 'IBB', name: 'iShares Biotechnology ETF', industry: 'Biotech ETF', assetType: 'ETF' },
  { symbol: 'KRE', name: 'SPDR S&P Regional Banking ETF', industry: 'Regional Banks ETF', assetType: 'ETF' },
  { symbol: 'XOP', name: 'SPDR S&P Oil & Gas Exploration & Production', industry: 'Oil & Gas ETF', assetType: 'ETF' },
  { symbol: 'OIH', name: 'VanEck Oil Services ETF', industry: 'Oil Services ETF', assetType: 'ETF' },
  { symbol: 'ITA', name: 'iShares U.S. Aerospace & Defense ETF', industry: 'Aerospace & Defense ETF', assetType: 'ETF' },
  { symbol: 'XHB', name: 'SPDR S&P Homebuilders ETF', industry: 'Homebuilders ETF', assetType: 'ETF' },
  { symbol: 'ITB', name: 'iShares U.S. Home Construction ETF', industry: 'Homebuilders ETF', assetType: 'ETF' },
  { symbol: 'JETS', name: 'U.S. Global Jets ETF', industry: 'Airlines ETF', assetType: 'ETF' },
  { symbol: 'TAN', name: 'Invesco Solar ETF', industry: 'Clean Energy ETF', assetType: 'ETF' },
  { symbol: 'URA', name: 'Global X Uranium ETF', industry: 'Uranium & Nuclear ETF', assetType: 'ETF' },

  // Commodities, Bonds, International & Crypto ETFs
  { symbol: 'GLD', name: 'SPDR Gold Shares', industry: 'Precious Metals ETF', assetType: 'ETF' },
  { symbol: 'SLV', name: 'iShares Silver Trust', industry: 'Precious Metals ETF', assetType: 'ETF' },
  { symbol: 'GDX', name: 'VanEck Gold Miners ETF', industry: 'Gold Miners ETF', assetType: 'ETF' },
  { symbol: 'GDXJ', name: 'VanEck Junior Gold Miners ETF', industry: 'Gold Miners ETF', assetType: 'ETF' },
  { symbol: 'USO', name: 'United States Oil Fund LP', industry: 'Commodity ETF', assetType: 'ETF' },
  { symbol: 'UNG', name: 'United States Natural Gas Fund LP', industry: 'Commodity ETF', assetType: 'ETF' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', industry: 'Treasury Bond ETF', assetType: 'ETF' },
  { symbol: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', industry: 'Treasury Bond ETF', assetType: 'ETF' },
  { symbol: 'HYG', name: 'iShares iBoxx $ High Yield Corporate Bond ETF', industry: 'Corporate Bond ETF', assetType: 'ETF' },
  { symbol: 'LQD', name: 'iShares iBoxx $ Investment Grade Corporate Bond', industry: 'Corporate Bond ETF', assetType: 'ETF' },
  { symbol: 'IBIT', name: 'iShares Bitcoin Trust ETF', industry: 'Crypto Spot ETF', assetType: 'ETF' },
  { symbol: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', industry: 'Crypto Spot ETF', assetType: 'ETF' },
  { symbol: 'ETHA', name: 'iShares Ethereum Trust ETF', industry: 'Crypto Spot ETF', assetType: 'ETF' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', industry: 'International Equity ETF', assetType: 'ETF' },
  { symbol: 'FXI', name: 'iShares China Large-Cap ETF', industry: 'International Equity ETF', assetType: 'ETF' },
  { symbol: 'KWEB', name: 'KraneShares CSI China Internet ETF', industry: 'International Equity ETF', assetType: 'ETF' },
  { symbol: 'EWZ', name: 'iShares MSCI Brazil ETF', industry: 'International Equity ETF', assetType: 'ETF' },
  { symbol: 'EWJ', name: 'iShares MSCI Japan ETF', industry: 'International Equity ETF', assetType: 'ETF' },

  // Leveraged & Inverse Index / Sector ETFs
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ (3x Long Nasdaq-100)', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ (3x Inverse)', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'QLD', name: 'ProShares Ultra QQQ (2x Long Nasdaq-100)', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'QID', name: 'ProShares UltraShort QQQ (2x Inverse)', industry: 'Leveraged 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SOXS', name: 'Direxion Daily Semiconductor Bear 3X Shares', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'USD', name: 'ProShares Ultra Semiconductors (2x Long)', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'UPRO', name: 'ProShares UltraPro S&P500 (3x Long)', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SPXU', name: 'ProShares UltraPro Short S&P500 (3x Inverse)', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SSO', name: 'ProShares Ultra S&P500 (2x Long)', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'SDS', name: 'ProShares UltraShort S&P500 (2x Inverse)', industry: 'Leveraged 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TNA', name: 'Direxion Daily Small Cap Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TZA', name: 'Direxion Daily Small Cap Bear 3X Shares', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'UWM', name: 'ProShares Ultra Russell2000 (2x Long)', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TMF', name: 'Direxion Daily 20+ Year Treasury Bull 3X', industry: 'Leveraged 3x Bond ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TMV', name: 'Direxion Daily 20+ Year Treasury Bear 3X', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'LABU', name: 'Direxion Daily S&P Biotech Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'LABD', name: 'Direxion Daily S&P Biotech Bear 3X Shares', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TECL', name: 'Direxion Daily Technology Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TECS', name: 'Direxion Daily Technology Bear 3X Shares', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'FAS', name: 'Direxion Daily Financial Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'FAZ', name: 'Direxion Daily Financial Bear 3X Shares', industry: 'Leveraged 3x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'DPST', name: 'Direxion Daily Regional Banks Bull 3X Shares', industry: 'Leveraged 3x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'ERX', name: 'Direxion Daily Energy Bull 2X Shares', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'ERY', name: 'Direxion Daily Energy Bear 2X Shares', industry: 'Leveraged 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'NUGT', name: 'Direxion Daily Gold Miners Index Bull 2X', industry: 'Leveraged 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'DUST', name: 'Direxion Daily Gold Miners Index Bear 2X', industry: 'Leveraged 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'BOIL', name: 'ProShares Ultra Bloomberg Natural Gas (2x)', industry: 'Leveraged 2x Commodity ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'KOLD', name: 'ProShares UltraShort Bloomberg Natural Gas', industry: 'Leveraged 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'BITX', name: '2x Bitcoin Strategy ETF', industry: 'Leveraged 2x Crypto ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'BITU', name: 'ProShares Ultra Bitcoin ETF (2x)', industry: 'Leveraged 2x Crypto ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'FNGU', name: 'MicroSectors FANG+ Index 3X Leveraged ETN', industry: 'Leveraged 3x Bull ETN', assetType: 'LEVERAGED_ETF' },
  { symbol: 'FNGD', name: 'MicroSectors FANG+ Index -3X Inverse ETN', industry: 'Leveraged 3x Bear ETN', assetType: 'LEVERAGED_ETF' },

  // Single-Stock Leveraged ETFs (2x Bull/Bear)
  { symbol: 'NVDL', name: 'GraniteShares 2x Long NVDA Daily ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'NVDU', name: 'Direxion Daily NVDA Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'NVD', name: 'GraniteShares 2x Short NVDA Daily ETF', industry: 'Single-Stock 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TSLL', name: 'Direxion Daily TSLA Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'TSLQ', name: 'Tradr 2X Short TSLA Daily ETF', industry: 'Single-Stock 2x Bear ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'MSFL', name: 'GraniteShares 2x Long MSFT Daily ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'MSFU', name: 'Direxion Daily MSFT Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'AMZU', name: 'Direxion Daily AMZN Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'AAPU', name: 'Direxion Daily AAPL Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'METU', name: 'Direxion Daily META Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'GGLL', name: 'Direxion Daily GOOGL Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'NFLU', name: 'T-Rex 2X Long NFLX Daily Target ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'KMLI', name: 'KraneShares 2x Long MELI Daily ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'CONL', name: 'GraniteShares 2x Long COIN Daily ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'MSTU', name: 'T-Rex 2X Long MSTR Daily Target ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'MSTX', name: 'Defiance Daily Target 2X Long MSTR ETF', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
  { symbol: 'PLTU', name: 'Direxion Daily PLTR Bull 2X Shares', industry: 'Single-Stock 2x Bull ETF', assetType: 'LEVERAGED_ETF' },
];

/**
 * Map SIC code & SIC description to the 11 standard PMP sectors.
 */
function mapSicToSectorAndIndustry(sicCodeRaw?: string | number | null, sicDescRaw?: string | null): {
  sector: string;
  industry: string;
} {
  const sic = Number(sicCodeRaw || 0);
  const desc = (sicDescRaw || '').trim();
  const upper = desc.toUpperCase();

  let industry = desc
    ? desc
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 65)
    : 'General Industry';

  // Technology
  if (
    (sic >= 3570 && sic <= 3579) ||
    (sic >= 3660 && sic <= 3679) ||
    (sic >= 7370 && sic <= 7379) ||
    upper.includes('COMPUTER') ||
    upper.includes('SEMICONDUCTOR') ||
    upper.includes('SOFTWARE') ||
    upper.includes('PREPACKAGED SOFTWARE') ||
    upper.includes('DATA PROCESSING') ||
    upper.includes('ELECTRONIC COMPONENTS')
  ) {
    return { sector: 'Technology', industry };
  }

  // Healthcare
  if (
    (sic >= 2830 && sic <= 2836) ||
    (sic >= 3840 && sic <= 3851) ||
    (sic >= 8000 && sic <= 8099) ||
    upper.includes('PHARMACEUTICAL') ||
    upper.includes('BIOLOGICAL') ||
    upper.includes('SURGICAL') ||
    upper.includes('MEDICAL') ||
    upper.includes('HOSPITAL') ||
    upper.includes('HEALTH') ||
    upper.includes('DIAGNOSTIC')
  ) {
    return { sector: 'Healthcare', industry };
  }

  // Communication Services
  if (
    (sic >= 4810 && sic <= 4899) ||
    (sic >= 7810 && sic <= 7841) ||
    (sic >= 7900 && sic <= 7999) ||
    (sic >= 2710 && sic <= 2741) ||
    upper.includes('TELECOMMUNICATION') ||
    upper.includes('BROADCASTING') ||
    upper.includes('CABLE') ||
    upper.includes('MOTION PICTURE') ||
    upper.includes('AMUSEMENT')
  ) {
    return { sector: 'Communication Services', industry };
  }

  // Real Estate
  if (
    sic === 6798 ||
    (sic >= 6500 && sic <= 6553) ||
    upper.includes('REAL ESTATE') ||
    upper.includes('REIT')
  ) {
    return { sector: 'Real Estate', industry };
  }

  // Financial Services
  if (
    (sic >= 6000 && sic <= 6411) ||
    (sic >= 6710 && sic <= 6799) ||
    upper.includes('BANK') ||
    upper.includes('INSURANCE') ||
    upper.includes('SECURITY BROKER') ||
    upper.includes('INVESTMENT') ||
    upper.includes('FINANCE') ||
    upper.includes('CREDIT')
  ) {
    return { sector: 'Financial Services', industry };
  }

  // Energy
  if (
    (sic >= 1300 && sic <= 1389) ||
    (sic >= 2910 && sic <= 2999) ||
    (sic >= 4610 && sic <= 4619) ||
    (sic >= 4920 && sic <= 4925) ||
    upper.includes('CRUDE PETROLEUM') ||
    upper.includes('NATURAL GAS') ||
    upper.includes('OIL & GAS') ||
    upper.includes('PETROLEUM REFINING') ||
    upper.includes('COAL')
  ) {
    return { sector: 'Energy', industry };
  }

  // Utilities
  if (
    (sic >= 4900 && sic <= 4999) ||
    upper.includes('ELECTRIC SERVICES') ||
    upper.includes('WATER SUPPLY') ||
    upper.includes('GAS & OTHER SERVICES') ||
    upper.includes('SANITARY SERVICES') ||
    upper.includes('UTILITY')
  ) {
    return { sector: 'Utilities', industry };
  }

  // Basic Materials
  if (
    (sic >= 1000 && sic <= 1299) ||
    (sic >= 1400 && sic <= 1499) ||
    (sic >= 2600 && sic <= 2699) ||
    (sic >= 2800 && sic <= 2829) ||
    (sic >= 2850 && sic <= 2899) ||
    (sic >= 3300 && sic <= 3399) ||
    upper.includes('MINING') ||
    upper.includes('GOLD AND SILVER') ||
    upper.includes('STEEL') ||
    upper.includes('CHEMICAL') ||
    upper.includes('ALUMINUM') ||
    upper.includes('COPPER') ||
    upper.includes('PAPER')
  ) {
    return { sector: 'Basic Materials', industry };
  }

  // Consumer Defensive
  if (
    (sic >= 100 && sic <= 999) ||
    (sic >= 2000 && sic <= 2199) ||
    sic === 2840 ||
    sic === 2841 ||
    sic === 2842 ||
    sic === 2844 ||
    (sic >= 5140 && sic <= 5149) ||
    (sic >= 5400 && sic <= 5499) ||
    sic === 5912 ||
    upper.includes('FOOD') ||
    upper.includes('BEVERAGE') ||
    upper.includes('GROCERY') ||
    upper.includes('TOBACCO') ||
    upper.includes('SOAP') ||
    upper.includes('PERFUMES')
  ) {
    return { sector: 'Consumer Defensive', industry };
  }

  // Consumer Cyclical
  if (
    (sic >= 2200 && sic <= 2599) ||
    (sic >= 3010 && sic <= 3199) ||
    (sic >= 3710 && sic <= 3716) ||
    (sic >= 5200 && sic <= 5399) ||
    (sic >= 5500 && sic <= 5999) ||
    (sic >= 7000 && sic <= 7299) ||
    (sic >= 1520 && sic <= 1531) ||
    upper.includes('RETAIL') ||
    upper.includes('AUTO') ||
    upper.includes('MOTOR VEHICLE') ||
    upper.includes('RESTAURANT') ||
    upper.includes('APPAREL') ||
    upper.includes('HOTEL') ||
    upper.includes('OPERATIVE BUILDERS')
  ) {
    return { sector: 'Consumer Cyclical', industry };
  }

  // Default to Industrials (Manufacturing, Aerospace, Machinery, Transportation, Business Services)
  return { sector: 'Industrials', industry };
}

interface GroupedBar {
  T: string; // Ticker
  c: number; // Close
  o: number; // Open
  h: number; // High
  l: number; // Low
  v: number; // Volume
}

async function fetchGroupedDaily(dateStr: string): Promise<Map<string, GroupedBar>> {
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    throw new Error(`Grouped daily HTTP ${res.status} for ${dateStr}`);
  }
  const data = await res.json();
  const map = new Map<string, GroupedBar>();
  if (Array.isArray(data?.results)) {
    for (const row of data.results) {
      if (row && typeof row.T === 'string' && typeof row.c === 'number' && row.c > 0) {
        map.set(row.T, row as GroupedBar);
      }
    }
  }
  return map;
}

/**
 * Find the 2 most recent completed trading days that have Polygon Grouped Daily bars (>3000 symbols).
 */
async function getRecentGroupedDays(): Promise<{
  latestDate: string;
  prevDate: string;
  latestMap: Map<string, GroupedBar>;
  prevMap: Map<string, GroupedBar>;
}> {
  const found: Array<{ date: string; map: Map<string, GroupedBar> }> = [];
  const cursor = new Date();

  for (let i = 0; i < 12 && found.length < 2; i++) {
    const ymd = getDateET(cursor);
    try {
      const map = await fetchGroupedDaily(ymd);
      if (map.size > 3000) {
        console.log(`✅ Loaded Polygon grouped daily for ${ymd} (${map.size} symbols)`);
        found.push({ date: ymd, map });
      }
    } catch {
      // Skip non-trading or not-yet-finalized day
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  if (found.length < 2) {
    throw new Error('Could not find 2 recent trading days from Polygon Grouped Daily API');
  }

  return {
    latestDate: found[0]!.date,
    prevDate: found[1]!.date,
    latestMap: found[0]!.map,
    prevMap: found[1]!.map,
  };
}

interface RefTickerItem {
  ticker: string;
  name: string;
  primary_exchange?: string;
  type?: string;
}

/**
 * Fetch all active common stocks (type=CS) on NYSE (XNYS) and NASDAQ (XNAS).
 */
async function fetchAllActiveCommonStocks(): Promise<Map<string, RefTickerItem>> {
  const result = new Map<string, RefTickerItem>();
  let nextUrl: string | null =
    `https://api.polygon.io/v3/reference/tickers?market=stocks&type=CS&active=true&limit=1000&apiKey=${POLYGON_API_KEY}`;

  let page = 0;
  while (nextUrl && page < 15) {
    page++;
    const res = await fetch(nextUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) break;
    const data: any = await res.json();
    if (Array.isArray(data?.results)) {
      for (const item of data.results) {
        const sym = String(item.ticker || '').trim();
        const exch = String(item.primary_exchange || '');
        if (/^[A-Z]{1,5}$/.test(sym) && (exch === 'XNAS' || exch === 'XNYS' || exch === 'ARCX' || exch === 'BATS')) {
          result.set(sym, item);
        }
      }
    }
    if (data?.next_url) {
      nextUrl = `${data.next_url}&apiKey=${POLYGON_API_KEY}`;
    } else {
      nextUrl = null;
    }
  }

  console.log(`✅ Loaded ${result.size} active US common stocks from Polygon Reference v3 (${page} pages)`);
  return result;
}

interface PolygonTickerDetails {
  ticker: string;
  name?: string;
  market_cap?: number;
  weighted_shares_outstanding?: number;
  share_class_shares_outstanding?: number;
  sic_code?: string;
  sic_description?: string;
  description?: string;
  homepage_url?: string;
  total_employees?: number;
  address?: {
    city?: string;
    state?: string;
  };
}

async function fetchTickerDetail(symbol: string): Promise<PolygonTickerDetails | null> {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.results || null;
  } catch {
    return null;
  }
}

async function main() {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const addArg = args.find((a) => a.startsWith('--add='));
  const targetAddCount = addArg ? Math.max(10, parseInt(addArg.split('=')[1] || '1000', 10)) : 1000;

  console.log(`🚀 Starting PMP Ticker Universe Expansion (targetAddStocks=${targetAddCount}, dryRun=${dryRun})...`);

  // 1. Load existing DB tickers
  const existingRows = await prisma.ticker.findMany({
    select: { symbol: true, tier: true, inHeatmap: true, assetType: true },
  });
  const existingSet = new Set(existingRows.map((r) => r.symbol));
  console.log(`📊 Current DB tickers: ${existingSet.size}`);

  // 2. Load recent 2 days of Polygon Grouped Daily bars
  const { latestDate, prevDate, latestMap, prevMap } = await getRecentGroupedDays();
  console.log(`📅 Using grouped bars: latest=${latestDate}, prev=${prevDate}`);

  const todayET = getDateET(new Date());
  const calendarDateET = createETDate(todayET);
  const prevTradingDayET = getLastTradingDay(getTradingDay(calendarDateET));

  // 3. Process Curated ETFs & Leveraged ETFs first
  console.log(`\n📦 Processing ${CURATED_ETFS.length} Curated ETFs & Leveraged ETFs...`);
  let etfsAddedOrUpdated = 0;
  const newlyAddedSymbols: string[] = [];

  for (const etf of CURATED_ETFS) {
    const latestBar = latestMap.get(etf.symbol);
    const prevBar = prevMap.get(etf.symbol);
    if (!latestBar || latestBar.c <= 0) {
      console.warn(`⚠️ Skipping ETF ${etf.symbol}: no latest Polygon price bar`);
      continue;
    }

    const detail = await fetchTickerDetail(etf.symbol);
    const price = latestBar.c;
    const prevClose = prevBar?.c && prevBar.c > 0 ? prevBar.c : latestBar.o || price;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    const rawShares =
      detail?.share_class_shares_outstanding ||
      detail?.weighted_shares_outstanding ||
      Math.max(10_000_000, Math.round(((latestBar.v || 1_000_000) * 15)));

    const rawMcapBillions = detail?.market_cap
      ? detail.market_cap / 1e9
      : (price * rawShares) / 1e9;

    const lastMarketCap = Math.max(0.5, Number(rawMcapBillions.toFixed(4)));
    const lastMarketCapDiff = Number(((lastMarketCap * changePct) / 100).toFixed(4));

    if (!dryRun) {
      const isExisting = existingSet.has(etf.symbol);
      await prisma.ticker.upsert({
        where: { symbol: etf.symbol },
        create: {
          symbol: etf.symbol,
          name: detail?.name || etf.name,
          sector: 'ETF',
          industry: etf.industry,
          sharesOutstanding: rawShares,
          lastPrice: price,
          lastPriceUpdated: new Date(),
          latestPrevClose: prevClose,
          latestPrevCloseDate: prevTradingDayET,
          lastChangePct: Number(changePct.toFixed(4)),
          lastMarketCap,
          lastMarketCapDiff,
          lastVolume: latestBar.v,
          avgVolume20d: latestBar.v,
          description: detail?.description || `${etf.name} (${etf.industry})`,
          websiteUrl: detail?.homepage_url || null,
          tier: 2,
          inHeatmap: false,
          assetType: etf.assetType,
        },
        update: {
          name: detail?.name || etf.name,
          sector: 'ETF',
          industry: etf.industry,
          assetType: etf.assetType,
          inHeatmap: isExisting ? undefined : false,
          tier: 2,
          lastPrice: price,
          lastPriceUpdated: new Date(),
          latestPrevClose: prevClose,
          latestPrevCloseDate: prevTradingDayET,
          lastChangePct: Number(changePct.toFixed(4)),
          lastMarketCap,
          lastMarketCapDiff,
          lastVolume: latestBar.v,
        },
      });

      await prisma.dailyRef.upsert({
        where: { symbol_date: { symbol: etf.symbol, date: calendarDateET } },
        create: {
          symbol: etf.symbol,
          date: calendarDateET,
          previousClose: prevClose,
          regularClose: price,
          todayOpen: latestBar.o,
        },
        update: {
          previousClose: prevClose,
          regularClose: price,
        },
      });

      await prisma.analysisCache.upsert({
        where: { symbol: etf.symbol },
        create: { symbol: etf.symbol },
        update: {},
      });
    }

    existingSet.add(etf.symbol);
    newlyAddedSymbols.push(etf.symbol);
    etfsAddedOrUpdated++;
  }
  console.log(`✅ Curated ETFs processed: ${etfsAddedOrUpdated}`);

  // 4. Discover & rank liquid US Mid/Small-Cap Common Stocks not yet in DB
  const activeCommonStocks = await fetchAllActiveCommonStocks();
  const candidates: Array<{
    symbol: string;
    name: string;
    latestBar: GroupedBar;
    prevBar?: GroupedBar;
    dollarVolume: number;
  }> = [];

  for (const [symbol, refItem] of activeCommonStocks.entries()) {
    if (existingSet.has(symbol)) continue;
    const latestBar = latestMap.get(symbol);
    if (!latestBar) continue;

    // Require price >= $3 and daily dollar volume >= $3M for clean liquid coverage
    const dollarVolume = latestBar.c * (latestBar.v || 0);
    if (latestBar.c < 3 || dollarVolume < 3_000_000) continue;

    candidates.push({
      symbol,
      name: refItem.name || symbol,
      latestBar,
      prevBar: prevMap.get(symbol),
      dollarVolume,
    });
  }

  candidates.sort((a, b) => b.dollarVolume - a.dollarVolume);
  const poolSize = Math.min(candidates.length, Math.ceil(targetAddCount * 1.25));
  const candidatePool = candidates.slice(0, poolSize);
  console.log(
    `\n🔍 Found ${candidates.length} liquid new US stocks (price >= $3, daily Vol >= $3M). Enriching top ${candidatePool.length} candidates...`
  );

  let stocksAdded = 0;
  const CONCURRENCY = 15;

  for (let i = 0; i < candidatePool.length && stocksAdded < targetAddCount; i += CONCURRENCY) {
    const remainingNeeded = targetAddCount - stocksAdded;
    const batch = candidatePool.slice(i, i + Math.min(CONCURRENCY, remainingNeeded + 5));

    const details = await Promise.all(batch.map((c) => fetchTickerDetail(c.symbol)));

    for (let j = 0; j < batch.length && stocksAdded < targetAddCount; j++) {
      const cand = batch[j]!;
      const detail = details[j];
      if (!detail) continue;

      const price = cand.latestBar.c;
      const prevClose = cand.prevBar?.c && cand.prevBar.c > 0 ? cand.prevBar.c : cand.latestBar.o || price;
      const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      const shares =
        detail.weighted_shares_outstanding ||
        detail.share_class_shares_outstanding ||
        (detail.market_cap && price > 0 ? Math.round(detail.market_cap / price) : 0);

      const mcapBillions = detail.market_cap
        ? detail.market_cap / 1e9
        : shares > 0
        ? (price * shares) / 1e9
        : 0;

      // Require >= $250M market cap
      if (mcapBillions < 0.25 || shares <= 0) {
        continue;
      }

      const { sector, industry } = mapSicToSectorAndIndustry(detail.sic_code, detail.sic_description);
      const lastMarketCap = Number(mcapBillions.toFixed(4));
      const lastMarketCapDiff = Number(((lastMarketCap * changePct) / 100).toFixed(4));

      // Tier assignment:
      // >= $10B -> Tier 2 (5m)
      // $1.5B - $10B -> Tier 3 (15m)
      // < $1.5B -> Tier 4 (30m)
      const tier = lastMarketCap >= 10 ? 2 : lastMarketCap >= 1.5 ? 3 : 4;
      const hq =
        detail.address?.city && detail.address?.state
          ? `${detail.address.city}, ${detail.address.state}`
          : null;

      if (!dryRun) {
        await prisma.ticker.upsert({
          where: { symbol: cand.symbol },
          create: {
            symbol: cand.symbol,
            name: detail.name || cand.name,
            sector,
            industry,
            sharesOutstanding: shares,
            lastPrice: price,
            lastPriceUpdated: new Date(),
            latestPrevClose: prevClose,
            latestPrevCloseDate: prevTradingDayET,
            lastChangePct: Number(changePct.toFixed(4)),
            lastMarketCap,
            lastMarketCapDiff,
            lastVolume: cand.latestBar.v,
            avgVolume20d: cand.latestBar.v,
            description: detail.description || null,
            employees: detail.total_employees ? Math.round(detail.total_employees) : null,
            websiteUrl: detail.homepage_url || null,
            headquarters: hq,
            tier,
            inHeatmap: false,
            assetType: 'STOCK',
          },
          update: {
            name: detail.name || cand.name,
            sector,
            industry,
            sharesOutstanding: shares,
            lastPrice: price,
            lastPriceUpdated: new Date(),
            latestPrevClose: prevClose,
            latestPrevCloseDate: prevTradingDayET,
            lastChangePct: Number(changePct.toFixed(4)),
            lastMarketCap,
            lastMarketCapDiff,
            lastVolume: cand.latestBar.v,
            tier,
            inHeatmap: false,
            assetType: 'STOCK',
          },
        });

        await prisma.dailyRef.upsert({
          where: { symbol_date: { symbol: cand.symbol, date: calendarDateET } },
          create: {
            symbol: cand.symbol,
            date: calendarDateET,
            previousClose: prevClose,
            regularClose: price,
            todayOpen: cand.latestBar.o,
          },
          update: {
            previousClose: prevClose,
            regularClose: price,
          },
        });

        await prisma.analysisCache.upsert({
          where: { symbol: cand.symbol },
          create: { symbol: cand.symbol },
          update: {},
        });
      }

      newlyAddedSymbols.push(cand.symbol);
      stocksAdded++;
    }

    if (stocksAdded % 100 === 0 || stocksAdded === targetAddCount) {
      console.log(`   ... added ${stocksAdded}/${targetAddCount} new liquid stocks`);
    }
  }

  // 5. Sync Redis universe:sp500 & flush screener cache
  if (!dryRun && redisClient && redisClient.isOpen) {
    const allDbTickers = await prisma.ticker.findMany({ select: { symbol: true, latestPrevClose: true } });
    const allSymbols = allDbTickers.map((t) => t.symbol);
    await redisClient.del('universe:sp500');
    await addToUniverse('sp500', allSymbols);
    console.log(`✅ Updated Redis universe:sp500 with ${allSymbols.length} total tickers`);

    // Seed prevClose in Redis for todayET
    let seededPrev = 0;
    for (const t of allDbTickers) {
      if (t.latestPrevClose && t.latestPrevClose > 0) {
        await setPrevClose(todayET, t.symbol, t.latestPrevClose).catch(() => {});
        seededPrev++;
      }
    }
    console.log(`✅ Seeded Redis prevClose for ${seededPrev} tickers (${todayET})`);
  }

  // Final summary breakdown
  const summary = await prisma.$queryRawUnsafe<
    Array<{ tier: number; assetType: string; inHeatmap: number; cnt: number }>
  >(
    `SELECT tier, assetType, inHeatmap, COUNT(*) as cnt FROM Ticker GROUP BY tier, assetType, inHeatmap ORDER BY tier ASC, assetType ASC`
  );
  console.log('\n📊 Final Ticker Universe Breakdown:');
  console.table(summary);
}

main()
  .catch((err) => {
    console.error('❌ Error in expand-ticker-universe:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit().catch(() => {});
    }
  });

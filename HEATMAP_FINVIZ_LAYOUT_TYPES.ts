/**
 * TypeScript interfaces pre Finviz-style treemap layout
 * 
 * Tieto typy popisujú štruktúru dát, ktorú očakáva calculateFinvizTreemap()
 */

/**
 * Základné údaje pre každú firmu
 */
export interface StockData {
  ticker: string;           // "AAPL"
  marketCap: number;        // 3500.2 (v miliardách USD)
  sector: string;           // "Technology"
  industry: string;         // "Consumer Electronics"
  changePercent: number;    // 2.45 (percentuálna zmena, môže byť negatívna)
}

/**
 * Zoskupené dáta podľa industry
 */
export interface IndustryGroup {
  industry: string;
  totalMarketCap: number;
  stocks: StockData[];
}

/**
 * Zoskupené dáta podľa sektora
 */
export interface SectorGroup {
  sector: string;
  totalMarketCap: number;
  industries: IndustryGroup[];
  stocks: StockData[];  // Všetky stocks v sektore (flat list)
}

/**
 * Layout node pre jednotlivú akciu
 */
export interface StockNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: StockData;
  sector: string;
  industry: string;
}

/**
 * Layout pre industry blok (mini-treemap)
 */
export interface IndustryLayout {
  industry: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  stocks: StockNode[];
}

/**
 * Layout pre sektor (kontajner)
 */
export interface SectorLayout {
  sector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  industries: IndustryLayout[];
  stocks: StockNode[];  // Všetky nodes v sektore (flat list)
}

/**
 * Výstup z calculateFinvizTreemap()
 */
export interface FinvizTreemapResult {
  sectors: SectorLayout[];
  allNodes: StockNode[];  // Všetky nodes (flat list pre renderovanie)
}

/**
 * Možnosti pre layout algoritmus
 */
export interface FinvizLayoutOpts {
  containerWidth?: number;      // Šírka kontajnera (default: 1200)
  containerHeight?: number;     // Výška kontajnera (default: 800)
  sectorGap?: number;           // Medzera medzi sektormi (default: 2)
  industryGap?: number;         // Medzera medzi industry blokmi (default: 2)
  minIndustryWidth?: number;    // Minimálna šírka industry bloku (default: 80)
  minIndustryHeight?: number;   // Minimálna výška industry bloku (default: 60)
  targetAspect?: number;        // Cieľový pomer strán pre squarify (default: 1.7)
}

/**
 * Príklad vstupných dát
 */
export const EXAMPLE_INPUT: SectorGroup[] = [
  {
    sector: "Technology",
    totalMarketCap: 15000.5,
    industries: [
      {
        industry: "Semiconductors",
        totalMarketCap: 5000.0,
        stocks: [
          { ticker: "NVDA", marketCap: 4702.87, sector: "Technology", industry: "Semiconductors", changePercent: -2.96 },
          { ticker: "AMD", marketCap: 297.13, sector: "Technology", industry: "Semiconductors", changePercent: 1.23 }
        ]
      },
      {
        industry: "Consumer Electronics",
        totalMarketCap: 4067.19,
        stocks: [
          { ticker: "AAPL", marketCap: 4067.19, sector: "Technology", industry: "Consumer Electronics", changePercent: 2.16 }
        ]
      }
    ],
    stocks: [
      { ticker: "NVDA", marketCap: 4702.87, sector: "Technology", industry: "Semiconductors", changePercent: -2.96 },
      { ticker: "AAPL", marketCap: 4067.19, sector: "Technology", industry: "Consumer Electronics", changePercent: 2.16 },
      { ticker: "AMD", marketCap: 297.13, sector: "Technology", industry: "Semiconductors", changePercent: 1.23 }
    ]
  },
  {
    sector: "Financial Services",
    totalMarketCap: 3000.0,
    industries: [
      {
        industry: "Banks",
        totalMarketCap: 859.2,
        stocks: [
          { ticker: "JPM", marketCap: 859.2, sector: "Financial Services", industry: "Banks", changePercent: -0.40 }
        ]
      }
    ],
    stocks: [
      { ticker: "JPM", marketCap: 859.2, sector: "Financial Services", industry: "Banks", changePercent: -0.40 }
    ]
  }
];


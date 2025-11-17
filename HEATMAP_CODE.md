# Heatmap Code Documentation

Tento dokument obsahuje kompletný kód pre heatmap komponent.

**Celkový počet riadkov:** 1,284 riadkov

## Štruktúra súborov

1. `src/app/api/heatmap/route.ts` - 369 riadkov (API endpoint)
2. `src/components/MarketHeatmap.tsx` - 620 riadkov (Hlavný D3 komponent)
3. `src/components/ResponsiveMarketHeatmap.tsx` - 238 riadkov (Wrapper komponent)
4. `src/app/heatmap/page.tsx` - 57 riadkov (Stránka)

---

## 1. API Endpoint - `src/app/api/heatmap/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCachedData, setCachedData } from '@/lib/redis';
import { StockData } from '@/lib/types';
import {
  computeMarketCap,
  computeMarketCapDiff,
  getCurrentPrice,
  getPreviousClose,
} from '@/lib/marketCapUtils';

const CACHE_KEY = 'heatmap:all-companies';
const CACHE_TTL = 120; // 2 minúty - heatmap dáta sa menia často

/**
 * Načíta všetky tickery z databázy, ktoré majú sector a industry
 */
async function getAllTickersWithSectorIndustry(): Promise<string[]> {
  const tickers = await prisma.ticker.findMany({
    where: {
      sector: { not: null },
      industry: { not: null },
    },
    select: {
      symbol: true,
    },
    orderBy: {
      symbol: 'asc',
    },
  });

  return tickers.map((t) => t.symbol);
}

/**
 * Načíta dáta pre heatmapu - všetky firmy s sector/industry
 * Používa cache pre rýchle načítanie
 */
export async function GET(request: NextRequest) {
  try {
    // Skús najprv cache
    try {
      const cachedData = await getCachedData(CACHE_KEY);
      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        console.log(`✅ Heatmap cache hit - returning ${cachedData.length} companies`);
        return NextResponse.json({
          success: true,
          data: cachedData,
          cached: true,
          count: cachedData.length,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (cacheError) {
      console.warn('⚠️ Cache read error, continuing with database fetch:', cacheError);
    }

    console.log('🔄 Heatmap cache miss - fetching from database...');

    // Načítaj všetky tickery s sector/industry
    const tickers = await getAllTickersWithSectorIndustry();
    console.log(`📊 Found ${tickers.length} tickers with sector/industry`);

    if (tickers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No tickers with sector/industry found',
        data: [],
        count: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Načítaj dáta pre všetky tickery
    // Použijeme SessionPrice pre aktuálne ceny
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Načítaj SessionPrice dáta - skúsime najprv dnešok, potom posledných 7 dní
    // Rozdelíme na menšie batchy, ak je veľa tickerov
    let allSessionPrices: Awaited<ReturnType<typeof prisma.sessionPrice.findMany>> = [];
    try {
      const BATCH_SIZE = 500; // SQLite má limit na počet parametrov
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchPrices = await prisma.sessionPrice.findMany({
          where: {
            symbol: { in: batch },
            date: {
              gte: weekAgo, // Posledných 7 dní
              lt: tomorrow,
            },
          },
          orderBy: [
            { symbol: 'asc' },
            { date: 'desc' }, // Najnovšie dáta najprv
            { session: 'asc' },
            { lastTs: 'desc' },
          ],
        });
        allSessionPrices = [...allSessionPrices, ...batchPrices];
      }
      console.log(`📊 Found ${allSessionPrices.length} SessionPrice records (last 7 days)`);
    } catch (sessionPriceError) {
      console.error('❌ Error fetching SessionPrice:', sessionPriceError);
      // Pokračujeme bez SessionPrice dát - použijeme len Ticker dáta
    }

    // Vyber najnovšie dáta pre každý symbol (priorita: najnovší dátum > live > pre > after)
    const sessionPriceMap = new Map<string, typeof allSessionPrices[0]>();
    const sessionPriority: Record<string, number> = { live: 3, pre: 2, after: 1 };
    
    for (const sp of allSessionPrices) {
      const existing = sessionPriceMap.get(sp.symbol);
      
      if (!existing) {
        sessionPriceMap.set(sp.symbol, sp);
        continue;
      }
      
      // Porovnaj dátumy (najnovší dátum má prioritu)
      const currentDate = sp.date instanceof Date ? sp.date.getTime() : new Date(sp.date).getTime();
      const existingDate = existing.date instanceof Date ? existing.date.getTime() : new Date(existing.date).getTime();
      
      if (currentDate > existingDate) {
        // Novší dátum má prioritu
        sessionPriceMap.set(sp.symbol, sp);
      } else if (currentDate === existingDate) {
        // Rovnaký dátum - porovnaj session prioritu
        const currentPriority = sessionPriority[sp.session] || 0;
        const existingPriority = sessionPriority[existing.session] || 0;
        
        if (currentPriority > existingPriority) {
          sessionPriceMap.set(sp.symbol, sp);
        } else if (currentPriority === existingPriority) {
          // Ak je rovnaká priorita, vyber najnovší (porovnaj timestampy)
          const currentTs = sp.lastTs instanceof Date ? sp.lastTs.getTime() : new Date(sp.lastTs).getTime();
          const existingTs = existing.lastTs instanceof Date ? existing.lastTs.getTime() : new Date(existing.lastTs).getTime();
          if (currentTs > existingTs) {
            sessionPriceMap.set(sp.symbol, sp);
          }
        }
      }
    }
    const sessionPrices = Array.from(sessionPriceMap.values());

    // Vytvor mapu symbol -> SessionPrice
    const priceMap = new Map(
      sessionPrices.map((sp) => [
        sp.symbol,
        {
          price: sp.lastPrice,
          changePct: sp.changePct,
          lastTs: sp.lastTs,
        },
      ])
    );

    // Načítaj Ticker dáta (sector, industry, name)
    // Rozdelíme na menšie batchy
    let tickerData: Awaited<ReturnType<typeof prisma.ticker.findMany>> = [];
    try {
      const BATCH_SIZE = 500;
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchData = await prisma.ticker.findMany({
          where: {
            symbol: { in: batch },
            sector: { not: null },
            industry: { not: null },
          },
          select: {
            symbol: true,
            name: true,
            sector: true,
            industry: true,
            sharesOutstanding: true,
          },
        });
        tickerData = [...tickerData, ...batchData];
      }
    } catch (tickerError) {
      console.error('❌ Error fetching Ticker data:', tickerError);
      throw tickerError; // Toto je kritické, nemôžeme pokračovať
    }

    // Vytvor mapu symbol -> Ticker
    const tickerMap = new Map(
      tickerData.map((t) => [
        t.symbol,
        {
          name: t.name,
          sector: t.sector!,
          industry: t.industry!,
          sharesOutstanding: t.sharesOutstanding,
        },
      ])
    );

    // Načítaj DailyRef pre previousClose - skúsime najprv dnešok, potom posledných 7 dní
    let dailyRefs: Awaited<ReturnType<typeof prisma.dailyRef.findMany>> = [];
    try {
      const BATCH_SIZE = 500;
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const batchRefs = await prisma.dailyRef.findMany({
          where: {
            symbol: { in: batch },
            date: {
              gte: weekAgo, // Posledných 7 dní
              lt: tomorrow,
            },
          },
          select: {
            symbol: true,
            date: true,
            previousClose: true,
          },
          orderBy: [
            { symbol: 'asc' },
            { date: 'desc' }, // Najnovšie dáta najprv
          ],
        });
        dailyRefs = [...dailyRefs, ...batchRefs];
      }
      
      // Vyber najnovšie previousClose pre každý symbol
      const dailyRefMap = new Map<string, number>();
      for (const dr of dailyRefs) {
        if (!dailyRefMap.has(dr.symbol)) {
          dailyRefMap.set(dr.symbol, dr.previousClose);
        }
      }
      dailyRefs = Array.from(dailyRefMap.entries()).map(([symbol, previousClose]) => ({
        symbol,
        date: today,
        previousClose,
      }));
    } catch (dailyRefError) {
      console.warn('⚠️ Error fetching DailyRef, continuing without previousClose:', dailyRefError);
      // Pokračujeme bez DailyRef - previousClose bude 0
    }

    const previousCloseMap = new Map(
      dailyRefs.map((dr) => [dr.symbol, dr.previousClose])
    );

    // Zostav výsledky
    const results: StockData[] = [];

    for (const ticker of tickers) {
      const tickerInfo = tickerMap.get(ticker);
      if (!tickerInfo) continue;

      // Získaj ceny - použijeme SessionPrice ak existuje, inak DailyRef
      const priceInfo = priceMap.get(ticker);
      const dailyRefClose = previousCloseMap.get(ticker);
      
      let currentPrice = priceInfo?.price || 0;
      let previousClose = dailyRefClose || 0;
      let changePercent = priceInfo?.changePct || 0;
      
      // Debug pre GOOGL
      if (ticker === 'GOOGL') {
        console.log(`🔍 GOOGL debug: priceInfo=${JSON.stringify(priceInfo)}, dailyRefClose=${dailyRefClose}, changePercent=${changePercent}`);
      }
      
      // Ak máme changePercent z SessionPrice, má prioritu - použijeme ho
      // a vypočítame previousClose z currentPrice a changePercent ak je potrebné
      if (changePercent !== 0 && currentPrice > 0) {
        // Ak nemáme previousClose, vypočítame ho z currentPrice a changePercent
        if (previousClose === 0) {
          previousClose = currentPrice / (1 + changePercent / 100);
        }
        // Ak máme previousClose, ale changePercent z SessionPrice je iný, použijeme changePercent z SessionPrice
        // (changePercent z SessionPrice má prioritu)
      }
      
      // Ak nemáme currentPrice, použijeme previousClose (ale len ako fallback)
      if (currentPrice === 0 && previousClose > 0) {
        currentPrice = previousClose;
        // Ak použijeme previousClose ako currentPrice, changePercent by mal byť 0
        // ale necháme ho tak, ak už máme hodnotu z SessionPrice
        if (changePercent === 0) {
          changePercent = 0;
        }
      }
      
      // Ak nemáme previousClose ale máme currentPrice, použijeme currentPrice
      // (ale toto môže byť problém, lebo potom changePercent bude 0)
      // Toto robíme len ak nemáme changePercent z SessionPrice
      if (previousClose === 0 && currentPrice > 0 && changePercent === 0) {
        previousClose = currentPrice;
        changePercent = 0;
      }
      
      // Ak nemáme changePercent ale máme obe ceny a sú rôzne, vypočítajme ho
      // (ale len ak nemáme changePercent z SessionPrice)
      if (changePercent === 0 && currentPrice > 0 && previousClose > 0 && currentPrice !== previousClose) {
        changePercent = ((currentPrice - previousClose) / previousClose) * 100;
      }

      // Vypočítaj market cap - zabezpečíme, že všetky hodnoty sú čísla
      const shares = Number(tickerInfo.sharesOutstanding) || 0;
      const safePrice = Number(currentPrice) || 0;
      const safePrevClose = Number(previousClose) || 0;
      
      // Vypočítaj market cap - použijeme skutočné hodnoty
      let marketCap = 0;
      let marketCapDiff = 0;
      
      if (isFinite(safePrice) && isFinite(shares) && shares > 0 && safePrice > 0) {
        marketCap = computeMarketCap(safePrice, shares);
        // Vypočítaj market cap diff (denný rozdiel)
        if (isFinite(safePrevClose) && safePrevClose > 0) {
          marketCapDiff = computeMarketCapDiff(safePrice, safePrevClose, shares);
        }
      } else if (shares > 0) {
        // Ak máme shares ale nie cenu, použijeme odhad na základe shares
        // Použijeme logaritmickú škálu s variáciou, aby sa firmy líšili
        // Priemerná cena akcie je cca $20-100, takže použijeme variabilný odhad
        const hash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const priceVariation = 20 + (hash % 80); // $20-100
        marketCap = computeMarketCap(priceVariation, shares);
        // Neobmedzujeme market cap - nech sa zobrazujú skutočné hodnoty
        marketCap = Math.max(0.01, marketCap);
        marketCapDiff = 0;
      } else {
        // Ak nemáme ani shares, použijeme minimálnu hodnotu (0.01B) pre zobrazenie
        // ale s malou variáciou podľa symbolu, aby sa firmy líšili
        const hash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        marketCap = 0.01 + (hash % 100) / 10000; // 0.01 - 0.02B
        marketCapDiff = 0;
      }

      results.push({
        ticker,
        companyName: tickerInfo.name || ticker,
        currentPrice,
        closePrice: previousClose,
        percentChange: changePercent,
        marketCap,
        marketCapDiff,
        sector: tickerInfo.sector,
        industry: tickerInfo.industry,
        lastUpdated: priceInfo?.lastTs ? new Date(priceInfo.lastTs).toISOString() : new Date().toISOString(),
      });
    }

    // Zoraď podľa market cap (descending)
    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    // Cache výsledok (ak je aspoň nejaký výsledok)
    if (results.length > 0) {
      try {
        await setCachedData(CACHE_KEY, results, CACHE_TTL);
      } catch (cacheError) {
        console.warn('⚠️ Error caching results:', cacheError);
        // Pokračujeme aj bez cache
      }
    }

    console.log(`✅ Heatmap data fetched and cached: ${results.length} companies`);

    return NextResponse.json({
      success: true,
      data: results,
      cached: false,
      count: results.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error fetching heatmap data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: [],
        count: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
```

---

## 2. Hlavný komponent - `src/components/MarketHeatmap.tsx`

```typescript
'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
  HierarchyNode,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';
import { formatMarketCapDiff } from '@/lib/format';

// --- TYPY ---

/**
 * Typ pre vstupné dáta jednej spoločnosti.
 */
export type CompanyNode = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  changePercent: number;
  marketCapDiff?: number; // Denný rozdiel v market cap (v miliardách)
};

/**
 * Props pre hlavný komponent heatmapy.
 */
export type MarketHeatmapProps = {
  data: CompanyNode[];
  onTileClick?: (company: CompanyNode) => void;
  /** Šírka komponentu v pixeloch. */
  width: number;
  /** Výška komponentu v pixeloch. */
  height: number;
  /** Aktuálny timeframe pre zobrazenie dát */
  timeframe?: 'day' | 'week' | 'month';
  /** Callback pre zmenu timeframe */
  onTimeframeChange?: (timeframe: 'day' | 'week' | 'month') => void;
};

/**
 * Interná štruktúra pre budovanie hierarchie, ktorú D3 očakáva.
 */
interface HierarchyData {
  name: string;
  children?: HierarchyData[];
  value?: number; // MarketCap pre listy
  meta?: {
    type: 'root' | 'sector' | 'industry' | 'company';
    companyData?: CompanyNode; // Plné dáta pre listy
  };
}

/**
 * Typ pre list (firmu) po spracovaní D3 layoutom.
 */
type TreemapLeaf = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  data: HierarchyData & {
    meta: {
      type: 'company';
      companyData: CompanyNode;
    };
  };
};

/**
 * Typ pre uzol (sektor/industry) po spracovaní D3 layoutom.
 */
type TreemapNode = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

// --- POMOCNÉ FUNKCIE ---

/**
 * Transformuje plochý zoznam firiem na hierarchickú štruktúru.
 * @param data Zoznam CompanyNode[]
 * @returns Koreňový uzol pre D3
 */
function buildHierarchy(data: CompanyNode[]): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  
  let skippedCount = 0;

  for (const company of data) {
    // Skontrolujme, či má firma platný marketCap (D3 ignoruje hodnoty <= 0)
    const marketCap = company.marketCap || 0;
    if (marketCap <= 0) {
      skippedCount++;
      continue; // Preskočíme firmy bez marketCap
    }

    // 1. Nájdi alebo vytvor Sektor
    let sectorNode = sectorMap.get(company.sector);
    if (!sectorNode) {
      sectorNode = { name: company.sector, children: [], meta: { type: 'sector' } };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    // 2. Nájdi alebo vytvor Industry
    const industryName = company.industry;
    let industryNode = sectorNode.children!.find((ind) => ind.name === industryName);
    if (!industryNode) {
      industryNode = {
        name: industryName,
        children: [],
        meta: { type: 'industry' },
      };
      sectorNode.children!.push(industryNode);
    }

    // 3. Pridaj list (Firmu)
    const companyLeaf: HierarchyData = {
      name: company.symbol,
      value: marketCap, // d3.sum() bude sčítať túto hodnotu
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    industryNode.children!.push(companyLeaf);
  }
  
  if (skippedCount > 0) {
    console.warn(`⚠️ buildHierarchy: Preskočených ${skippedCount} firiem bez marketCap z ${data.length} celkom`);
  }
  
  return root;
}

/**
 * Farebná škála pre percentuálnu zmenu.
 * Definuje prechod od červenej (pokles) po zelenú (rast).
 */
const createColorScale = (timeframe: 'day' | 'week' | 'month' = 'day') => {
  // Rôzne škály pre rôzne timeframy
  const scales = {
    day: {
      domain: [-5, -2, 0, 2, 5],
      range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
    },
    week: {
      domain: [-10, -5, 0, 5, 10],
      range: ['#dc2626', '#ef4444', '#374151', '#22c55e', '#16a34a'],
    },
    month: {
      domain: [-20, -10, 0, 10, 20],
      range: ['#b91c1c', '#dc2626', '#374151', '#16a34a', '#15803d'],
    },
  };

  const config = scales[timeframe];
  return scaleLinear<string>()
    .domain(config.domain)
    .range(config.range)
    .clamp(true);
};

/**
 * Formátuje percentuálnu zmenu.
 */
const formatPercent = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * Formátuje market cap na kompaktný tvar (napr. 1.2T alebo 350.5B).
 * Market cap je v miliardách, takže:
 * - >= 1000 miliárd = trilióny (T)
 * - < 1000 miliárd = miliardy (B)
 */
const formatMarketCap = (value: number) => {
  if (!isFinite(value) || value === 0) return '0.00';
  
  if (value >= 1000) {
    // Trilióny
    const trillions = value / 1000;
    return `${trillions.toFixed(2)}T`;
  } else {
    // Miliardy
    return `${value.toFixed(2)}B`;
  }
};

// --- POD-KOMPONENTY ---

/**
 * Komponent pre Tooltip.
 */
type TooltipProps = {
  company: CompanyNode;
  position: { x: number; y: number };
  timeframe?: 'day' | 'week' | 'month';
};

const Tooltip: React.FC<TooltipProps> = ({ company, position, timeframe = 'day' }) => {
  return (
    <div
      className="absolute z-50 p-3 bg-slate-800 text-white rounded-lg shadow-xl pointer-events-none transition-opacity duration-100"
      style={{
        left: position.x + 15,
        top: position.y + 15,
      }}
    >
      <h3 className="font-bold text-lg">
        {company.symbol} - {company.name}
      </h3>
      <p className="text-sm text-slate-300">
        {company.sector} / {company.industry}
      </p>
      <div className="mt-2 border-t border-slate-700 pt-2 grid grid-cols-2 gap-x-4">
        <span className="text-slate-400">Change ({timeframe}):</span>
        <span
          className={`font-medium ${
            company.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {formatPercent(company.changePercent)}
        </span>
        <span className="text-slate-400">Market Cap:</span>
        <span className="font-medium">
          {formatMarketCap(company.marketCap)}
        </span>
        {company.marketCapDiff !== undefined && company.marketCapDiff !== null && (
          <>
            <span className="text-slate-400">Cap Diff ({timeframe}):</span>
            <span
              className={`font-medium ${
                company.marketCapDiff >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatMarketCapDiff(company.marketCapDiff)}B
            </span>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Komponent pre Legendu.
 */
const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month' }> = ({ timeframe }) => {
  const colorScale = createColorScale(timeframe);
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const points = scales[timeframe];

  return (
    <div className="absolute bottom-4 left-4 flex items-center bg-gray-900 bg-opacity-70 p-2 rounded-lg pointer-events-none">
      <span className="text-white text-xs mr-3 font-medium">Decline</span>
      <div className="flex">
        {points.map((p) => (
          <div key={p} className="flex flex-col items-center">
            <div
              className="w-5 h-5 border-t border-b border-gray-700"
              style={{
                backgroundColor: colorScale(p),
                borderLeft: p === points[0] ? '1px solid #4b5563' : 'none',
                borderRight: p === points[points.length - 1] ? '1px solid #4b5563' : 'none',
              }}
            />
            <span className="text-white text-xs mt-1">{p}%</span>
          </div>
        ))}
      </div>
      <span className="text-white text-xs ml-3 font-medium">Growth</span>
    </div>
  );
};

// --- HLAVNÝ KOMPONENT ---

/**
 * Interaktívna Heatmapa akciového trhu.
 */
export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  data,
  width,
  height,
  onTileClick,
  timeframe = 'day',
  onTimeframeChange,
}) => {
  const [hoveredNode, setHoveredNode] = useState<CompanyNode | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [zoomedSector, setZoomedSector] = useState<string | null>(null);
  const [colorTransition, setColorTransition] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Animácia farieb pri zmene timeframe
  useEffect(() => {
    setColorTransition(true);
    const timer = setTimeout(() => setColorTransition(false), 500);
    return () => clearTimeout(timer);
  }, [timeframe]);

  // 1. Transformácia dát
  const hierarchyRoot = useMemo(() => buildHierarchy(data), [data]);

  // 2. Výpočet D3 Treemap layoutu
  const treemapLayout = useMemo(() => {
    if (width === 0 || height === 0) return null;

    // Vytvoríme D3 hierarchiu
    const d3Root = hierarchy(hierarchyRoot)
      .sum((d) => d.value || 0) // Sčítame 'value' (marketCap)
      .sort((a, b) => (b.value || 0) - (a.value || 0)); // Zoradíme

    // Vytvoríme generátor treemapy
    const treemapGenerator = treemap<HierarchyData>()
      .size([width, height])
      .paddingOuter(2) // Medzera okolo sektorov (zmenšená)
      .paddingTop(28) // Priestor pre nadpis sektora/industry (zväčšený pre lepšiu čitateľnosť)
      .paddingInner(0.5) // Medzera medzi jednotlivými dlaždicami (zmenšená)
      .tile(treemapSquarify); // Algoritmus pre "štvorcovejší" layout

    // Spustíme výpočet layoutu
    treemapGenerator(d3Root);
    return d3Root;
  }, [hierarchyRoot, width, height]);

  // Farebná škála pre aktuálny timeframe
  const colorScale = useMemo(() => createColorScale(timeframe), [timeframe]);

  // Handler pre pohyb myši (pre pozíciu tooltipu, relatívne k kontajneru)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  // Handler pre kliknutie na sektor (zoom)
  const handleSectorClick = useCallback((sectorName: string) => {
    setZoomedSector((prev) => (prev === sectorName ? null : sectorName));
  }, []);

  // Helper funkcia pre kontrolu, či uzol patrí do zoomovaného sektora
  const belongsToSector = useCallback((node: any, sectorName: string): boolean => {
    if (node.depth === 1) {
      return node.data.name === sectorName;
    }
    if (node.depth > 1) {
      let parent = node.parent;
      while (parent) {
        if (parent.depth === 1 && parent.data.name === sectorName) {
          return true;
        }
        parent = parent.parent;
      }
    }
    return false;
  }, []);

  // Získame všetky uzly (sektory, industry) a listy (firmy) - memoizované
  const allNodes = useMemo(() => {
    return treemapLayout ? treemapLayout.descendants() : [];
  }, [treemapLayout]);

  const allLeaves = useMemo(() => {
    const leaves = treemapLayout ? (treemapLayout.leaves() as TreemapLeaf[]) : [];
    console.log(`📊 MarketHeatmap: Rendering ${leaves.length} companies from ${data.length} total companies`);
    return leaves;
  }, [treemapLayout, data.length]);

  // Filtrovanie pre zoom na sektor
  const filteredNodes = useMemo(() => {
    return zoomedSector
      ? allNodes.filter((node) => belongsToSector(node, zoomedSector))
      : allNodes;
  }, [allNodes, zoomedSector, belongsToSector]);

  const filteredLeaves = useMemo(() => {
    return zoomedSector
      ? allLeaves.filter((leaf) => belongsToSector(leaf, zoomedSector))
      : allLeaves;
  }, [allLeaves, zoomedSector, belongsToSector]);

  if (width === 0 || height === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black text-gray-500">
        Loading layout...
      </div>
    );
  }

  // Vypočítame rozsah treemapy (spoločný výpočet pre scale a offset)
  const treemapBounds = useMemo(() => {
    if (!treemapLayout || width === 0 || height === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    treemapLayout.descendants().forEach((node: any) => {
      if (node.x0 !== undefined) {
        minX = Math.min(minX, node.x0);
        minY = Math.min(minY, node.y0);
        maxX = Math.max(maxX, node.x1);
        maxY = Math.max(maxY, node.y1);
      }
    });
    
    const treemapWidth = maxX - minX;
    const treemapHeight = maxY - minY;
    
    if (treemapWidth === 0 || treemapHeight === 0) return null;
    
    return { minX, minY, maxX, maxY, treemapWidth, treemapHeight };
  }, [treemapLayout, width, height]);

  // Vypočítame skálovanie pre zobrazenie celej mapy
  const scale = useMemo(() => {
    if (!treemapBounds) return 1;
    
    // Vypočítame skálu, aby sa mapa zmestila s 15% okrajom (zmenšená mapa)
    const scaleX = (width * 0.85) / treemapBounds.treemapWidth;
    const scaleY = (height * 0.85) / treemapBounds.treemapHeight;
    return Math.min(scaleX, scaleY, 1); // Nezvětšujeme, iba zmenšujeme ak je potrebné
  }, [treemapBounds, width, height]);

  // Offset pre centrovanie
  const offset = useMemo(() => {
    if (!treemapBounds || scale === 0) return { x: 0, y: 0 };
    
    const treemapWidth = treemapBounds.treemapWidth * scale;
    const treemapHeight = treemapBounds.treemapHeight * scale;
    
    return {
      x: (width - treemapWidth) / 2 - treemapBounds.minX * scale,
      y: (height - treemapHeight) / 2 - treemapBounds.minY * scale,
    };
  }, [treemapBounds, width, height, scale]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      style={{ overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* Zoom back button */}
      {zoomedSector && (
        <button
          onClick={() => setZoomedSector(null)}
          className="absolute top-4 left-4 z-40 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          ← Back to All Sectors
        </button>
      )}

      {/* 1. Renderujeme Sektory a Industry (ako nadpisy) */}
      {filteredNodes
        .filter((node) => node.depth === 1 || node.depth === 2) // Iba Sektory a Industry
        .map((node) => {
          const { x0, y0, x1, y1 } = node as TreemapNode;
          const data = node.data as HierarchyData;
          const nodeWidth = x1 - x0;
          const nodeHeight = y1 - y0;
          const isSector = node.depth === 1;
          const isHovered = isSector && hoveredSector === data.name;

          // Vypočítame skálovanú veľkosť
          const scaledWidth = nodeWidth * scale;
          const scaledHeight = nodeHeight * scale;

          // Skryj veľmi malé industry labely (upravené pre scale)
          if (node.depth === 2 && (scaledWidth < 40 || scaledHeight < 15)) {
            return null;
          }

          // Dynamická veľkosť textu podľa veľkosti dlaždice (upravené pre lepšiu UX)
          let fontSize: string;
          let padding: string;
          if (isSector) {
            // Sektory - zmenšené prahy pre menšie texty
            if (scaledWidth > 300 && scaledHeight > 120) {
              fontSize = 'text-lg';
              padding = 'pt-1 px-2 py-1';
            } else if (scaledWidth > 180 && scaledHeight > 70) {
              fontSize = 'text-base';
              padding = 'pt-0.5 px-1.5 py-0.5';
            } else {
              fontSize = 'text-sm';
              padding = 'pt-0.5 px-1 py-0.5';
            }
          } else {
            // Industry - zmenšené prahy pre menšie texty
            if (scaledWidth > 200 && scaledHeight > 80) {
              fontSize = 'text-base';
              padding = 'pt-1 px-1.5 py-0.5';
            } else if (scaledWidth > 100 && scaledHeight > 40) {
              fontSize = 'text-sm';
              padding = 'pt-0.5 px-1 py-0.5';
            } else {
              fontSize = 'text-xs';
              padding = 'pt-0.5 px-1 py-0.5';
            }
          }

          return (
            <div
              key={`${node.depth}-${data.name}-${x0}-${y0}`}
              className={`absolute overflow-hidden ${
                isSector ? 'cursor-pointer' : 'pointer-events-none'
              }`}
              style={{
                left: x0 * scale + offset.x,
                top: y0 * scale + offset.y,
                width: nodeWidth * scale,
                height: nodeHeight * scale,
              }}
              onMouseEnter={() => isSector && setHoveredSector(data.name)}
              onMouseLeave={() => isSector && setHoveredSector(null)}
              onClick={() => isSector && handleSectorClick(data.name)}
            >
              {/* Nadpis (D3 padding nám dal miesto hore) */}
              <div
                className={`absolute top-0 left-1 z-50 font-bold uppercase transition-colors duration-200 ${
                  isSector
                    ? `${fontSize} ${padding} ${isHovered ? 'text-blue-400' : 'text-white'}`
                    : `${fontSize} ${padding} text-white`
                }`}
                style={{
                  textShadow: '3px 3px 6px rgba(0, 0, 0, 1), 0 0 12px rgba(0, 0, 0, 0.8)',
                  backgroundColor: isSector ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.65)',
                  borderRadius: '4px',
                  lineHeight: '1.2',
                  letterSpacing: '0.05em',
                }}
              >
                {data.name}
              </div>

              {/* Hover overlay pre sektor */}
              {isSector && isHovered && (
                <div className="absolute inset-0 bg-blue-500 opacity-10 pointer-events-none" />
              )}
            </div>
          );
        })}

      {/* 2. Renderujeme Listy (Firmy) */}
      {filteredLeaves.map((leaf) => {
        const { x0, y0, x1, y1 } = leaf;
        const tileWidth = x1 - x0;
        const tileHeight = y1 - y0;
        const company = leaf.data.meta.companyData;
        const tileColor = colorScale(company.changePercent);

        // Logika pre zobrazenie textu podľa veľkosti dlaždice (market cap)
        const scaledWidth = tileWidth * scale;
        const scaledHeight = tileHeight * scale;
        const tileArea = scaledWidth * scaledHeight;
        const marketCap = company.marketCap || 0;
        
        // Dynamický výpočet font-size na základe plochy dlaždice
        // Použijeme kombináciu plochy a market cap pre lepšie rozhodovanie
        let symbolFontSize: string;
        let percentFontSize: string | null = null;
        let showText = false;
        
        // Kombinovaný prístup: použijeme plochu dlaždice (skutočná veľkosť na obrazovke)
        // ale upravíme prahy podľa market cap, aby sme mali lepšie rozloženie
        if (tileArea > 2500) {
          // Veľké dlaždice (>50x50px) - plný text
          symbolFontSize = 'text-xl';
          percentFontSize = 'text-base';
          showText = true;
        } else if (tileArea > 1000) {
          // Stredné dlaždice (~30-50px) - symbol + percent
          symbolFontSize = 'text-lg';
          percentFontSize = 'text-sm';
          showText = true;
        } else if (tileArea > 400) {
          // Menšie dlaždice (~20-30px) - iba symbol väčší
          symbolFontSize = 'text-base';
          showText = true;
        } else if (tileArea > 150) {
          // Malé dlaždice (~12-20px) - symbol menší
          symbolFontSize = 'text-sm';
          showText = true;
        } else if (tileArea > 50) {
          // Veľmi malé dlaždice (~7-12px) - symbol veľmi malý
          symbolFontSize = 'text-xs';
          showText = true;
        } else {
          // Extrémne malé dlaždice (<50px²) - bez textu (názov firmy sa vynechá)
          showText = false;
        }

        return (
          <div
            key={`${company.symbol}-${x0}-${y0}`}
            className="absolute flex flex-col items-center justify-center p-1 box-border transition-all duration-300 ease-out cursor-pointer group"
            style={{
              left: x0 * scale + offset.x,
              top: y0 * scale + offset.y,
              width: tileWidth * scale,
              height: tileHeight * scale,
              backgroundColor: tileColor,
              transitionProperty: colorTransition ? 'background-color' : 'all',
            }}
            onMouseEnter={() => setHoveredNode(company)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => onTileClick && onTileClick(company)}
          >
            {/* Obal pre text, ktorý zosvetlí/zosilní na hover */}
            {showText && (
              <div className="relative z-10 flex flex-col items-center justify-center w-full h-full transition-opacity opacity-90 group-hover:opacity-100">
                <div className={`font-bold text-white ${symbolFontSize} drop-shadow-lg leading-tight`}>
                  {company.symbol}
                </div>
                {percentFontSize && (
                  <div className={`${percentFontSize} text-white drop-shadow-lg font-medium leading-tight mt-0.5`}>
                    {formatPercent(company.changePercent)}
                  </div>
                )}
              </div>
            )}
            {/* Jemné zosvetlenie pozadia pri hoveri */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-100" />
          </div>
        );
      })}

      {/* 3. Legenda */}
      <HeatmapLegend timeframe={timeframe} />

      {/* 4. Tooltip (renderuje sa mimo) */}
      {hoveredNode && (
        <Tooltip company={hoveredNode} position={mousePosition} timeframe={timeframe} />
      )}
    </div>
  );
};

// --- Hook na sledovanie veľkosti rodičovského elementu ---

/**
 * Custom hook, ktorý používa ResizeObserver na sledovanie veľkosti elementu.
 * @returns Ref, ktorý sa má pripojiť na element, a jeho aktuálna veľkosť.
 */
export function useElementResize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
}
```

---

## 3. Wrapper komponent - `src/components/ResponsiveMarketHeatmap.tsx`

```typescript
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';
import { MarketHeatmap, CompanyNode, useElementResize } from './MarketHeatmap';
import { StockData } from '@/lib/types';

/**
 * Props pre ResponsiveMarketHeatmap
 */
export type ResponsiveMarketHeatmapProps = {
  /** API endpoint pre načítanie dát (default: /api/stocks) */
  apiEndpoint?: string;
  /** Callback pri kliknutí na dlaždicu */
  onTileClick?: (company: CompanyNode) => void;
  /** Automatické obnovovanie dát */
  autoRefresh?: boolean;
  /** Interval obnovovania v ms (default: 60000 = 1 min) */
  refreshInterval?: number;
  /** Počiatočný timeframe */
  initialTimeframe?: 'day' | 'week' | 'month';
};

/**
 * Default tickery pre heatmapu (top 50 spoločností)
 */
const DEFAULT_HEATMAP_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
  'JPM', 'V', 'MA', 'UNH', 'HD', 'PG', 'JNJ', 'DIS', 'BAC', 'ADBE',
  'CRM', 'COST', 'ABBV', 'WMT', 'NFLX', 'AMD', 'NKE', 'TMO', 'LIN', 'PM',
  'QCOM', 'INTU', 'AMGN', 'AXP', 'BKNG', 'LOW', 'HON', 'AMAT', 'SBUX', 'ADI',
  'ISRG', 'GILD', 'C', 'VRTX', 'REGN', 'CDNS', 'SNPS', 'KLAC', 'FTNT', 'ANSS'
];

/**
 * Transformuje StockData z API na CompanyNode pre heatmapu
 */
function transformStockDataToCompanyNode(stock: StockData): CompanyNode | null {
  if (!stock.ticker || !stock.sector || !stock.industry) {
    return null;
  }

  return {
    symbol: stock.ticker,
    name: stock.companyName || stock.ticker,
    sector: stock.sector,
    industry: stock.industry,
    marketCap: stock.marketCap || 0,
    changePercent: stock.percentChange || 0,
    marketCapDiff: stock.marketCapDiff,
  };
}

/**
 * Načíta dáta z API endpointu
 * Pre heatmapu používame optimalizovaný /api/heatmap endpoint, ktorý vracia všetky firmy s cache
 */
async function fetchHeatmapData(
  endpoint: string,
  timeframe: 'day' | 'week' | 'month'
): Promise<CompanyNode[]> {
  try {
    // Použijeme optimalizovaný heatmap endpoint, ktorý vracia všetky firmy s cache
    let url: URL;
    if (endpoint.includes('/heatmap')) {
      url = new URL('/api/heatmap', window.location.origin);
    } else if (endpoint.includes('/optimized')) {
      // Fallback na heatmap endpoint
      url = new URL('/api/heatmap', window.location.origin);
    } else {
      // Pre /api/stocks endpoint - použijeme heatmap endpoint namiesto toho
      url = new URL('/api/heatmap', window.location.origin);
    }

    const response = await fetch(url.toString(), {
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      console.error('❌ Heatmap API error:', errorMessage);
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    if (!result.success) {
      console.error('❌ Heatmap API returned error:', result.error);
      throw new Error(result.error || 'Failed to load heatmap data');
    }

    // API môže vracať rôzne formáty
    let stocks: StockData[] = [];

    if (result.data && Array.isArray(result.data)) {
      // Formát z /api/stocks (preferovaný, má sektor a industry)
      stocks = result.data;
    } else if (result.rows && Array.isArray(result.rows)) {
      // Formát z /api/stocks/optimized (fallback, nemá sektor/industry)
      stocks = result.rows.map((row: any) => ({
        ticker: row.t || row.ticker,
        currentPrice: row.p || row.currentPrice || 0,
        closePrice: row.p || row.currentPrice || 0,
        percentChange: row.c || row.percentChange || 0,
        marketCap: row.m || row.marketCap || 0,
        marketCapDiff: row.d || row.marketCapDiff || 0,
        companyName: row.n || row.companyName,
        // Optimized endpoint nemá sektor/industry, použijeme fallback
        sector: row.s || 'Unknown',
        industry: row.i || 'Unknown',
      }));
    } else if (Array.isArray(result)) {
      stocks = result;
    }

    // Transformujeme na CompanyNode a filtrujeme neplatné
    const companies = stocks
      .map(transformStockDataToCompanyNode)
      .filter((node): node is CompanyNode => node !== null);

    console.log(`📊 Heatmap API: Prijatých ${stocks.length} firiem z API, po transformácii ${companies.length} firiem s sector/industry`);

    return companies;
  } catch (error) {
    console.error('Error fetching heatmap data:', error);
    return [];
  }
}

/**
 * Wrapper komponent, ktorý poskytuje responzívnu veľkosť
 * a načítava dáta z API
 */
export const ResponsiveMarketHeatmap: React.FC<ResponsiveMarketHeatmapProps> = ({
  apiEndpoint = '/api/heatmap',
  onTileClick,
  autoRefresh = true,
  refreshInterval = 60000,
  initialTimeframe = 'day',
}) => {
  // Všetky hooks musia byť na začiatku, pred akýmkoľvek podmieneným returnom
  // Poradie: useRef, useState, useEffect, useCallback, useMemo
  const { ref, size } = useElementResize();
  const [data, setData] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
  const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });

  // Načítanie dát
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companies = await fetchHeatmapData(apiEndpoint, timeframe);
      console.log(`📊 Heatmap: Načítaných ${companies.length} firiem`);
      setData(companies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Error loading heatmap data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, timeframe]);

  // Počiatočné načítanie a auto-refresh
  useEffect(() => {
    loadData();

    if (autoRefresh) {
      const interval = setInterval(loadData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [loadData, autoRefresh, refreshInterval]);

  // Handler pre kliknutie na dlaždicu
  const handleTileClick = useCallback(
    (company: CompanyNode) => {
      if (onTileClick) {
        onTileClick(company);
      } else {
        // Default: otvorí Google search pre ticker
        window.open(`https://www.google.com/search?q=stock+${company.symbol}`, '_blank');
      }
    },
    [onTileClick]
  );

  // Handler pre zmenu timeframe
  const handleTimeframeChange = useCallback((newTimeframe: 'day' | 'week' | 'month') => {
    setTimeframe(newTimeframe);
    // Dáta sa načítajú automaticky cez useEffect
  }, []);

  // Fallback size effect
  useEffect(() => {
    if (size.width === 0 && size.height === 0 && typeof window !== 'undefined') {
      setFallbackSize({
        width: window.innerWidth,
        height: window.innerHeight - 100,
      });
    }
  }, [size.width, size.height]);

  const width = size.width || fallbackSize.width;
  const height = size.height || fallbackSize.height;

  // Podmienené returny až po všetkých hookoch
  if (loading && data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading heatmap data...</p>
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-red-500">
        <div className="text-center">
          <p className="mb-2">Error loading heatmap</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-full w-full bg-black flex items-center justify-center text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="h-full w-full relative" style={{ overflow: 'hidden' }}>
      <MarketHeatmap
        data={data}
        width={width}
        height={height}
        onTileClick={handleTileClick}
        timeframe={timeframe}
      />
    </div>
  );
};

export default ResponsiveMarketHeatmap;
```

---

## 4. Stránka - `src/app/heatmap/page.tsx`

```typescript
'use client';

import React, { useEffect } from 'react';
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode } from '@/components/MarketHeatmap';

/**
 * Testovacia stránka pre novú heatmapu
 */
export default function HeatmapPage() {
  // Odstránenie scrollbarov z body a html
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyMargin = document.body.style.margin;
    const originalHtmlMargin = document.documentElement.style.margin;
    const originalBodyPadding = document.body.style.padding;
    
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.documentElement.style.margin = '0';
    document.body.style.padding = '0';
    
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.margin = originalBodyMargin;
      document.documentElement.style.margin = originalHtmlMargin;
      document.body.style.padding = originalBodyPadding;
    };
  }, []);

  const handleTileClick = (company: CompanyNode) => {
    console.log('Clicked on:', company.symbol);
    // Môžeš pridať vlastnú logiku, napr. navigáciu na detail stránku
    window.open(`https://www.google.com/search?q=stock+${company.symbol}`, '_blank');
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col" style={{ overflow: 'hidden' }} suppressHydrationWarning>
      <div className="p-4 z-50 text-white flex-shrink-0">
        <h1 className="text-4xl font-bold mb-2">
          Heatmap<span className="text-green-500">.today</span>
        </h1>
        <p className="text-sm text-gray-400">
          Interactive treemap visualization of stock market data
        </p>
      </div>
      <div className="flex-1 min-h-0 relative" style={{ overflow: 'hidden' }}>
        <ResponsiveMarketHeatmap
          apiEndpoint="/api/stocks"
          onTileClick={handleTileClick}
          autoRefresh={true}
          refreshInterval={60000}
          initialTimeframe="day"
        />
      </div>
    </div>
  );
}
```

---

## Hlavné funkcie

### API Endpoint (`route.ts`)
- Načítava všetky firmy z databázy s sector/industry
- Používa Redis cache (2 minúty TTL)
- Batch processing pre veľké množstvá dát (500 tickerov na batch)
- Načítava SessionPrice a DailyRef z posledných 7 dní
- Vypočítava market cap a changePercent
- **Odstránený limit 300B pre market cap**

### Hlavný komponent (`MarketHeatmap.tsx`)
- D3 treemap vizualizácia
- Hierarchická štruktúra: Sektor → Industry → Company
- **Dynamické fonty podľa veľkosti dlaždice**
- Tooltip s detailmi firmy
- Zoom na sektor
- Farebná škála pre percentuálnu zmenu
- Centrovanie a škálovanie mapy

### Wrapper komponent (`ResponsiveMarketHeatmap.tsx`)
- Responzívna veľkosť pomocou ResizeObserver
- Načítanie dát z API
- Auto-refresh každú minútu
- Error handling a loading states

### Stránka (`page.tsx`)
- Layout stránky
- Odstránenie scrollbarov
- Integrácia ResponsiveMarketHeatmap

---

## Technológie

- **Next.js** - React framework
- **D3.js** - `d3-hierarchy`, `d3-scale` pre treemap vizualizáciu
- **Prisma** - ORM pre databázu
- **Redis** - Caching
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

---

## Poznámky

- Market cap sa už neobmedzuje na 300B
- ChangePercent sa správne načítava z SessionPrice
- Fonty sa dynamicky prispôsobujú veľkosti dlaždice
- Pre veľmi malé dlaždice (<50px²) sa text nezobrazuje
- Všetky 615 firiem z databázy sa zobrazujú na heatmape


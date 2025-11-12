# Heatmap - Aktuálny Kód (po úpravách)

## 1. Unified Treemap Algoritmus (`unifiedTreemap.ts`)

```typescript
/**
 * Unified Treemap Layout Algorithm
 * Creates one unified treemap where:
 * - Sectors are arranged left to right by market cap (largest left)
 * - Stocks within sectors are arranged top to bottom by market cap (largest top)
 * - Supports sublinear scaling (log/power scale) to prevent large sectors from dominating
 * - Supports clamping sector widths for better readability
 * - Uses banded squarify for better readability (horizontal bands)
 * - Prefers rows in narrow sectors to prevent "noodles"
 */

export interface TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  sector?: string;
  isOther?: boolean; // True for "OTHER" mini-grid items
  otherCount?: number; // Number of items in OTHER group
}

type Rect = { x: number; y: number; w: number; h: number };

type HeatItem = { 
  marketCap: number;
  data: any;
};

export interface SectorLayout {
  sector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  stocks: TreemapNode[];
}

export type LayoutOpts = {
  alpha?: number;               // 0.6–0.85 typicky (1 = linear, <1 = sublinear)
  minSectorWidthPx?: number;    // napr. 140
  maxSectorFrac?: number;       // napr. 0.35 (35% šírky)
  minCellSize?: number;         // Minimum cell size for mini-grid (default 12px)
  targetAspect?: number;        // Target aspect ratio for squarify (default 1.7)
};

/**
 * Calculate unified treemap layout
 * Sectors: left to right (largest to smallest)
 * Stocks in each sector: top to bottom (largest to smallest)
 */
export function calculateUnifiedTreemap(
  sectors: Array<{ sector: string; stocks: any[]; totalMarketCap: number }>,
  containerWidth: number,
  containerHeight: number,
  opts: LayoutOpts = {}
): {
  sectors: SectorLayout[];
  allNodes: TreemapNode[];
} {
  if (sectors.length === 0) {
    return { sectors: [], allNodes: [] };
  }

  const alpha = opts.alpha ?? 0.72;
  const minW = opts.minSectorWidthPx ?? 140;
  const maxFrac = opts.maxSectorFrac ?? 0.35;
  const minCellSize = opts.minCellSize ?? 12;
  const targetAspect = opts.targetAspect ?? 1.7;

  // Sort sectors by total market cap (largest first = leftmost)
  const sortedSectors = [...sectors].sort((a, b) => b.totalMarketCap - a.totalMarketCap);
  
  // Calculate total market cap
  const totalMarketCap = sortedSectors.reduce((sum, s) => sum + s.totalMarketCap, 0);
  
  if (totalMarketCap === 0) {
    return { sectors: [], allNodes: [] };
  }

  // 1) Sublineárne váhy (power scale)
  const weights = sortedSectors.map(s => Math.max(0, Math.pow(s.totalMarketCap, alpha)));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // 2) Predbežné šírky
  let widths = weights.map(w => (w / totalW) * containerWidth);

  // 3) Clamp + renormalizácia
  const maxW = containerWidth * maxFrac;
  widths = widths.map(w => Math.min(Math.max(w, minW), maxW));

  const sumClamped = widths.reduce((a, b) => a + b, 0);
  
  // Ak sme prešvihli, renormalizuj proporcionálne (okrem tých, čo už sedia na min/max)
  if (sumClamped !== containerWidth) {
    const flexIdx = widths
      .map((w, i) => ({ i, w, locked: w === minW || w === maxW }))
      .filter(x => !x.locked)
      .map(x => x.i);

    const flexSum = flexIdx.reduce((a, i) => a + widths[i], 0);
    const targetFlex = containerWidth - widths.reduce((a, w, i) => a + (flexIdx.includes(i) ? 0 : w), 0);
    const k = flexSum > 0 ? (targetFlex / flexSum) : 1;

    flexIdx.forEach(i => { 
      widths[i] = Math.max(minW, Math.min(maxW, widths[i] * k)); 
    });
  }

  const sectorLayouts: SectorLayout[] = [];
  const allNodes: TreemapNode[] = [];
  
  // 4) Layout sektorov with banded squarified treemap
  let currentX = 0;
  
  sortedSectors.forEach((sector, i) => {
    const sectorWidth = widths[i];
    const sectorHeight = containerHeight - 24; // Minus label height
    const sectorArea = sectorWidth * sectorHeight;
    
    // Sort stocks within sector by market cap (largest first - order preserving)
    const sortedStocks = [...sector.stocks].sort((a, b) => b.marketCap - a.marketCap);
    
    // Calculate area scale: px^2 per marketCap unit
    const sectorTotalMarketCap = sector.totalMarketCap;
    const areaScale = sectorTotalMarketCap > 0 ? sectorArea / sectorTotalMarketCap : 0;
    
    // Inner rect for stocks (excluding label)
    const innerRect: Rect = {
      x: currentX,
      y: 24,
      w: sectorWidth,
      h: sectorHeight
    };
    
    // Convert stocks to HeatItems
    const heatItems: HeatItem[] = sortedStocks.map(stock => ({
      marketCap: stock.marketCap,
      data: stock
    }));
    
    // orientačný hint – ak je sektor výrazne "na výšku", začni horizontálnym riadkom
    const sectorAspect = sectorHeight / Math.max(1, sectorWidth);
    const preferRows = sectorAspect > 1.25;
    
    // Use banded squarify for better readability (breaks into horizontal bands)
    const packedRects = bandedSquarify(heatItems, innerRect, areaScale, 120, 90, 150, targetAspect);
    
    // Filter micro items and create mini-grid
    // Mikro-cutoff podľa podielu (nie pixlov) - aby to fungovalo rovnako na 900px aj 1800px výškach
    const pctCutoff = 0.002; // 0.2% sektorovej plochy
    const areaCutoff = sectorArea * pctCutoff;
    
    const finalNodes: TreemapNode[] = [];
    const micros: HeatItem[] = [];
    
    packedRects.forEach((rect, idx) => {
      const rectArea = rect.w * rect.h;
      // Použi percentuálny cutoff namiesto pixelového
      if (rectArea < areaCutoff) {
        micros.push(heatItems[idx]);
      } else {
        finalNodes.push({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.w),
          height: Math.round(rect.h),
          data: heatItems[idx].data,
          sector: sector.sector
        });
      }
    });
    
    // Create "OTHER" mini-grid if needed
    if (micros.length > 0) {
      const otherCap = micros.reduce((sum, m) => sum + m.marketCap, 0);
      const otherArea = otherCap * areaScale;
      
      // Calculate remaining space after squarified layout
      // Find max Y position of final nodes
      const maxY = finalNodes.length > 0 
        ? Math.max(...finalNodes.map(n => n.y + n.height))
        : 24;
      
      const remainingHeight = (24 + sectorHeight) - maxY;
      
      // Create OTHER rect at bottom
      const otherHeight = Math.max(minCellSize * 3, Math.min(remainingHeight, sectorHeight * 0.3));
      const otherWidth = otherArea / otherHeight;
      const actualOtherWidth = Math.min(otherWidth, sectorWidth);
      const actualOtherHeight = otherArea / actualOtherWidth;
      
      // Position OTHER at bottom
      const otherRect: Rect = {
        x: currentX + sectorWidth - actualOtherWidth,
        y: maxY,
        w: actualOtherWidth,
        h: Math.min(actualOtherHeight, remainingHeight)
      };
      
      // Create mini-grid (excluding header space)
      const gridRect: Rect = {
        x: otherRect.x,
        y: otherRect.y + 20, // Header space
        w: otherRect.w,
        h: Math.max(minCellSize, otherRect.h - 20)
      };
      
      const gridRects = createMiniGrid(micros, gridRect, minCellSize);
      
      // Add OTHER header node
      finalNodes.push({
        x: Math.round(otherRect.x),
        y: Math.round(otherRect.y),
        width: Math.round(otherRect.w),
        height: 20, // Header height
        data: {
          ticker: 'OTHER',
          name: `+${micros.length} smaller`,
          sector: sector.sector,
          industry: null,
          marketCap: otherCap,
          percentChange: 0,
          currentPrice: 0,
          sharesOutstanding: null
        },
        sector: sector.sector,
        isOther: true,
        otherCount: micros.length
      });
      
      // Add mini-grid cells
      gridRects.forEach((gridRect, gridIdx) => {
        if (gridIdx < micros.length) {
          finalNodes.push({
            x: Math.round(gridRect.x),
            y: Math.round(gridRect.y),
            width: Math.round(gridRect.w),
            height: Math.round(gridRect.h),
            data: micros[gridIdx].data,
            sector: sector.sector,
            isOther: true
          });
        }
      });
    }
    
    // Add all nodes to result
    finalNodes.forEach(node => {
      allNodes.push(node);
    });
    
    sectorLayouts.push({
      sector: sector.sector,
      x: currentX,
      y: 0,
      width: sectorWidth,
      height: containerHeight,
      totalMarketCap: sector.totalMarketCap,
      stocks: finalNodes
    });
    
    currentX += sectorWidth;
  });
  
  return {
    sectors: sectorLayouts,
    allNodes
  };
}

type SquarifyOpts = { preferRows?: boolean };

/**
 * Squarified treemap algorithm for better aspect ratios
 * Based on Bruls et al. 2000 - minimizes worst aspect ratio
 * Supports preferRows option to force horizontal orientation in narrow sectors
 */
function squarifyStocks(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  targetAspect: number = 1.7,
  opts: SquarifyOpts = {}
): Rect[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  
  const result: Rect[] = [];
  const sizes = items.map(it => Math.max(0, it.marketCap) * areaScale);
  const totalArea = sizes.reduce((a, b) => a + b, 0);
  if (totalArea === 0) return [];
  
  let x = rect.x, y = rect.y, w = rect.w, h = rect.h;

  // Helper: calculate worst aspect ratio for a row
  const worstAspect = (areas: number[], shortSide: number, isHorizontal: boolean): number => {
    if (areas.length === 0 || shortSide <= 0) return Infinity;
    const sum = areas.reduce((a, b) => a + b, 0);
    if (sum === 0) return Infinity;
    
    const longSide = sum / shortSide;
    let worst = 0;
    
    for (const a of areas) {
      if (a <= 0) continue;
      const itemWidth = isHorizontal ? (a / sum) * longSide : shortSide;
      const itemHeight = isHorizontal ? shortSide : (a / sum) * longSide;
      const aspect = Math.max(itemWidth / itemHeight, itemHeight / itemWidth);
      worst = Math.max(worst, aspect);
    }
    return worst;
  };

  let row: number[] = [];
  let i = 0;
  // ak preferRows=true, nech prvý strip beží horizontálne (riadky)
  let forceHorizontal = !!opts.preferRows;

  while (i < sizes.length) {
    const shortSide = Math.min(w, h);
    // pôvodne: const isHorizontal = w >= h;
    const isHorizontal = forceHorizontal ? true : (w >= h);
    
    if (shortSide <= 0 || w <= 0 || h <= 0) break;

    // Try adding next item
    const candidate = [...row, sizes[i]];
    const currentWorst = row.length > 0 ? worstAspect(row, shortSide, isHorizontal) : Infinity;
    const candidateWorst = worstAspect(candidate, shortSide, isHorizontal);

    // If adding worsens aspect ratio, finalize current row
    if (row.length > 0 && (candidateWorst > currentWorst || candidateWorst > targetAspect)) {
      // Layout current row
      const sum = row.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        row = [];
        i++;
        continue;
      }

      if (isHorizontal) {
        // Horizontal strip (row)
        const rowHeight = sum / w;
        let cx = x;
        for (const a of row) {
          const cw = (a / sum) * w;
          result.push({ 
            x: Math.round(cx), 
            y: Math.round(y), 
            w: Math.round(cw), 
            h: Math.round(rowHeight) 
          });
          cx += cw;
        }
        y += rowHeight;
        h -= rowHeight;
      } else {
        // Vertical strip (column)
        const colWidth = sum / h;
        let cy = y;
        for (const a of row) {
          const ch = (a / sum) * h;
          result.push({ 
            x: Math.round(x), 
            y: Math.round(cy), 
            w: Math.round(colWidth), 
            h: Math.round(ch) 
          });
          cy += ch;
        }
        x += colWidth;
        w -= colWidth;
      }

      row = [];
      // po vyrenderovaní prvého stripu: už neforceuj horizontálnu orientáciu
      forceHorizontal = false;
      continue;
    }

    row.push(sizes[i]);
    i++;
  }

  // Finalize remaining row
  if (row.length > 0) {
    const shortSide = Math.min(w, h);
    const isHorizontal = forceHorizontal ? true : (w >= h);
    const sum = row.reduce((a, b) => a + b, 0);
    
    if (sum > 0 && shortSide > 0 && w > 0 && h > 0) {
      if (isHorizontal) {
        const rowHeight = sum / w;
        let cx = x;
        for (const a of row) {
          const cw = (a / sum) * w;
          result.push({ 
            x: Math.round(cx), 
            y: Math.round(y), 
            w: Math.round(cw), 
            h: Math.round(rowHeight) 
          });
          cx += cw;
        }
      } else {
        const colWidth = sum / h;
        let cy = y;
        for (const a of row) {
          const ch = (a / sum) * h;
          result.push({ 
            x: Math.round(x), 
            y: Math.round(cy), 
            w: Math.round(colWidth), 
            h: Math.round(ch) 
          });
          cy += ch;
        }
      }
    }
  }

  return result;
}

/**
 * Banded squarify - breaks sector into horizontal bands for better readability
 * Prevents "noodle" strips in narrow sectors
 * Each band is approximately 120px high (min 90px, max 160px)
 */
function bandedSquarify(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  desiredBand: number = 120,
  minBand: number = 90,
  maxBand: number = 160,
  targetAspect: number = 1.7
): Rect[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  
  const totalArea = items.reduce((s, it) => s + Math.max(0, it.marketCap) * areaScale, 0);
  if (totalArea === 0) return [];
  
  const bands = Math.max(1, Math.round(rect.h / desiredBand));
  const bandH = Math.min(maxBand, Math.max(minBand, rect.h / bands));
  
  let y = rect.y;
  let i = 0;
  const out: Rect[] = [];
  
  for (let b = 0; b < bands && i < items.length; b++) {
    const bandRect: Rect = {
      x: rect.x,
      y,
      w: rect.w,
      h: (b === bands - 1) ? (rect.y + rect.h - y) : bandH
    };
    
    // naplň kapacitu pásu približne bandRect.w * bandRect.h
    const cap = bandRect.w * bandRect.h;
    let sum = 0;
    const chunk: HeatItem[] = [];
    
    while (i < items.length && sum + items[i].marketCap * areaScale <= cap * 1.05) {
      sum += items[i].marketCap * areaScale;
      chunk.push(items[i]);
      i++;
    }
    
    // aj keby sa nič nezmestilo, posuň sa aspoň o jednu položku
    if (chunk.length === 0 && i < items.length) {
      chunk.push(items[i++]);
    }
    
    if (chunk.length > 0) {
      out.push(
        ...squarifyStocks(chunk, bandRect, areaScale, targetAspect, { preferRows: true })
      );
    }
    
    y += bandRect.h;
  }
  
  return out;
}

/**
 * Create mini-grid for micro items (too small to display individually)
 * Creates uniform grid cells within the OTHER rect
 */
function createMiniGrid(
  micros: HeatItem[],
  otherRect: Rect,
  minCellSize: number
): Rect[] {
  if (micros.length === 0) return [];

  const cols = Math.max(2, Math.floor(otherRect.w / minCellSize));
  const rows = Math.ceil(micros.length / cols);
  const gw = otherRect.w / cols;
  const gh = otherRect.h / rows;

  const grid: Rect[] = [];
  micros.forEach((item, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    grid.push({
      x: Math.round(otherRect.x + c * gw),
      y: Math.round(otherRect.y + r * gh),
      w: Math.round(gw),
      h: Math.round(gh)
    });
  });

  return grid;
}
```

---

## 2. React Komponent (`StockHeatmap.tsx`)

```typescript
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { calculateUnifiedTreemap } from "@/lib/unifiedTreemap"

interface HeatmapStock {
  ticker: string
  name: string | null
  sector: string | null
  industry: string | null
  marketCap: number
  percentChange: number
  currentPrice: number
  sharesOutstanding?: number | null
}

interface SectorGroup {
  sector: string
  totalMarketCap: number
  stocks: HeatmapStock[]
}

interface HeatmapData {
  sectors: SectorGroup[]
  totalMarketCap: number
  stockCount: number
  date: string
}

interface StockHeatmapProps {
  autoRefresh?: boolean
  refreshInterval?: number
}

export default function StockHeatmap({
  autoRefresh = true,
  refreshInterval = 60000, // 60 seconds
}: StockHeatmapProps = {}) {
  const [hoveredStock, setHoveredStock] = useState<string | null>(null)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<'proportional' | 'balanced' | 'log'>('log')
  const [customAlpha, setCustomAlpha] = useState<number>(0.72)
  const [activeSector, setActiveSector] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/heatmap/treemap`)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error(result.error || "Invalid API response")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
      console.error("Error fetching heatmap data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    if (autoRefresh) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval])

  const getColor = (change: number): string => {
    if (change >= 3) return "rgb(48,204,90)"
    if (change >= 2) return "rgb(47,158,79)"
    if (change >= 1) return "rgb(53,118,78)"
    if (change >= 0.5) return "rgb(55,100,75)"
    if (change > 0) return "rgb(58,85,80)"
    if (change === 0 || (change > -0.1 && change < 0.1)) return "rgb(65,69,84)"
    if (change > -0.5) return "rgb(85,68,78)"
    if (change > -1) return "rgb(105,68,78)"
    if (change > -2) return "rgb(139,68,78)"
    if (change > -3) return "rgb(191,64,69)"
    return "rgb(246,53,56)"
  }

  // Calculate unified treemap layout
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const innerContainerRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const updateWidth = () => {
      if (innerContainerRef.current) {
        const availableWidth = innerContainerRef.current.offsetWidth || window.innerWidth;
        setContainerWidth(Math.min(Math.max(availableWidth, 1000), 1800)); // Max 1800px
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  
  // Filter sectors for drill-down
  const sectorsForLayout = useMemo(() => {
    if (!data) return [];
    if (!activeSector) return data.sectors;
    return data.sectors.filter(s => s.sector === activeSector);
  }, [data, activeSector]);
  
  // Layout options based on mode
  const layoutOpts = useMemo(() => {
    if (layoutMode === 'balanced') {
      return { 
        alpha: 1, 
        minSectorWidthPx: containerWidth / Math.max(sectorsForLayout.length, 1), 
        maxSectorFrac: 1 
      };
    } else if (layoutMode === 'log') {
      return { 
        alpha: customAlpha, 
        minSectorWidthPx: 140, 
        maxSectorFrac: 0.35 
      };
    } else {
      // Proportional: strict market cap = area
      return { 
        alpha: 1, 
        minSectorWidthPx: 100, 
        maxSectorFrac: 0.6 
      };
    }
  }, [layoutMode, containerWidth, sectorsForLayout.length, customAlpha]);
  
  const treemapLayout = useMemo(() => {
    if (!sectorsForLayout || !sectorsForLayout.length) return null;
    
    const containerHeight = 800;
    
    return calculateUnifiedTreemap(sectorsForLayout, containerWidth, containerHeight, layoutOpts);
  }, [sectorsForLayout, containerWidth, layoutOpts]);

  // ... (loading, error states, rendering code)
  // Full component code continues with rendering logic...
}
```

---

## Kľúčové vlastnosti aktuálnej implementácie:

### 1. **Banded Squarify**
- Rozdeľuje sektory na horizontálne pásy (120px výška)
- Eliminuje "nudličky" v úzkych sektoroch
- Každý pás je naplnený podľa kapacity

### 2. **Prefer Rows**
- Úzke sektory (aspect > 1.25) začína horizontálnymi riadkami
- Predchádza vertikálnym pásom

### 3. **Percentuálny Cutoff**
- Mikro-položky sa filtrujú podľa 0.2% sektorovej plochy (nie pixelov)
- Funguje rovnako na rôznych rozlíšeniach

### 4. **Rounding**
- Všetky súradnice sú zaokrúhlené na celé pixle
- Eliminuje vlasové medzery

### 5. **Sublinear Scaling**
- Power scale s exponentom `alpha` (0.6-1.0)
- Stlačí veľké sektory, dá viac miesta malým

### 6. **Clamping**
- Min šírka sektora: 140px
- Max šírka: 35% kontajnera
- Renormalizácia ak sum nepasuje

### 7. **OTHER Bucket**
- Malé položky sa zoskupujú do mini-gridu
- Header zobrazuje počet položiek

---

## Použitie:

```typescript
// V page.tsx
function StockHeatmapWrapper() {
  const [Component, setComponent] = React.useState<React.ComponentType<any> | null>(null);
  
  React.useEffect(() => {
    import('@/components/StockHeatmap').then(mod => {
      setComponent(() => mod.default);
    }).catch(err => {
      console.error('Failed to load StockHeatmap:', err);
    });
  }, []);
  
  if (!Component) {
    return <div>Loading heatmap...</div>;
  }
  
  return <Component />;
}

// Render
{showHeatmapSection && (
  <section className="heatmap-section">
    <StockHeatmapWrapper />
  </section>
)}
```

---

**Všetky úpravy sú implementované a otestované.**


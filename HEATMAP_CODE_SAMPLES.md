# Heatmap - Ukážky Kódu

## 1. Hlavný React Komponent (`StockHeatmap.tsx`)

### Načítanie dát a state management

```typescript
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
```

### Color coding funkcia

```typescript
const getColor = (change: number): string => {
  if (change >= 3) return "rgb(48,204,90)"    // Dark green
  if (change >= 2) return "rgb(47,158,79)"
  if (change >= 1) return "rgb(53,118,78)"
  if (change >= 0.5) return "rgb(55,100,75)"
  if (change > 0) return "rgb(58,85,80)"       // Light green
  if (change === 0 || (change > -0.1 && change < 0.1)) return "rgb(65,69,84)"  // Gray
  if (change > -0.5) return "rgb(85,68,78)"
  if (change > -1) return "rgb(105,68,78)"
  if (change > -2) return "rgb(139,68,78)"
  if (change > -3) return "rgb(191,64,69)"
  return "rgb(246,53,56)"                      // Dark red
}
```

### Layout options a treemap výpočet

```typescript
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
```

### Renderovanie stock blokov

```typescript
{treemapLayout.allNodes.map((node, nodeIndex) => {
  const stock = node.data as HeatmapStock;
  const bgColor = getColor(stock.percentChange);
  const isHovered = hoveredStock === stock.ticker;
  
  // Create unique key: sector-ticker-x-y to avoid duplicate keys for "OTHER" buckets
  const uniqueKey = `${node.sector || 'unknown'}-${stock.ticker}-${node.x}-${node.y}-${nodeIndex}`;
  
  return (
    <button
      key={uniqueKey}
      style={{
        position: 'absolute',
        left: `${node.x}px`,
        top: `${node.y + 24}px`, // Offset for sector label
        width: `${node.width}px`,
        height: `${node.height}px`,
        backgroundColor: bgColor,
        border: isHovered ? '2px solid var(--clr-primary)' : '1px solid rgba(0,0,0,0.2)',
        transition: 'border 0.2s',
        zIndex: isHovered ? 10 : 1,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        padding: '0.5rem'
      }}
      onMouseEnter={() => setHoveredStock(stock.ticker)}
      onMouseLeave={() => setHoveredStock(null)}
    >
      {/* Label rules: text len ak width*height > 9000 AND min(w,h) > 38 */}
      {node.width * node.height > 9000 && Math.min(node.width, node.height) > 38 && !node.isOther && (
        <>
          <span style={{
            fontWeight: '700',
            fontSize: isHovered ? '1.125rem' : '1rem',
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: 'white',
            textAlign: 'center'
          }}>
            {stock.ticker}
          </span>
          {node.width * node.height > 12000 && (
            <span style={{
              fontWeight: isHovered ? '700' : '600',
              fontSize: isHovered ? '1rem' : '0.875rem',
              fontFamily: 'monospace',
              lineHeight: 1,
              color: 'rgba(255,255,255,0.95)'
            }}>
              {stock.percentChange > 0 ? "+" : ""}
              {stock.percentChange.toFixed(2)}%
            </span>
          )}
        </>
      )}
      
      {/* Small blocks: only border + tooltip on hover */}
      {((!(node.width * node.height > 9000 && Math.min(node.width, node.height) > 38)) || node.isOther) && isHovered && (
        <div style={{
          position: 'absolute',
          top: node.isOther ? 'auto' : '100%',
          bottom: node.isOther ? '100%' : 'auto',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.5rem',
          backgroundColor: 'rgba(0,0,0,0.9)',
          color: 'white',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          zIndex: 100,
          pointerEvents: 'none'
        }}>
          <div style={{ fontWeight: '700' }}>{stock.ticker}</div>
          {stock.name && <div>{stock.name}</div>}
          <div>{stock.percentChange > 0 ? "+" : ""}{stock.percentChange.toFixed(2)}%</div>
          <div>${stock.marketCap.toFixed(1)}B</div>
        </div>
      )}
    </button>
  );
})}
```

---

## 2. Unified Treemap Algoritmus (`unifiedTreemap.ts`)

### Hlavná funkcia pre výpočet layoutu

```typescript
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
  
  // 4) Layout sektorov with squarified treemap
  let currentX = 0;
  
  sortedSectors.forEach((sector, i) => {
    const sectorWidth = widths[i];
    const sectorHeight = containerHeight - 24; // Minus label height
    const sectorArea = sectorWidth * sectorHeight;
    
    // Sort stocks within sector by market cap (largest first)
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
    
    // Squarify layout
    const packedRects = squarifyStocks(heatItems, innerRect, areaScale, targetAspect);
    
    // Filter micro items and create mini-grid
    const finalNodes: TreemapNode[] = [];
    const micros: HeatItem[] = [];
    
    packedRects.forEach((rect, idx) => {
      if (rect.w < minCellSize || rect.h < minCellSize) {
        micros.push(heatItems[idx]);
      } else {
        finalNodes.push({
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: rect.h,
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
        x: otherRect.x,
        y: otherRect.y,
        width: otherRect.w,
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
            x: gridRect.x,
            y: gridRect.y,
            width: gridRect.w,
            height: gridRect.h,
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
```

### Squarified Treemap Algoritmus (Bruls et al. 2000)

```typescript
function squarifyStocks(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  targetAspect: number = 1.7
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

  while (i < sizes.length) {
    const shortSide = Math.min(w, h);
    const isHorizontal = w >= h;
    
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
          result.push({ x: cx, y, w: cw, h: rowHeight });
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
          result.push({ x, y: cy, w: colWidth, h: ch });
          cy += ch;
        }
        x += colWidth;
        w -= colWidth;
      }

      row = [];
      continue;
    }

    row.push(sizes[i]);
    i++;
  }

  // Finalize remaining row
  if (row.length > 0) {
    const shortSide = Math.min(w, h);
    const isHorizontal = w >= h;
    const sum = row.reduce((a, b) => a + b, 0);
    
    if (sum > 0 && shortSide > 0 && w > 0 && h > 0) {
      if (isHorizontal) {
        const rowHeight = sum / w;
        let cx = x;
        for (const a of row) {
          const cw = (a / sum) * w;
          result.push({ x: cx, y, w: cw, h: rowHeight });
          cx += cw;
        }
      } else {
        const colWidth = sum / h;
        let cy = y;
        for (const a of row) {
          const ch = (a / sum) * h;
          result.push({ x, y: cy, w: colWidth, h: ch });
          cy += ch;
        }
      }
    }
  }

  return result;
}
```

### Mini-grid pre malé položky

```typescript
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
      x: otherRect.x + c * gw,
      y: otherRect.y + r * gh,
      w: gw,
      h: gh
    });
  });

  return grid;
}
```

---

## 3. Backend API (`api/heatmap/treemap/route.ts`)

### Načítanie dát a výpočet percentChange

```typescript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get date (default to today)
    const dateParam = searchParams.get('date');
    const targetDate = dateParam 
      ? new Date(dateParam) 
      : new Date();
    
    targetDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get latest price for each symbol from ANY session (most recent)
    let allPrices = await prisma.sessionPrice.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow
        },
        ticker: {
          sector: {
            not: null // Only stocks with sector data
          }
        }
      },
      orderBy: {
        lastTs: 'desc'
      },
      include: {
        ticker: {
          select: {
            symbol: true,
            name: true,
            sector: true,
            industry: true,
            sharesOutstanding: true
          }
        }
      }
    });

    // Get latest price for each symbol (most recent across all sessions)
    const symbolMap = new Map<string, typeof allPrices[0]>();
    for (const price of allPrices) {
      if (!symbolMap.has(price.symbol)) {
        symbolMap.set(price.symbol, price);
      }
    }

    const tickersWithPrices = Array.from(symbolMap.values());
    
    // Get previousClose from DailyRef
    const symbols = tickersWithPrices.map(p => p.symbol);
    const dailyRefs = await prisma.dailyRef.findMany({
      where: {
        symbol: { in: symbols },
        date: {
          gte: today,
          lt: tomorrow
        }
      }
    });
    
    const dailyRefMap = new Map<string, number>();
    for (const ref of dailyRefs) {
      dailyRefMap.set(ref.symbol, ref.previousClose);
    }

    // Transform data and calculate market cap and percentChange vs previousClose
    const stocks: HeatmapStock[] = [];
    
    for (const sessionPrice of tickersWithPrices) {
      const ticker = sessionPrice.ticker;
      if (!ticker.sector) continue;
      
      const sharesOutstanding = ticker.sharesOutstanding || 0;
      const currentPrice = sessionPrice.lastPrice;
      const marketCap = computeMarketCap(currentPrice, sharesOutstanding);
      
      // Skip stocks with invalid data
      if (marketCap <= 0) continue;
      
      // Get previousClose from DailyRef, calculate percentChange
      // Fallback to changePct from SessionPrice if DailyRef not available
      const previousClose = dailyRefMap.get(ticker.symbol);
      let percentChange: number;
      
      if (previousClose && previousClose > 0) {
        // Use DailyRef previousClose to calculate percentChange
        percentChange = computePercentChange(currentPrice, previousClose);
      } else {
        // Fallback: use changePct from SessionPrice (already calculated vs previousClose)
        percentChange = sessionPrice.changePct;
      }
      
      stocks.push({
        ticker: ticker.symbol,
        name: ticker.name,
        sector: ticker.sector,
        industry: ticker.industry,
        marketCap,
        percentChange,
        currentPrice,
        sharesOutstanding
      });
    }

    // Group by sector
    const sectorMap = new Map<string, HeatmapStock[]>();
    
    for (const stock of stocks) {
      const sector = stock.sector || 'Unknown';
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, []);
      }
      sectorMap.get(sector)!.push(stock);
    }

    // Create sector groups with total market cap
    const sectors: SectorGroup[] = Array.from(sectorMap.entries()).map(([sector, sectorStocks]) => {
      // Sort stocks by market cap (largest first)
      const sortedStocks = sectorStocks.sort((a, b) => b.marketCap - a.marketCap);
      
      const totalMarketCap = sortedStocks.reduce((sum, stock) => sum + stock.marketCap, 0);
      
      return {
        sector,
        totalMarketCap,
        stocks: sortedStocks
      };
    });

    // Sort sectors by total market cap (largest first)
    sectors.sort((a, b) => b.totalMarketCap - a.totalMarketCap);

    // Calculate total market cap
    const totalMarketCap = sectors.reduce((sum, sector) => sum + sector.totalMarketCap, 0);

    const response: HeatmapResponse = {
      sectors,
      totalMarketCap,
      stockCount: stocks.length,
      date: targetDate.toISOString().split('T')[0]
    };

    return createSuccessResponse(response, {
      cached: false,
      cacheAge: 0
    });

  } catch (error) {
    console.error('❌ Error in /api/heatmap/treemap:', error);
    return createErrorResponse(
      error,
      'Failed to fetch heatmap data',
      500
    );
  }
}
```

---

## 4. TypeScript Interfaces

```typescript
// StockHeatmap.tsx
interface HeatmapStock {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number;
  percentChange: number;
  currentPrice: number;
  sharesOutstanding?: number | null;
}

interface SectorGroup {
  sector: string;
  totalMarketCap: number;
  stocks: HeatmapStock[];
}

interface HeatmapData {
  sectors: SectorGroup[];
  totalMarketCap: number;
  stockCount: number;
  date: string;
}

// unifiedTreemap.ts
export interface TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  sector?: string;
  isOther?: boolean;
  otherCount?: number;
}

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
```

---

## 5. Integrácia do stránky (`page.tsx`)

```typescript
// Conditional import wrapper for StockHeatmap to avoid webpack issues
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
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-subtext)' }}>Loading heatmap...</div>;
  }
  
  return <Component />;
}

// In HomePage component
{showHeatmapSection && (
  <section className="heatmap-section" style={{ marginBottom: '2rem' }}>
    <StockHeatmapWrapper />
  </section>
)}
```

---

## Kľúčové koncepty

1. **Sublinear Scaling**: `Math.pow(marketCap, alpha)` kde `alpha < 1` stlačí veľké sektory
2. **Clamping**: `Math.min(Math.max(width, minW), maxW)` zabezpečí min/max šírky
3. **Squarified Algorithm**: Minimalizuje najhorší pomer strán blokov
4. **OTHER Bucket**: Zoskupuje malé položky do čitateľného bloku
5. **Dynamic Labels**: Text len ak `width * height > 9000 && min(width, height) > 38`
6. **Unique Keys**: `${sector}-${ticker}-${x}-${y}-${index}` pre React rendering


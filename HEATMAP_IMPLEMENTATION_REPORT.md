# Heatmap Implementation Report

## Prehľad

Heatmapa je implementovaná ako **unified treemap** (jednotná mapa), ktorá zobrazuje akcie zoskupené podľa sektorov. Veľkosť každého bloku reprezentuje **market cap** (trhovú kapitalizáciu), farba reprezentuje **percentuálnu zmenu ceny** oproti predchádzajúcej uzávierke.

## Architektúra

### 1. Komponenty

#### `StockHeatmap.tsx` - Hlavný React komponent

- Načítava dáta z API
- Vypočítava layout pomocou `calculateUnifiedTreemap`
- Renderuje treemap s interaktívnymi prvkami
- Podporuje 3 režimy layoutu: `proportional`, `balanced`, `log`
- Implementuje drill-down (zoom na sektor)
- Dynamické labely podľa veľkosti blokov

#### `unifiedTreemap.ts` - Layout algoritmus

- Implementuje unified treemap algoritmus
- Sublineárne škálovanie (power scale) s exponentom `alpha`
- Clamping šírok sektorov (min/max)
- Squarified treemap algoritmus pre optimálne pomery strán
- "OTHER" bucket pre malé položky
- Mini-grid pre mikro položky

#### `api/heatmap/treemap/route.ts` - Backend API

- Načítava dáta z databázy (Prisma)
- Zoskupuje akcie podľa sektorov
- Počíta market cap a percentuálnu zmenu
- Vracia štruktúrované dáta pre frontend

---

## Kľúčové funkcie

### 1. Unified Treemap Layout

**Cieľ:** Jedna mapa, kde:

- **Sektory** sú usporiadané zľava doprava (najväčší vľavo)
- **Akcie** v rámci sektora sú usporiadané zhora nadol (najväčšie hore)

**Implementácia:**

```typescript
// unifiedTreemap.ts

export function calculateUnifiedTreemap(
  sectors: Array<{ sector: string; stocks: any[]; totalMarketCap: number }>,
  containerWidth: number,
  containerHeight: number,
  opts: LayoutOpts = {}
): {
  sectors: SectorLayout[];
  allNodes: TreemapNode[];
} {
  // 1. Sort sectors by market cap (largest first)
  const sortedSectors = [...sectors].sort(
    (a, b) => b.totalMarketCap - a.totalMarketCap
  );

  // 2. Sublinear scaling (power scale)
  const alpha = opts.alpha ?? 0.72;
  const weights = sortedSectors.map((s) =>
    Math.max(0, Math.pow(s.totalMarketCap, alpha))
  );
  const totalW = weights.reduce((a, b) => a + b, 0);

  // 3. Calculate preliminary widths
  let widths = weights.map((w) => (w / totalW) * containerWidth);

  // 4. Clamp widths (min/max)
  const minW = opts.minSectorWidthPx ?? 140;
  const maxFrac = opts.maxSectorFrac ?? 0.35;
  const maxW = containerWidth * maxFrac;
  widths = widths.map((w) => Math.min(Math.max(w, minW), maxW));

  // 5. Renormalize if sum doesn't match container width
  // ... (renormalization logic)

  // 6. Layout each sector
  let currentX = 0;
  const sectorLayouts: SectorLayout[] = [];
  const allNodes: TreemapNode[] = [];

  sortedSectors.forEach((sector) => {
    const sectorWidth = widths[i];
    const sectorHeight = containerHeight - 24; // Minus label height

    // Use squarified algorithm for stocks within sector
    const sortedStocks = [...sector.stocks].sort(
      (a, b) => b.marketCap - a.marketCap
    );
    const packedRects = squarifyStocks(
      heatItems,
      innerRect,
      areaScale,
      targetAspect
    );

    // Create nodes for each stock
    // ... (node creation logic)

    currentX += sectorWidth;
  });

  return { sectors: sectorLayouts, allNodes };
}
```

### 2. Sublinear Scaling (Power Scale)

**Problém:** Veľké sektory (napr. Technology) by mohli zdominovať celú mapu.

**Riešenie:** Použitie power scale s exponentom `alpha < 1`:

```typescript
// alpha = 1.0 → lineárne (presné market cap)
// alpha = 0.72 → sublineárne (stlačí veľké sektory)
// alpha = 0.6 → ešte viac stlačí

const weights = sortedSectors.map((s) =>
  Math.max(0, Math.pow(s.totalMarketCap, alpha))
);
```

**Výsledok:** Technologické sektory sa "stlačia", menšie sektory dostanú viac miesta.

### 3. Clamping Sector Widths

**Problém:** Malé sektory by mohli byť príliš úzke (nečitateľné).

**Riešenie:** Nastavenie minimálnej a maximálnej šírky:

```typescript
const minW = opts.minSectorWidthPx ?? 140; // Minimum 140px
const maxFrac = opts.maxSectorFrac ?? 0.35; // Maximum 35% of container
const maxW = containerWidth * maxFrac;

widths = widths.map((w) => Math.min(Math.max(w, minW), maxW));
```

**Výsledok:** Všetky sektory sú čitateľné, žiadny sektor nezaberie viac ako 35% šírky.

### 4. Squarified Treemap Algorithm

**Cieľ:** Optimalizovať pomery strán jednotlivých blokov (čím viac štvorcové, tým lepšie).

**Algoritmus:** Bruls et al. 2000 - minimalizuje najhorší pomer strán.

```typescript
function squarifyStocks(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  targetAspect: number = 1.7
): Rect[] {
  // Calculate worst aspect ratio for a row
  const worstAspect = (
    areas: number[],
    shortSide: number,
    isHorizontal: boolean
  ): number => {
    const sum = areas.reduce((a, b) => a + b, 0);
    const longSide = sum / shortSide;
    let worst = 0;

    for (const a of areas) {
      const itemWidth = isHorizontal ? (a / sum) * longSide : shortSide;
      const itemHeight = isHorizontal ? shortSide : (a / sum) * longSide;
      const aspect = Math.max(itemWidth / itemHeight, itemHeight / itemWidth);
      worst = Math.max(worst, aspect);
    }
    return worst;
  };

  // Build rows/columns iteratively
  let row: number[] = [];
  let i = 0;

  while (i < sizes.length) {
    const candidate = [...row, sizes[i]];
    const currentWorst =
      row.length > 0 ? worstAspect(row, shortSide, isHorizontal) : Infinity;
    const candidateWorst = worstAspect(candidate, shortSide, isHorizontal);

    // If adding worsens aspect ratio, finalize current row
    if (
      row.length > 0 &&
      (candidateWorst > currentWorst || candidateWorst > targetAspect)
    ) {
      // Layout current row
      // ... (layout logic)
      row = [];
      continue;
    }

    row.push(sizes[i]);
    i++;
  }

  return result;
}
```

**Výsledok:** Bloky sú viac štvorcové, menej "pásikov".

### 5. "OTHER" Bucket pre Malé Položky

**Problém:** Veľmi malé akcie by vytvorili nečitateľné mikro-bloky.

**Riešenie:** Zoskupenie malých položiek do "OTHER" bucketu:

```typescript
// unifiedTreemap.ts

const finalNodes: TreemapNode[] = [];
const micros: HeatItem[] = [];

packedRects.forEach((rect, idx) => {
  // Filter out micro items
  if (rect.w < minCellSize || rect.h < minCellSize) {
    micros.push(heatItems[idx]);
  } else {
    finalNodes.push({
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      data: heatItems[idx].data,
      sector: sector.sector,
    });
  }
});

// Create OTHER bucket if there are micros
if (micros.length > 0) {
  const otherCap = micros.reduce((sum, m) => sum + m.marketCap, 0);
  const otherArea = otherCap * areaScale;

  // Calculate OTHER rect
  const otherRect: Rect = {
    x: currentX + sectorWidth - actualOtherWidth,
    y: maxY,
    w: actualOtherWidth,
    h: Math.min(actualOtherHeight, remainingHeight),
  };

  // Create mini-grid for micro items
  const gridRects = createMiniGrid(micros, gridRect, minCellSize);

  // Add OTHER header node
  finalNodes.push({
    x: otherRect.x,
    y: otherRect.y,
    width: otherRect.w,
    height: 20,
    data: {
      ticker: "OTHER",
      name: `+${micros.length} smaller`,
      sector: sector.sector,
      marketCap: otherCap,
      percentChange: 0,
    },
    sector: sector.sector,
    isOther: true,
    otherCount: micros.length,
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
        isOther: true,
      });
    }
  });
}
```

**Výsledok:** Malé položky sú zoskupené do čitateľného "OTHER" bloku s mini-gridom.

### 6. Layout Modes

**Tri režimy:**

```typescript
// StockHeatmap.tsx

const layoutOpts = useMemo(() => {
  if (layoutMode === "balanced") {
    // Rovnaké šírky sektorov, interné bloky podľa market cap
    return {
      alpha: 1,
      minSectorWidthPx: containerWidth / Math.max(sectorsForLayout.length, 1),
      maxSectorFrac: 1,
    };
  } else if (layoutMode === "log") {
    // Sublineárne škálovanie (stlačí veľké sektory)
    return {
      alpha: customAlpha, // 0.6-1.0 (slider)
      minSectorWidthPx: 140,
      maxSectorFrac: 0.35,
    };
  } else {
    // Proportional: presné market cap = plocha
    return {
      alpha: 1,
      minSectorWidthPx: 100,
      maxSectorFrac: 0.6,
    };
  }
}, [layoutMode, containerWidth, sectorsForLayout.length, customAlpha]);
```

### 7. Drill-Down (Zoom na Sektor)

**Funkcia:** Kliknutie na názov sektora zobrazí iba tento sektor na celú šírku.

```typescript
// StockHeatmap.tsx

const [activeSector, setActiveSector] = useState<string | null>(null);

// Filter sectors for drill-down
const sectorsForLayout = useMemo(() => {
  if (!data) return [];
  if (!activeSector) return data.sectors;
  return data.sectors.filter((s) => s.sector === activeSector);
}, [data, activeSector]);

// Render sector labels (clickable)
{
  treemapLayout.sectors.map((sectorLayout) => (
    <div
      key={sectorLayout.sector}
      onClick={() => setActiveSector(sectorLayout.sector)}
      style={{
        position: "absolute",
        left: `${sectorLayout.x}px`,
        top: "0",
        width: `${sectorLayout.width}px`,
        height: "24px",
        cursor: "pointer",
        // ... styling
      }}
    >
      {sectorLayout.sector}
    </div>
  ));
}

// Back button when in drill-down mode
{
  activeSector && (
    <button onClick={() => setActiveSector(null)}>← Back to All Sectors</button>
  );
}
```

### 8. Dynamic Labels

**Pravidlo:** Text (ticker, percentá) sa zobrazí len ak:

- `width * height > 9000` (dostatočná plocha)
- `min(width, height) > 38` (dostatočná výška/šírka)

```typescript
// StockHeatmap.tsx

{
  node.width * node.height > 9000 &&
    Math.min(node.width, node.height) > 38 &&
    !node.isOther && (
      <>
        <span>{stock.ticker}</span>
        {node.width * node.height > 12000 && (
          <span>
            {stock.percentChange > 0 ? "+" : ""}
            {stock.percentChange.toFixed(2)}%
          </span>
        )}
      </>
    );
}

// Small blocks: only border + tooltip on hover
{
  (!(
    node.width * node.height > 9000 && Math.min(node.width, node.height) > 38
  ) ||
    node.isOther) &&
    isHovered && (
      <div
        style={
          {
            /* tooltip */
          }
        }
      >
        <div>{stock.ticker}</div>
        <div>{stock.percentChange.toFixed(2)}%</div>
        <div>${stock.marketCap.toFixed(1)}B</div>
      </div>
    );
}
```

### 9. Color Coding

**Farba = Percentuálna zmena:**

```typescript
// StockHeatmap.tsx

const getColor = (change: number): string => {
  if (change >= 3) return "rgb(48,204,90)"; // Dark green
  if (change >= 2) return "rgb(47,158,79)";
  if (change >= 1) return "rgb(53,118,78)";
  if (change >= 0.5) return "rgb(55,100,75)";
  if (change > 0) return "rgb(58,85,80)"; // Light green
  if (change === 0 || (change > -0.1 && change < 0.1)) return "rgb(65,69,84)"; // Gray
  if (change > -0.5) return "rgb(85,68,78)";
  if (change > -1) return "rgb(105,68,78)";
  if (change > -2) return "rgb(139,68,78)";
  if (change > -3) return "rgb(191,64,69)";
  return "rgb(246,53,56)"; // Dark red
};
```

### 10. API Endpoint

**Backend:** `/api/heatmap/treemap`

```typescript
// api/heatmap/treemap/route.ts

export async function GET(request: NextRequest) {
  // 1. Get latest prices from ANY session (most recent)
  let allPrices = await prisma.sessionPrice.findMany({
    where: {
      date: { gte: today, lt: tomorrow },
      ticker: { sector: { not: null } },
    },
    orderBy: { lastTs: "desc" },
    include: {
      ticker: { select: { symbol, name, sector, industry, sharesOutstanding } },
    },
  });

  // 2. Get previousClose from DailyRef (fallback to changePct from SessionPrice)
  const dailyRefMap = new Map();
  const dailyRefs = await prisma.dailyRef.findMany({
    where: { date: targetDate },
  });
  dailyRefs.forEach((dr) => dailyRefMap.set(dr.symbol, dr.previousClose));

  // 3. Group by sector and calculate market cap
  const sectorMap = new Map<string, HeatmapStock[]>();

  for (const sp of allPrices) {
    const ticker = sp.ticker;
    const currentPrice = sp.price;
    const previousClose = dailyRefMap.get(ticker.symbol);

    // Calculate percentChange
    let percentChange: number;
    if (previousClose && previousClose > 0) {
      percentChange = computePercentChange(currentPrice, previousClose);
    } else {
      percentChange = sp.changePct; // Fallback
    }

    // Calculate market cap
    const marketCap = computeMarketCap(currentPrice, ticker.sharesOutstanding);

    const stock: HeatmapStock = {
      ticker: ticker.symbol,
      name: ticker.name,
      sector: ticker.sector,
      industry: ticker.industry,
      marketCap,
      percentChange,
      currentPrice,
      sharesOutstanding: ticker.sharesOutstanding,
    };

    const sector = ticker.sector || "Unknown";
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, []);
    }
    sectorMap.get(sector)!.push(stock);
  }

  // 4. Create sector groups
  const sectors: SectorGroup[] = Array.from(sectorMap.entries()).map(
    ([sector, stocks]) => ({
      sector,
      totalMarketCap: stocks.reduce((sum, s) => sum + s.marketCap, 0),
      stocks,
    })
  );

  // 5. Return response
  return NextResponse.json({
    success: true,
    data: {
      sectors,
      totalMarketCap: sectors.reduce((sum, s) => sum + s.totalMarketCap, 0),
      stockCount: allPrices.length,
      date: targetDate.toISOString().split("T")[0],
    },
  });
}
```

---

## Renderovanie

### Full-bleed Layout

Heatmapa je full-bleed (zaberá celú šírku viewportu):

```typescript
// StockHeatmap.tsx

<section
  ref={containerRef}
  style={{
    position: "relative",
    left: "50%",
    right: "50%",
    marginLeft: "-50vw",
    marginRight: "-50vw",
    width: "100vw",
    marginBottom: "1rem",
  }}
>
  <div
    ref={innerContainerRef}
    style={{
      maxWidth: "1800px",
      margin: "0 auto",
      padding: "0 1rem",
    }}
  >
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "800px",
        border: "1px solid var(--clr-border)",
        borderRadius: "0.5rem",
        overflow: "visible",
        backgroundColor: "var(--clr-surface)",
      }}
    >
      {/* Sector labels */}
      {treemapLayout.sectors.map((sectorLayout) => (
        <div
          key={sectorLayout.sector}
          onClick={() => setActiveSector(sectorLayout.sector)}
          style={{
            position: "absolute",
            left: `${sectorLayout.x}px`,
            top: "0",
            width: `${sectorLayout.width}px`,
            height: "24px",
            // ... styling
          }}
        >
          {sectorLayout.sector}
        </div>
      ))}

      {/* Stock blocks */}
      {treemapLayout.allNodes.map((node, nodeIndex) => {
        const stock = node.data as HeatmapStock;
        const uniqueKey = `${node.sector || "unknown"}-${stock.ticker}-${
          node.x
        }-${node.y}-${nodeIndex}`;

        return (
          <button
            key={uniqueKey}
            style={{
              position: "absolute",
              left: `${node.x}px`,
              top: `${node.y + 24}px`,
              width: `${node.width}px`,
              height: `${node.height}px`,
              backgroundColor: getColor(stock.percentChange),
              // ... styling
            }}
            onMouseEnter={() => setHoveredStock(stock.ticker)}
            onMouseLeave={() => setHoveredStock(null)}
          >
            {/* Labels based on size */}
            {/* Tooltip on hover */}
          </button>
        );
      })}
    </div>
  </div>
</section>
```

---

## Výkon

### Optimalizácie

1. **useMemo** pre layout výpočty:

```typescript
const treemapLayout = useMemo(() => {
  if (!sectorsForLayout || !sectorsForLayout.length) return null;
  return calculateUnifiedTreemap(
    sectorsForLayout,
    containerWidth,
    800,
    layoutOpts
  );
}, [sectorsForLayout, containerWidth, layoutOpts]);
```

2. **Unikátne kľúče** pre React rendering:

```typescript
const uniqueKey = `${node.sector || "unknown"}-${stock.ticker}-${node.x}-${
  node.y
}-${nodeIndex}`;
```

3. **Conditional rendering** - text len pre veľké bloky

4. **Auto-refresh** každých 60 sekúnd (konfigurovateľné)

---

## Štruktúra dát

### Frontend Interface

```typescript
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
```

### Layout Interface

```typescript
interface TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  sector?: string;
  isOther?: boolean;
  otherCount?: number;
}

interface SectorLayout {
  sector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  stocks: TreemapNode[];
}
```

---

## Použitie

### Integrácia do stránky

```typescript
// app/page.tsx

// Conditional import wrapper to avoid webpack issues
function StockHeatmapWrapper() {
  const [Component, setComponent] =
    React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    import("@/components/StockHeatmap")
      .then((mod) => {
        setComponent(() => mod.default);
      })
      .catch((err) => {
        console.error("Failed to load StockHeatmap:", err);
      });
  }, []);

  if (!Component) {
    return <div>Loading heatmap...</div>;
  }

  return <Component />;
}

// In HomePage component
{
  showHeatmapSection && (
    <section className="heatmap-section">
      <StockHeatmapWrapper />
    </section>
  );
}
```

---

## Záver

Heatmapa je implementovaná ako **unified treemap** s pokročilými algoritmami pre optimalizáciu layoutu:

- ✅ **Sublinear scaling** - stlačí veľké sektory
- ✅ **Clamping** - zabezpečí čitateľnosť
- ✅ **Squarified algorithm** - optimálne pomery strán
- ✅ **OTHER bucket** - zoskupenie malých položiek
- ✅ **Drill-down** - zoom na sektor
- ✅ **Dynamic labels** - text len pre veľké bloky
- ✅ **Full-bleed layout** - celá šírka viewportu
- ✅ **3 layout modes** - proportional, balanced, log-scale

Všetko je implementované v TypeScript s React hooks pre optimalizáciu výkonu.

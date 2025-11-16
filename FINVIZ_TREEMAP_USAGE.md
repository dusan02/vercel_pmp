# Finviz-Style Treemap - Použitie

## Prehľad

`calculateFinvizTreemap()` vytvára hierarchický treemap layout:
- **Sektory** → rozložené podľa marketCap (squarify)
- **Industries** → rozložené podľa marketCap v rámci sektora (squarify)
- **Stocks** → rozložené podľa marketCap v rámci industry (squarify)

## Základné použitie

```typescript
import { calculateFinvizTreemap, type SectorGroup, type StockData } from '@/lib/finvizTreemap';

// Vstupné dáta z API
const sectorGroups: SectorGroup[] = [
  {
    sector: "Technology",
    totalMarketCap: 15000.5,
    stocks: [
      { ticker: "AAPL", marketCap: 4067.19, sector: "Technology", industry: "Consumer Electronics", changePercent: 2.16 },
      { ticker: "MSFT", marketCap: 3780.7, sector: "Technology", industry: "Software", changePercent: 0.53 },
      // ...
    ]
  },
  // ...
];

// Výpočet layoutu
const result = calculateFinvizTreemap(
  sectorGroups,
  1200,  // containerWidth
  800,   // containerHeight
  {
    sectorGap: 2,
    industryGap: 2,
    minIndustryWidth: 80,
    minIndustryHeight: 60,
    targetAspect: 1.7
  }
);

// Výsledok obsahuje:
// - result.sectors[] - layout pre každý sektor
// - result.allNodes[] - flat list všetkých stock nodes pre renderovanie
```

## Integrácia s API

```typescript
// V komponente alebo API route
const response = await fetch('/api/heatmap/treemap');
const apiData = await response.json();

if (apiData.success) {
  // Transformovať API dáta na SectorGroup[]
  const sectorGroups: SectorGroup[] = apiData.data.sectors.map((sector: any) => ({
    sector: sector.sector,
    totalMarketCap: sector.totalMarketCap,
    stocks: sector.stocks.map((stock: any) => ({
      ticker: stock.ticker,
      marketCap: stock.marketCap,
      sector: stock.sector,
      industry: stock.industry,
      changePercent: stock.percentChange,
      name: stock.name,
      currentPrice: stock.currentPrice,
      sharesOutstanding: stock.sharesOutstanding
    }))
  }));
  
  // Vypočítať layout
  const layout = calculateFinvizTreemap(sectorGroups, 1200, 800);
  
  // Použiť layout pre renderovanie
  return layout;
}
```

## Renderovanie v React komponente

```typescript
import { calculateFinvizTreemap } from '@/lib/finvizTreemap';

function FinvizHeatmap({ sectorGroups }: { sectorGroups: SectorGroup[] }) {
  const layout = useMemo(() => {
    return calculateFinvizTreemap(sectorGroups, 1200, 800);
  }, [sectorGroups]);
  
  const getColor = (changePercent: number) => {
    if (changePercent >= 3) return "rgb(48,204,90)";
    if (changePercent >= 2) return "rgb(47,158,79)";
    if (changePercent >= 1) return "rgb(53,118,78)";
    if (changePercent >= 0.5) return "rgb(55,100,75)";
    if (changePercent > 0) return "rgb(58,85,80)";
    if (changePercent === 0) return "rgb(65,69,84)";
    if (changePercent > -0.5) return "rgb(85,68,78)";
    if (changePercent > -1) return "rgb(105,68,78)";
    if (changePercent > -2) return "rgb(139,68,78)";
    if (changePercent > -3) return "rgb(191,64,69)";
    return "rgb(246,53,56)";
  };
  
  return (
    <svg width={1200} height={800}>
      {layout.allNodes.map((node, i) => (
        <rect
          key={i}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          fill={getColor(node.data.changePercent)}
          stroke="#333"
          strokeWidth={1}
        />
      ))}
      
      {/* Labels */}
      {layout.allNodes
        .filter(node => node.width * node.height > 1000)
        .map((node, i) => (
          <text
            key={`label-${i}`}
            x={node.x + node.width / 2}
            y={node.y + node.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={12}
          >
            {node.data.ticker}
          </text>
        ))}
    </svg>
  );
}
```

## Možnosti konfigurácie

```typescript
interface FinvizLayoutOpts {
  containerWidth?: number;      // Šírka kontajnera (default: 1200)
  containerHeight?: number;     // Výška kontajnera (default: 800)
  sectorGap?: number;           // Medzera medzi sektormi (default: 2)
  industryGap?: number;         // Medzera medzi industry blokmi (default: 2)
  minIndustryWidth?: number;    // Minimálna šírka industry bloku (default: 80)
  minIndustryHeight?: number;   // Minimálna výška industry bloku (default: 60)
  targetAspect?: number;        // Cieľový pomer strán pre squarify (default: 1.7)
  minCellSize?: number;         // Minimálna veľkosť bunky (default: 12)
}
```

## Optimalizácie

### 1. Ochrana pred "nudľami"
Algoritmus automaticky detekuje príliš úzke alebo vysoké industry bloky (aspect ratio > 4) a rozdelí ich na 2 stĺpce alebo riadky.

### 2. Minimálne rozmery
Industry bloky menšie ako `minIndustryWidth` x `minIndustryHeight` sú preskočené (môžu byť zobrazené v "OTHER" skupine).

### 3. Automatické zväčšovanie fontu
Pre veľké spoločnosti (marketCap > X% sektora) môžeš automaticky zväčšiť font:

```typescript
const fontSize = node.width * node.height > 5000 
  ? 16 
  : node.width * node.height > 2000 
    ? 14 
    : 12;
```

## Výstupná štruktúra

```typescript
interface FinvizTreemapResult {
  sectors: SectorLayout[];      // Layout pre každý sektor
  allNodes: StockNode[];        // Flat list všetkých nodes
}

interface SectorLayout {
  sector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  industries: IndustryLayout[]; // Industries v sektore
  stocks: StockNode[];          // Všetky stocks v sektore
}

interface IndustryLayout {
  industry: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  stocks: StockNode[];          // Stocks v industry
}

interface StockNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: StockData;              // Originálne dáta
  sector: string;
  industry: string;
}
```

## Porovnanie s unifiedTreemap

| Vlastnosť | unifiedTreemap | finvizTreemap |
|-----------|----------------|---------------|
| Hierarchia | Sector → Industry → Stocks (vertikálne) | Sector → Industry → Stocks (squarify) |
| Layout sektorov | Zľava doprava (fixed width) | Squarify (proporcionálne) |
| Layout industries | Vertikálne pásy | Squarify (proporcionálne) |
| Layout stocks | Squarify | Squarify |
| Optimalizácia | Narrow sectors → 2 bands | Narrow industries → 2 bands/rows |
| Použitie | Jednoduchý vertikálny layout | Finviz-style packovaný layout |

## Príklady použitia

### 1. Základný heatmap
```typescript
const layout = calculateFinvizTreemap(sectorGroups, 1200, 800);
// Renderuj všetky nodes
```

### 2. Zoom do sektora
```typescript
const sectorLayout = layout.sectors.find(s => s.sector === 'Technology');
// Renderuj len stocks z tohto sektora
```

### 3. Zoom do industry
```typescript
const sectorLayout = layout.sectors.find(s => s.sector === 'Technology');
const industryLayout = sectorLayout.industries.find(i => i.industry === 'Semiconductors');
// Renderuj len stocks z tejto industry
```


# Finviz-Style Treemap - Implementácia

## ✅ Čo bolo implementované

### 1. Hlavný algoritmus (`src/lib/finvizTreemap.ts`)

**Funkcia:** `calculateFinvizTreemap()`

**Hierarchia:**
1. **Sektory** → rozložené podľa `marketCap` pomocou squarify algoritmu
2. **Industries** → rozložené podľa `marketCap` v rámci každého sektora (squarify)
3. **Stocks** → rozložené podľa `marketCap` v rámci každej industry (squarify)

**Kľúčové funkcie:**
- `groupByIndustry()` - zoskupí stocks podľa industry v rámci sektora
- `squarifyGroups()` - generický squarify algoritmus pre sektory/industries
- `calculateFinvizTreemap()` - hlavná funkcia, ktorá koordinuje celý proces

### 2. Optimalizácie

#### Ochrana pred "nudľami"
- Automaticky detekuje industry bloky s aspect ratio > 4
- Rozdelí ich na 2 stĺpce (ak sú príliš vysoké) alebo 2 riadky (ak sú príliš široké)

#### Minimálne rozmery
- Industry bloky menšie ako `minIndustryWidth` x `minIndustryHeight` sú preskočené
- Môžu byť zobrazené v "OTHER" skupine (ak je implementovaná)

#### Gap medzi blokmi
- Konfigurovateľné medzery medzi sektormi (`sectorGap`)
- Konfigurovateľné medzery medzi industries (`industryGap`)

### 3. Exportované typy a funkcie

Z `unifiedTreemap.ts`:
- `export function squarifyStocks()` - squarify algoritmus pre stocks
- `export type Rect` - obdĺžniková štruktúra
- `export type HeatItem` - štruktúra pre heatmap items

Z `finvizTreemap.ts`:
- `export function calculateFinvizTreemap()` - hlavná funkcia
- Všetky TypeScript interfaces pre typovú bezpečnosť

## 📊 Štruktúra dát

### Vstupné dáta
```typescript
SectorGroup[] = [
  {
    sector: "Technology",
    totalMarketCap: 15000.5,
    stocks: [
      {
        ticker: "AAPL",
        marketCap: 4067.19,
        sector: "Technology",
        industry: "Consumer Electronics",
        changePercent: 2.16
      },
      // ...
    ]
  }
]
```

### Výstupné dáta
```typescript
FinvizTreemapResult = {
  sectors: SectorLayout[],  // Layout pre každý sektor
  allNodes: StockNode[]     // Flat list pre renderovanie
}
```

## 🔧 Konfigurácia

```typescript
interface FinvizLayoutOpts {
  containerWidth?: number;      // default: 1200
  containerHeight?: number;    // default: 800
  sectorGap?: number;          // default: 2
  industryGap?: number;        // default: 2
  minIndustryWidth?: number;   // default: 80
  minIndustryHeight?: number;  // default: 60
  targetAspect?: number;      // default: 1.7
  minCellSize?: number;        // default: 12
}
```

## 📝 Príklad použitia

```typescript
import { calculateFinvizTreemap } from '@/lib/finvizTreemap';

// Získať dáta z API
const response = await fetch('/api/heatmap/treemap');
const apiData = await response.json();

// Transformovať na SectorGroup[]
const sectorGroups = apiData.data.sectors.map(sector => ({
  sector: sector.sector,
  totalMarketCap: sector.totalMarketCap,
  stocks: sector.stocks.map(stock => ({
    ticker: stock.ticker,
    marketCap: stock.marketCap,
    sector: stock.sector,
    industry: stock.industry,
    changePercent: stock.percentChange
  }))
}));

// Vypočítať layout
const layout = calculateFinvizTreemap(sectorGroups, 1200, 800);

// Renderovať
layout.allNodes.forEach(node => {
  // Vykresliť obdĺžnik na pozícii node.x, node.y
  // s rozmermi node.width x node.height
  // s farbou podľa node.data.changePercent
});
```

## 🎯 Rozdiel oproti unifiedTreemap

| Vlastnosť | unifiedTreemap | finvizTreemap |
|-----------|----------------|---------------|
| **Layout sektorov** | Zľava doprava (fixed width) | Squarify (proporcionálne) |
| **Layout industries** | Vertikálne pásy | Squarify (proporcionálne) |
| **Layout stocks** | Squarify | Squarify |
| **Optimalizácia** | Narrow sectors → 2 bands | Narrow industries → 2 bands/rows |
| **Výsledok** | Vertikálny layout | Packovaný Finviz-style layout |

## 📚 Súbory

1. **`src/lib/finvizTreemap.ts`** - Hlavná implementácia
2. **`FINVIZ_TREEMAP_USAGE.md`** - Dokumentácia použitia
3. **`HEATMAP_DATA_SAMPLE.json`** - Ukážka dát
4. **`HEATMAP_DATA_STRUCTURE.md`** - Štruktúra dát
5. **`HEATMAP_FINVIZ_LAYOUT_TYPES.ts`** - TypeScript typy
6. **`src/lib/__tests__/finvizTreemap.test.ts`** - Testy

## 🚀 Ďalšie kroky

1. **Integrácia do komponenty** - Vytvoriť React komponent, ktorý používa `calculateFinvizTreemap()`
2. **Renderovanie** - Implementovať SVG alebo Canvas renderovanie
3. **Interaktivita** - Pridať hover, click, zoom funkcionalitu
4. **Optimalizácia** - Testovať výkon s veľkým počtom stocks
5. **Vizuálne vylepšenia** - Farba podľa changePercent, font size podľa marketCap

## ✅ Testovanie

```bash
# Spustiť testy
npm test finvizTreemap

# Alebo manuálne testovať v komponente
```

## 📖 Referencie

- **Squarify algoritmus:** Bruls et al. 2000 - "Squarified Treemaps"
- **Finviz heatmap:** https://finviz.com/map.ashx
- **D3.js treemap:** https://github.com/d3/d3-hierarchy#treemap


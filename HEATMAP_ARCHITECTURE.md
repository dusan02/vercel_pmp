# 📊 Architektúra Heatmapy - Detailný Prehľad

## 🏗️ Štruktúra a Rozdelenie Blokov

### 1. Hierarchická Štruktúra Dát

Heatmapa používa **D3 Treemap** algoritmus na rozdelenie plochy na bloky:

```
ROOT (Market)
├── SECTOR 1 (Technology)
│   ├── COMPANY 1 (AAPL)
│   ├── COMPANY 2 (MSFT)
│   └── ...
├── SECTOR 2 (Healthcare)
│   ├── COMPANY 1 (JNJ)
│   └── ...
└── ...
```

**Hierarchia:**
- **Depth 0**: ROOT (Market) - celá plocha
- **Depth 1**: SECTORS (Technology, Healthcare, atď.) - zoskupené bloky
- **Depth 2+**: COMPANIES (AAPL, MSFT, atď.) - jednotlivé dlaždice

### 2. Výpočet Veľkosti Blokov

**Metrika pre veľkosť dlaždice:**
- `metric === 'percent'`: Používa `marketCap` (trhová kapitalizácia)
- `metric === 'mcap'`: Používa `marketCapDiffAbs` (absolútna hodnota zmeny market cap)

**Algoritmus:**
1. D3 `treemap()` generátor rozdelí plochu podľa `value` (marketCap)
2. Používa `treemapSquarify` algoritmus pre "štvorcovejší" layout
3. Veľké spoločnosti = väčšie bloky
4. Malé spoločnosti = menšie bloky

### 3. Padding a Medzery

**Konfigurácia medzier:**
```typescript
SECTOR_GAP = 1px  // Medzera medzi sektormi (čierna farba)
```

**Padding podľa depth:**
- `depth === 1` (Sektory): `SECTOR_GAP` (1px medzera)
- `depth >= 2` (Firmy): `0px` (žiadne medzery)

**Výsledok:**
- Sektory sú vizuálne oddelené 1px čiernou medzerou
- Firmy v rámci sektora sú tesne vedľa seba

### 4. Zoradenie a Organizácia

**Zoradenie firiem:**
- V rámci každého sektora: podľa `value` (marketCap) **DESC** (najväčšie prvé)
- Sektory: podľa sumy `value` **DESC**, ale "Unknown" sektor je vždy posledný

**Výsledok:**
- Najväčšie spoločnosti sú vľavo/hore
- Najmenšie spoločnosti sú vpravo/dole

## 🎨 Logika Zobrazenia

### 1. Farebná Škála

**Farba dlaždice = percentuálna zmena ceny:**
- **Červená** = negatívna zmena (pokles)
- **Zelená** = pozitívna zmena (rast)

**Timeframe škály:**
- `day`: -5% až +5%
- `week`: -10% až +10%
- `month`: -20% až +20%

**Implementácia:**
```typescript
const colorScale = createHeatmapColorScale(timeframe);
const tileColor = colorScale(company.changePercent);
```

### 2. Textové Labely

**Konfigurácia podľa veľkosti dlaždice:**

| Plocha (px²) | Zobrazenie |
|--------------|------------|
| < 160 | Bez textu (iba farba) |
| 160 - 2,500 | Len ticker (7-10px font) |
| 2,500 - 5,000 | Len ticker (10-14px font) |
| 5,000 - 10,000 | Ticker + % change (14-20px font) |
| > 10,000 | Ticker + % change (max font) |

**Algoritmus:**
- `getTileLabelConfig(widthPx, heightPx)` vypočíta konfiguráciu
- Používa logaritmickú škálu pre plynulejší prechod
- Font sa úmerne zmenšuje s plochou

### 3. Renderovanie

**Dva módy renderovania:**

#### A) Canvas Mode (predvolený, rýchlejší)
- `CanvasHeatmap` komponent
- Vykresľuje všetky dlaždice naraz na `<canvas>`
- Lepšia výkonnosť pre veľké množstvo dát
- Tooltip cez mouse event handling

#### B) DOM Mode (pomalší, ale flexibilnejší)
- `HeatmapTile` komponenty pre každú dlaždicu
- Každá dlaždica je samostatný `<div>`
- Lepšie pre interaktívne funkcie
- Progressive loading (50 → 150 → 250... dlaždíc)

**Výber módu:**
```typescript
const [renderMode, setRenderMode] = useState<'dom' | 'canvas'>('canvas');
```

### 4. Skálovanie a Pozícia

**Scale výpočet:**
```typescript
const scaleX = width / treemapBounds.treemapWidth;
const scaleY = height / treemapBounds.treemapHeight;
const scale = Math.min(scaleX, scaleY); // Menšia škála = zmestí sa
```

**Offset výpočet:**
```typescript
offset = {
  x: -treemapBounds.minX * scale,
  y: -treemapBounds.minY * scale
}
```

**Výsledok:**
- Heatmapa sa roztiahne na celú dostupnú plochu
- Začína od (0,0) a roztiahne sa do (width, height)

### 5. Interaktivita

**Hover:**
- Zobrazí `HeatmapTooltip` s detailmi spoločnosti
- Tooltip sa zobrazuje pri kurzore myši
- Skrytý na mobile (< 1024px)

**Click:**
- Kliknutie na dlaždicu = `onTileClick(company)`
- Kliknutie na sektor = zoom na sektor (zobrazí len firmy v sektore)

**Zoom:**
- `zoomedSector` state kontroluje, ktorý sektor je zobrazený
- Filtruje `filteredLeaves` podľa sektora
- Tlačidlo "Back to All Sectors" vráti zobrazenie všetkých sektorov

## 🔧 Kľúčové Komponenty

### 1. `MarketHeatmap.tsx`
- Hlavný komponent heatmapy
- Spravuje D3 layout, scale, offset
- Renderuje Canvas alebo DOM módy

### 2. `buildHeatmapHierarchy()` (`heatmapLayout.ts`)
- Transformuje plochý zoznam firiem na hierarchiu
- Zoskupuje podľa sektorov
- Zoraďuje podľa veľkosti

### 3. `HeatmapTile.tsx`
- Jednotlivá dlaždica (DOM mode)
- Memoizovaná pre výkon
- Zobrazuje ticker a % change podľa veľkosti

### 4. `CanvasHeatmap.tsx`
- Canvas renderer (rýchlejší)
- Vykresľuje všetky dlaždice naraz
- Mouse event handling pre tooltip

### 5. `getTileLabelConfig()` (`heatmapLabelUtils.ts`)
- Vypočíta, čo zobraziť na dlaždici
- Určuje veľkosť fontu
- Rozhoduje, či zobraziť ticker, % change, alebo nič

## 📐 Konštanty a Thresholdy

**TILE_SIZE_THRESHOLDS:**
- `MIN_AREA: 160` - minimálna plocha pre text
- `SMALL_AREA: 2500` - prechod len ticker → ticker+%
- `MEDIUM_AREA: 5000` - väčší font
- `LARGE_AREA: 10000` - maximálny font

**FONT_SIZE_CONFIG:**
- `MIN_SYMBOL_SIZE: 7px`
- `MAX_SYMBOL_SIZE: 28px`
- `MIN_PERCENT_SIZE: 7px`
- `MAX_PERCENT_SIZE: 20px`

**LAYOUT_CONFIG:**
- `SECTOR_GAP: 1px` - medzera medzi sektormi
- `SCALE_MARGIN: 0.85` - 15% okraj pri scale

## 🎯 Výkonnostné Optimalizácie

1. **Memoizácia:**
   - `useMemo` pre layout, scale, offset
   - `React.memo` pre `HeatmapTile`
   - Zaokrúhľovanie width/height na 10px pre menej recalculations

2. **Virtualizácia:**
   - Progressive loading v DOM mode (50 → 150 → 250...)
   - Filtering malých dlaždíc (< MIN_VISIBLE_AREA)

3. **Canvas Mode:**
   - Rýchlejší rendering pre veľké množstvo dát
   - Jednoduchší DOM (len jeden `<canvas>` element)

## 🔄 Data Flow

```
CompanyNode[] (vstupné dáta)
  ↓
buildHeatmapHierarchy() → HierarchyData (hierarchia)
  ↓
D3 hierarchy() → D3 HierarchyNode
  ↓
D3 treemap() → TreemapLeaf[] (pozície a rozmery)
  ↓
CanvasHeatmap / HeatmapTile[] → Renderovanie
  ↓
HeatmapTooltip (pri hover)
```

## 📝 Poznámky

- **Sektory** sú vizuálne oddelené 1px čiernou medzerou
- **Firmy** v rámci sektora sú tesne vedľa seba (0px medzera)
- **Veľkosť dlaždice** = marketCap (alebo marketCapDiffAbs pre mcap metric)
- **Farba dlaždice** = changePercent (červená/zelená)
- **Text** sa zobrazuje len ak je dlaždica dostatočne veľká
- **Zoom** funguje cez filtrovanie `filteredLeaves` podľa sektora


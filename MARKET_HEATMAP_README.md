# Market Heatmap - Dokumentácia

## Prehľad

Nová interaktívna heatmapa akciového trhu používa D3.js treemap algoritmus na vizualizáciu akcií zoskupených podľa sektorov a odvetví. Veľkosť každého bloku reprezentuje **market cap** (trhovú kapitalizáciu), farba reprezentuje **percentuálnu zmenu ceny**.

## Hlavné funkcie

### ✅ Implementované

1. **D3 Treemap Layout**
   - Hierarchická štruktúra: Sektory → Industries → Companies
   - Squarified algoritmus pre optimálne pomery strán
   - Automatické padding a spacing

2. **Zoom na Sektory**
   - Kliknutie na sektor zobrazí iba akcie z tohto sektora
   - Tlačidlo "Back to All Sectors" pre návrat
   - Hover efekt na sektoroch

3. **Timeframe Prepínanie**
   - Prepínanie medzi Day/Week/Month
   - Animácia farieb pri zmene timeframe
   - Rôzne farebné škály pre rôzne timeframy

4. **Interaktívne prvky**
   - Tooltip s detailnými informáciami pri hoveri
   - Kliknutie na dlaždicu spustí callback
   - Responzívny dizajn s ResizeObserver

5. **API Integrácia**
   - Integrácia s `/api/stocks` endpointom
   - Automatické obnovovanie dát
   - Fallback na `/api/stocks/optimized` ak je potrebné

## Použitie

### Základné použitie

```tsx
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';

export default function MyPage() {
  return (
    <div className="h-screen w-screen">
      <ResponsiveMarketHeatmap
        apiEndpoint="/api/stocks"
        autoRefresh={true}
        refreshInterval={60000}
        initialTimeframe="day"
      />
    </div>
  );
}
```

### S vlastným handlerom

```tsx
import ResponsiveMarketHeatmap from '@/components/ResponsiveMarketHeatmap';
import { CompanyNode } from '@/components/MarketHeatmap';

export default function MyPage() {
  const handleTileClick = (company: CompanyNode) => {
    console.log('Clicked:', company.symbol);
    // Vlastná logika, napr. navigácia
    router.push(`/stocks/${company.symbol}`);
  };

  return (
    <div className="h-screen w-screen">
      <ResponsiveMarketHeatmap
        apiEndpoint="/api/stocks"
        onTileClick={handleTileClick}
        autoRefresh={true}
        refreshInterval={60000}
      />
    </div>
  );
}
```

### Priamy prístup k MarketHeatmap komponentu

```tsx
import { MarketHeatmap, useElementResize } from '@/components/MarketHeatmap';
import { CompanyNode } from '@/components/MarketHeatmap';

export default function MyPage() {
  const { ref, size } = useElementResize();
  const [data, setData] = useState<CompanyNode[]>([]);

  // Načítaj dáta...

  return (
    <div ref={ref} className="h-full w-full">
      <MarketHeatmap
        data={data}
        width={size.width}
        height={size.height}
        timeframe="day"
        onTimeframeChange={(tf) => console.log('Changed to:', tf)}
      />
    </div>
  );
}
```

## Komponenty

### `MarketHeatmap`

Hlavný komponent pre renderovanie heatmapy.

**Props:**
- `data: CompanyNode[]` - Zoznam spoločností
- `width: number` - Šírka v pixeloch
- `height: number` - Výška v pixeloch
- `onTileClick?: (company: CompanyNode) => void` - Callback pri kliknutí
- `timeframe?: 'day' | 'week' | 'month'` - Aktuálny timeframe
- `onTimeframeChange?: (timeframe) => void` - Callback pri zmene timeframe

### `ResponsiveMarketHeatmap`

Wrapper komponent, ktorý poskytuje:
- Responzívnu veľkosť (ResizeObserver)
- Načítanie dát z API
- Automatické obnovovanie

**Props:**
- `apiEndpoint?: string` - API endpoint (default: `/api/stocks`)
- `onTileClick?: (company: CompanyNode) => void` - Callback pri kliknutí
- `autoRefresh?: boolean` - Automatické obnovovanie (default: `true`)
- `refreshInterval?: number` - Interval v ms (default: `60000`)
- `initialTimeframe?: 'day' | 'week' | 'month'` - Počiatočný timeframe

### `useElementResize`

Custom hook pre sledovanie veľkosti elementu.

```tsx
const { ref, size } = useElementResize();

return <div ref={ref}>...</div>;
// size.width a size.height sa automaticky aktualizujú
```

## Typy

### `CompanyNode`

```typescript
type CompanyNode = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  changePercent: number;
};
```

## Farebné škály

Heatmapa používa rôzne farebné škály pre rôzne timeframy:

- **Day**: `-5%` až `+5%` (jemná škála)
- **Week**: `-10%` až `+10%` (stredná škála)
- **Month**: `-20%` až `+20%` (široká škála)

Farby:
- Červená: Pokles (decline)
- Šedá: Neutrálna (0%)
- Zelená: Rast (growth)

## Testovacia stránka

Testovacia stránka je dostupná na: `/heatmap`

```bash
# Spustite aplikáciu
npm run dev

# Otvorte v prehliadači
http://localhost:3000/heatmap
```

## Vylepšenia pre budúcnosť

Možné rozšírenia:

1. **Animácie pri zmene dát**
   - Smooth transitions pri aktualizácii
   - Fade in/out pre nové/odstránené akcie

2. **Filtrovanie**
   - Filtrovanie podľa sektora
   - Filtrovanie podľa percentuálnej zmeny
   - Vyhľadávanie

3. **Export**
   - Export do PNG/SVG
   - Export dát do CSV

4. **Viac interaktivity**
   - Drag & drop pre reorganizáciu
   - Custom color schemes
   - Viac layout algoritmov

## Technické detaily

### D3 Hierarchia

Heatmapa používa D3 hierarchy na vytvorenie hierarchickej štruktúry:

```
Root (Market)
├── Sector 1 (Technology)
│   ├── Industry 1 (Software)
│   │   ├── Company 1 (AAPL)
│   │   └── Company 2 (MSFT)
│   └── Industry 2 (Semiconductors)
│       └── Company 3 (NVDA)
└── Sector 2 (Financial)
    └── ...
```

### Performance

- `useMemo` pre optimalizáciu výpočtov layoutu
- `useCallback` pre optimalizáciu event handlerov
- ResizeObserver pre efektívne sledovanie veľkosti
- Lazy rendering pre veľké datasety

### Dependencies

- `d3-hierarchy` - Pre treemap layout
- `d3-scale` - Pre farebné škály
- React hooks - Pre state management

## Riešenie problémov

### Heatmapa sa nezobrazuje

1. Skontrolujte, či API endpoint vracia správne dáta
2. Skontrolujte konzolu prehliadača pre chyby
3. Uistite sa, že `width` a `height` sú > 0

### Chýbajú sektory/industries

1. Uistite sa, že API vracia `sector` a `industry` v dátach
2. Skontrolujte, či používate správny endpoint (`/api/stocks` namiesto `/api/stocks/optimized`)

### Pomalé renderovanie

1. Znížte počet načítaných akcií (limit)
2. Skontrolujte, či nie sú príliš veľké animácie
3. Použite React DevTools Profiler na identifikáciu problémov

## Príklady

Pozri `src/app/heatmap/page.tsx` pre kompletný príklad použitia.


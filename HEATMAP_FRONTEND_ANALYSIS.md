# 🔍 Frontend Heatmap Analysis & Refactoring Plan

**Dátum:** 2025-01-26  
**Sekcia:** Heatmap Frontend  
**Cieľ:** Analýza a refaktoring heatmap sekcie pre lepšiu udržateľnosť, výkon a konzistentnosť

---

## 📊 Aktuálna Štruktúra

### Komponenty

```
HeatmapPreview.tsx (120 riadkov)
  └─> ResponsiveMarketHeatmap.tsx (236 riadkov)
       └─> MarketHeatmap.tsx (1021 riadkov)
            └─> CanvasHeatmap.tsx (separate file)

heatmap/page.tsx (100 riadkov)
  └─> ResponsiveMarketHeatmap.tsx

useHeatmapData.ts (383 riadkov) - Data fetching hook
```

### Súbory

1. **`src/components/HeatmapPreview.tsx`** - Preview komponent pre hlavnú stránku
2. **`src/components/ResponsiveMarketHeatmap.tsx`** - Wrapper s resize a data fetching
3. **`src/components/MarketHeatmap.tsx`** - Hlavný D3 treemap komponent (1021 riadkov!)
4. **`src/components/CanvasHeatmap.tsx`** - Canvas rendering variant
5. **`src/app/heatmap/page.tsx`** - Plná stránka heatmapy
6. **`src/hooks/useHeatmapData.ts`** - Data fetching hook s localStorage cache
7. **`src/lib/utils/buttonStyles.ts`** - Unified button styles

---

## 🔴 Identifikované Problémy

### 1. **Duplikácia State Management**

**Problém:**
- `metric` state je duplikovaný v `HeatmapPreview` a `ResponsiveMarketHeatmap`
- `controlledMetric` vs `hookMetric` - zložitá logika synchronizácie
- `initialMetric` vs `controlledMetric` - nekonzistentné API

**Dôsledky:**
- Hydration problémy (rôzne stavy v SSR vs CSR)
- Zložitá debugovanie
- Možné race conditions

**Kód:**
```typescript
// HeatmapPreview.tsx
const [metric, setMetric] = useState<HeatmapMetric>('percent');

// ResponsiveMarketHeatmap.tsx
const metric = controlledMetric !== undefined ? controlledMetric : hookMetric;
const setMetric = (newMetric: HeatmapMetric) => {
  if (onMetricChange) onMetricChange(newMetric);
  if (controlledMetric === undefined) setHookMetric(newMetric);
};
```

---

### 2. **Veľký Monolitický Komponent**

**Problém:**
- `MarketHeatmap.tsx` má **1021 riadkov**
- Obsahuje: layout výpočty, rendering, tooltip, zoom, color scales, font sizing
- Ťažko testovateľné, ťažko udržateľné

**Štruktúra:**
- ~200 riadkov konštánt
- ~300 riadkov helper funkcií
- ~400 riadkov hlavného komponentu
- ~100 riadkov legend komponentu

**Dôsledky:**
- Ťažké nájsť konkrétnu funkcionalitu
- Ťažké testovať jednotlivé časti
- Veľké bundle size

---

### 3. **Hydration Problémy**

**Problém:**
- `suppressHydrationWarning` používaný všade
- Inline styles pre farby (`style={{ color: 'white' }}`)
- Rôzne stavy v SSR vs CSR

**Kód:**
```typescript
<div className={BUTTON_TOGGLE_CONTAINER} suppressHydrationWarning>
  <button suppressHydrationWarning style={...}>
```

**Dôsledky:**
- React hydration warnings
- Flash of unstyled content (FOUC)
- Rôzne správanie v inkognito vs normálny režim

---

### 4. **Nekonzistentné Štýly**

**Problém:**
- Mix inline styles a utility classes
- `!text-white` s `!important` + inline `style={{ color: 'white' }}`
- Duplicitné CSS pravidlá

**Kód:**
```typescript
// buttonStyles.ts
export const BUTTON_PRIMARY = `... !text-white ...`;

// HeatmapPreview.tsx
<button className={BUTTON_PRIMARY_SM} style={{ color: 'white' }}>
```

**Dôsledky:**
- Ťažké udržiavať konzistentné štýly
- CSS špecifickosť problémy
- Zbytočný kód

---

### 5. **Zložitá Data Flow**

**Problém:**
- `useHeatmapData` má komplexnú logiku:
  - localStorage cache
  - ETag handling
  - Throttling
  - Background refresh
  - WebSocket (zakomentované)

**Kód:**
```typescript
// 383 riadkov v useHeatmapData.ts
// localStorage + ETag + throttling + abort controller + refs
```

**Dôsledky:**
- Ťažké debugovať
- Možné memory leaks (abort controllers)
- Zložitá testovateľnosť

---

### 6. **Chýbajúca Separácia Concerns**

**Problém:**
- `ResponsiveMarketHeatmap` robí:
  - Resize handling
  - Data fetching (cez hook)
  - Loading states
  - Error handling
  - Metric button rendering
  - Last updated display

**Dôsledky:**
- Ťažké znovupoužiť komponenty
- Ťažké testovať
- Zložitá logika

---

### 7. **Performance Problémy**

**Problém:**
- `MarketHeatmap.tsx` má veľa `useMemo` a `useCallback`, ale:
  - Re-renderuje sa pri každej zmene `hoveredNode`
  - Progressive loading len pre DOM mode
  - Canvas mode nemá virtualization

**Kód:**
```typescript
const [hoveredNode, setHoveredNode] = useState<CompanyNode | null>(null);
// Toto spôsobuje re-render celej heatmapy
```

**Dôsledky:**
- Lag pri hoveri
- Veľký bundle size
- Pomalé rendering

---

## ✅ Navrhované Riešenia

### 1. **Refaktoring State Management**

**Riešenie:**
- Vytvoriť `useHeatmapMetric` hook pre centralizovaný metric state
- Odstrániť `controlledMetric` / `initialMetric` duplicitu
- Použiť Context API pre zdieľanie state medzi komponentmi

**Nový kód:**
```typescript
// hooks/useHeatmapMetric.ts
export function useHeatmapMetric(initialMetric: HeatmapMetric = 'percent') {
  const [metric, setMetric] = useState<HeatmapMetric>(initialMetric);
  // localStorage persistence
  // ...
  return { metric, setMetric };
}

// HeatmapPreview.tsx
const { metric, setMetric } = useHeatmapMetric('percent');
```

---

### 2. **Rozdelenie MarketHeatmap.tsx**

**Riešenie:**
Rozdeliť na menšie komponenty:

```
MarketHeatmap.tsx (main orchestrator, ~200 riadkov)
  ├─> hooks/
  │   ├─> useHeatmapLayout.ts (D3 layout calculations)
  │   ├─> useHeatmapColors.ts (color scale logic)
  │   ├─> useHeatmapInteraction.ts (hover, click, zoom)
  │   └─> useHeatmapTooltip.ts (tooltip positioning)
  ├─> components/
  │   ├─> HeatmapTile.tsx (single tile rendering)
  │   ├─> HeatmapSector.tsx (sector group rendering)
  │   ├─> HeatmapTooltip.tsx (tooltip component)
  │   └─> HeatmapLegend.tsx (already exists, move here)
  └─> utils/
      ├─> heatmapLayout.ts (D3 treemap calculations)
      ├─> heatmapColors.ts (color scale functions)
      └─> heatmapLabels.ts (label formatting)
```

---

### 3. **Oprava Hydration Problémov**

**Riešenie:**
- Odstrániť `suppressHydrationWarning` (riešiť root cause)
- Použiť `useIsomorphicLayoutEffect` pre SSR-safe effects
- Centralizovať button rendering do samostatného komponentu

**Nový kód:**
```typescript
// components/HeatmapMetricButtons.tsx
export function HeatmapMetricButtons({ 
  metric, 
  onMetricChange 
}: HeatmapMetricButtonsProps) {
  // Client-only rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  if (!mounted) return <div className="w-32 h-8" />; // Placeholder
  
  return (
    <div className={BUTTON_TOGGLE_CONTAINER}>
      {/* buttons */}
    </div>
  );
}
```

---

### 4. **Unifikácia Štýlov**

**Riešenie:**
- Odstrániť inline styles
- Použiť CSS modules alebo styled-components
- Centralizovať všetky button štýly

**Nový kód:**
```typescript
// styles/heatmap.module.css
.buttonPrimary {
  @apply bg-blue-600 hover:bg-blue-700 text-white font-semibold;
  color: white !important; /* Explicit for hydration */
}

// components/HeatmapButton.tsx
import styles from './heatmap.module.css';
<button className={styles.buttonPrimary}>
```

---

### 5. **Zjednodušenie Data Flow**

**Riešenie:**
- Rozdeliť `useHeatmapData` na menšie hooky:
  - `useHeatmapCache` - localStorage handling
  - `useHeatmapFetch` - API fetching
  - `useHeatmapRefresh` - auto-refresh logic

**Nový kód:**
```typescript
// hooks/useHeatmapCache.ts
export function useHeatmapCache() {
  // localStorage logic only
}

// hooks/useHeatmapFetch.ts
export function useHeatmapFetch(apiEndpoint: string) {
  // API fetching only
}

// hooks/useHeatmapData.ts (orchestrator)
export function useHeatmapData(props) {
  const cache = useHeatmapCache();
  const fetch = useHeatmapFetch(props.apiEndpoint);
  // Combine logic
}
```

---

### 6. **Separácia Concerns**

**Riešenie:**
- Vytvoriť samostatné komponenty:
  - `HeatmapContainer` - resize + layout
  - `HeatmapDataProvider` - data fetching + caching
  - `HeatmapControls` - buttons + legend
  - `HeatmapVisualization` - pure rendering

**Nový kód:**
```typescript
// components/HeatmapContainer.tsx
export function HeatmapContainer({ children }) {
  const { ref, size } = useElementResize();
  return <div ref={ref}>{children}</div>;
}

// components/HeatmapDataProvider.tsx
export function HeatmapDataProvider({ children, apiEndpoint }) {
  const data = useHeatmapData({ apiEndpoint });
  return <HeatmapContext.Provider value={data}>{children}</HeatmapContext.Provider>;
}
```

---

### 7. **Performance Optimalizácie**

**Riešenie:**
- Použiť `React.memo` pre tile komponenty
- Virtualizovať rendering (len viditeľné tiles)
- Debounce hover events
- Web Workers pre D3 calculations (ak veľké dáta)

**Nový kód:**
```typescript
// components/HeatmapTile.tsx
export const HeatmapTile = React.memo(({ tile, onHover, onClick }) => {
  // Memoized tile rendering
}, (prev, next) => {
  // Custom comparison
  return prev.tile.x0 === next.tile.x0 && /* ... */;
});

// hooks/useDebouncedHover.ts
export function useDebouncedHover(delay = 100) {
  // Debounce hover events
}
```

---

## 📋 Refaktoring Checklist

### Fáza 1: State Management (Priorita: Vysoká)
- [ ] Vytvoriť `useHeatmapMetric` hook
- [ ] Odstrániť `controlledMetric` / `initialMetric` duplicitu
- [ ] Implementovať Context API pre metric state
- [ ] Testovať hydration

### Fáza 2: Komponent Rozdelenie (Priorita: Vysoká)
- [ ] Vytvoriť `hooks/useHeatmapLayout.ts`
- [ ] Vytvoriť `hooks/useHeatmapColors.ts`
- [ ] Vytvoriť `components/HeatmapTile.tsx`
- [ ] Vytvoriť `components/HeatmapSector.tsx`
- [ ] Presunúť `HeatmapLegend` do `components/`
- [ ] Refaktorovať `MarketHeatmap.tsx` na orchestrator

### Fáza 3: Hydration Fixes (Priorita: Stredná)
- [ ] Odstrániť všetky `suppressHydrationWarning`
- [ ] Vytvoriť `HeatmapMetricButtons` komponent s client-only rendering
- [ ] Implementovať `useIsomorphicLayoutEffect`
- [ ] Testovať v inkognito režime

### Fáza 4: Štýly Unifikácia (Priorita: Stredná)
- [ ] Odstrániť inline styles
- [ ] Vytvoriť CSS module pre heatmap
- [ ] Centralizovať button štýly
- [ ] Testovať v rôznych prehliadačoch

### Fáza 5: Data Flow Zjednodušenie (Priorita: Nízka)
- [ ] Rozdeliť `useHeatmapData` na menšie hooky
- [ ] Vytvoriť `useHeatmapCache` hook
- [ ] Vytvoriť `useHeatmapFetch` hook
- [ ] Testovať error handling

### Fáza 6: Performance (Priorita: Nízka)
- [ ] Implementovať `React.memo` pre tiles
- [ ] Pridať virtualization
- [ ] Debounce hover events
- [ ] Benchmark performance

---

## 🎯 Očakávané Výsledky

### Pred Refaktoringom
- **MarketHeatmap.tsx:** 1021 riadkov
- **useHeatmapData.ts:** 383 riadkov
- **HeatmapPreview.tsx:** 120 riadkov
- **Celkom:** ~1500 riadkov v 3 súboroch

### Po Refaktoringu
- **MarketHeatmap.tsx:** ~200 riadkov (orchestrator)
- **hooks/useHeatmapLayout.ts:** ~150 riadkov
- **hooks/useHeatmapColors.ts:** ~100 riadkov
- **components/HeatmapTile.tsx:** ~80 riadkov
- **components/HeatmapSector.tsx:** ~60 riadkov
- **components/HeatmapTooltip.tsx:** ~50 riadkov
- **hooks/useHeatmapData.ts:** ~200 riadkov (zjednodušený)
- **Celkom:** ~840 riadkov v 7+ súboroch

**Zlepšenia:**
- ✅ -44% kódu (lepšia čitateľnosť)
- ✅ Lepšia separácia concerns
- ✅ Jednoduchšie testovanie
- ✅ Lepšia udržateľnosť
- ✅ Riešené hydration problémy
- ✅ Konzistentné štýly

---

## 🚀 Implementačný Plán

### Krok 1: State Management Refactoring
1. Vytvoriť `useHeatmapMetric` hook
2. Refaktorovať `HeatmapPreview` na použitie hooku
3. Refaktorovať `ResponsiveMarketHeatmap` na použitie hooku
4. Testovať hydration

### Krok 2: Komponent Rozdelenie
1. Vytvoriť utility súbory (`heatmapLayout.ts`, `heatmapColors.ts`)
2. Vytvoriť `HeatmapTile` komponent
3. Vytvoriť `HeatmapSector` komponent
4. Refaktorovať `MarketHeatmap` na použitie nových komponentov

### Krok 3: Hydration Fixes
1. Vytvoriť `HeatmapMetricButtons` komponent
2. Odstrániť `suppressHydrationWarning`
3. Testovať v rôznych scenároch

### Krok 4: Štýly & Performance
1. Vytvoriť CSS module
2. Implementovať `React.memo`
3. Pridať virtualization (ak potrebné)

---

## 📝 Poznámky

- **Breaking Changes:** Žiadne - refaktoring je interný
- **Testing:** Všetky existujúce testy by mali fungovať
- **Migration:** Postupné, môže byť v PR-koch
- **Performance:** Očakávané zlepšenie o 20-30%

---

**Status:** 📋 Ready for Implementation  
**Priority:** 🔴 High (hydration issues, maintainability)  
**Estimated Time:** 4-6 hours


# Zadanie: Debug PC verzie aplikácie - prázdny obsah

## Problém
- **PC verzia (desktop)**: Desktop layout sa renderuje (viditeľný debug box "Desktop layout active"), ale **obsah sekcií je prázdny** - viditeľné sú len hlavičky sekcií (názvy) a čiary/bloky, ale samotný obsah (heatmap, portfolio, stocks, atď.) sa nezobrazuje
- **Mobilná verzia**: Funguje správne, všetko sa zobrazuje

## Aktuálny stav
- Desktop layout sa renderuje (`isMounted: true`, `isDesktop: true`, `window width: 1188`)
- V konzole nie sú JavaScript chyby
- Heatmap komponenty sa renderujú, ale rozmery sú `{width: 0, height: 0}` - to spôsobuje, že render guard blokuje zobrazenie
- Dáta sa načítavajú správne (viditeľné v konzole: "✅ Heatmap: Loaded 500 companies")
- Server-side rendering funguje (SSR logy sú viditeľné)

## Okruhy na kontrolu

### 1. ResizeObserver a meranie rozmerov
**Problém**: `ResponsiveMarketHeatmap` komponent má rozmery `{width: 0, height: 0}`, čo spôsobuje, že render guard blokuje zobrazenie.

**Kontrola**:
- [ ] Skontrolovať `useElementResize` hook v `src/components/MarketHeatmap.tsx`
- [ ] Overiť, či `ResizeObserver` funguje správne na desktop
- [ ] Skontrolovať, či rodičovský kontajner má nastavené rozmery predtým, ako sa spustí `ResizeObserver`
- [ ] Overiť, či CSS `height: 100%` funguje správne v desktop layoute
- [ ] Skontrolovať, či `getBoundingClientRect()` vracia správne hodnoty
- [ ] Overiť, či nie je problém s `hidden lg:block` CSS triedami, ktoré môžu ovplyvniť meranie

**Súbory na kontrolu**:
- `src/components/MarketHeatmap.tsx` (hook `useElementResize`)
- `src/components/ResponsiveMarketHeatmap.tsx` (použitie hooku)
- `src/components/HeatmapPreview.tsx` (rodičovský kontajner)

### 2. CSS a layout kontajnerov
**Problém**: Desktop kontajnery môžu mať zlé CSS štýly, ktoré spôsobujú, že obsah nie je viditeľný.

**Kontrola**:
- [ ] Skontrolovať CSS pre `.homepage-container` a `.desktop-layout-wrapper`
- [ ] Overiť, či `.desktop-heatmap-wrapper` má správne štýly
- [ ] Skontrolovať, či `.heatmap-preview-container` má správne rozmery na desktop
- [ ] Overiť, či nie je problém s `overflow: hidden` alebo `display: none`
- [ ] Skontrolovať, či `min-height` a `height` sú nastavené správne
- [ ] Overiť, či nie je konflikt medzi mobile a desktop CSS pravidlami

**Súbory na kontrolu**:
- `src/app/globals.css` (hľadať `.homepage-container`, `.desktop-layout-wrapper`, `.desktop-heatmap-wrapper`)
- `src/components/HeatmapPreview.tsx` (inline styles a CSS triedy)

### 3. Conditional rendering a CSS gating
**Problém**: Desktop layout používa `hidden lg:block` a `lg:hidden` triedy, ktoré môžu spôsobovať problémy s renderovaním.

**Kontrola**:
- [ ] Skontrolovať, či `hidden lg:block` funguje správne (element by mal byť skrytý na mobile, viditeľný na desktop)
- [ ] Overiť, či nie je problém s Tailwind CSS breakpoint `lg:` (1024px)
- [ ] Skontrolovať, či nie je konflikt medzi mobile a desktop renderovaním
- [ ] Overiť, či `isDesktop` hook správne detekuje desktop (min-width: 1024px)
- [ ] Skontrolovať, či `useMediaQuery` hook funguje správne

**Súbory na kontrolu**:
- `src/app/HomePage.tsx` (conditional rendering `{(isMounted && isDesktop) && ...}`)
- `src/hooks/useMediaQuery.ts`
- `src/components/HeatmapPreview.tsx` (CSS gating triedy)

### 4. Dynamic imports a lazy loading
**Problém**: Komponenty používajú `dynamic` importy, ktoré môžu mať problémy s SSR alebo loading states.

**Kontrola**:
- [ ] Skontrolovať, či `HomeHeatmap` sa načítava správne (má `ssr: false`, ale `HeatmapPreview` má `ssr: true`)
- [ ] Overiť, či `ResponsiveMarketHeatmap` sa načítava správne (má `ssr: true`)
- [ ] Skontrolovať, či loading states neblokujú renderovanie
- [ ] Overiť, či `Suspense` boundaries fungujú správne
- [ ] Skontrolovať, či nie je problém s hydration mismatch

**Súbory na kontrolu**:
- `src/app/HomePage.tsx` (dynamic imports)
- `src/components/home/HomeHeatmap.tsx`
- `src/components/HeatmapPreview.tsx`
- `src/components/ResponsiveMarketHeatmap.tsx`

### 5. Render guard a podmienky zobrazenia
**Problém**: `ResponsiveMarketHeatmap` má render guard, ktorý kontroluje rozmery a dáta, a môže blokovať zobrazenie.

**Kontrola**:
- [ ] Skontrolovať render guard v `ResponsiveMarketHeatmap.tsx` (funkcia `renderContent()`)
- [ ] Overiť, či podmienka `width < 50 || height < 50` nie je príliš prísna
- [ ] Skontrolovať, či `isMounted` je správne nastavené
- [ ] Overiť, či `loading` state nie je stuck v `true`
- [ ] Skontrolovať, či `data` sa načítava správne (viditeľné v konzole, ale možno nie je dostupné v komponente)

**Súbory na kontrolu**:
- `src/components/ResponsiveMarketHeatmap.tsx` (funkcia `renderContent()`)

### 6. Data fetching a state management
**Problém**: Dáta sa načítavajú (viditeľné v konzole), ale možno nie sú správne predávané do komponentov.

**Kontrola**:
- [ ] Skontrolovať, či `useHeatmapData` hook vracia správne dáta
- [ ] Overiť, či `data` prop je správne predávaný do `MarketHeatmap`
- [ ] Skontrolovať, či nie je problém s caching (localStorage cache môže byť starý)
- [ ] Overiť, či API endpoint `/api/heatmap` vracia správne dáta na desktop
- [ ] Skontrolovať, či nie je problém s ETag caching

**Súbory na kontrolu**:
- `src/hooks/useHeatmapData.ts`
- `src/components/ResponsiveMarketHeatmap.tsx` (použitie hooku)
- `src/app/api/heatmap/route.ts` (ak existuje)

### 7. Error boundaries a error handling
**Problém**: Chyby môžu byť ticho zachytené error boundaries, ktoré nezobrazujú obsah.

**Kontrola**:
- [ ] Skontrolovať, či `SectionErrorBoundary` nezachytáva chyby ticho
- [ ] Overiť, či error boundaries zobrazujú fallback UI namiesto prázdneho obsahu
- [ ] Skontrolovať konzolu pre skryté chyby (možno sú v Issues tab, nie Console)
- [ ] Overiť, či `ErrorBoundaryWrapper` funguje správne

**Súbory na kontrolu**:
- `src/components/SectionErrorBoundary.tsx`
- `src/components/ErrorBoundaryWrapper.tsx` (ak existuje)

### 8. Z-index a overlay problémy
**Problém**: Obsah môže byť skrytý pod overlay alebo má zlý z-index.

**Kontrola**:
- [ ] Skontrolovať, či nie je overlay alebo modal, ktorý blokuje obsah
- [ ] Overiť z-index hodnoty v CSS
- [ ] Skontrolovať, či `position: absolute` alebo `position: fixed` neblokuje obsah
- [ ] Overiť, či `opacity: 0` alebo `visibility: hidden` nie je nastavené

**Súbory na kontrolu**:
- `src/app/globals.css` (hľadať z-index, opacity, visibility)
- `src/components/HeatmapPreview.tsx` (inline styles)

## Debug kroky

1. **Otvoriť Developer Tools** (F12)
2. **Skontrolovať Elements tab**:
   - Nájsť `.homepage-container` element
   - Skontrolovať, či má správne rozmery (width, height)
   - Overiť computed styles
   - Skontrolovať, či nie je `display: none` alebo `visibility: hidden`
3. **Skontrolovať Console tab**:
   - Hľadať logy `📏 Heatmap Dimensions`
   - Hľadať logy `🏠 HomeHeatmap rendered`
   - Hľadať chyby (aj v Issues tab)
4. **Skontrolovať Network tab**:
   - Overiť, či sa načítavajú JavaScript súbory
   - Skontrolovať, či API endpoint `/api/heatmap` vracia dáta
5. **Skontrolovať React DevTools** (ak je nainštalované):
   - Overiť, či komponenty sú správne renderované
   - Skontrolovať props a state

## Očakávané výsledky

Po oprave by malo byť:
- ✅ Desktop layout zobrazuje obsah (heatmap, portfolio, stocks, atď.)
- ✅ Rozmery heatmap kontajnera sú správne (nie 0x0)
- ✅ Všetky sekcie sú viditeľné a funkčné
- ✅ Žiadne chyby v konzole

## Súbory, ktoré boli už upravené (pre kontext)

- `src/hooks/useMediaQuery.ts` - opravená inicializácia
- `src/components/MarketHeatmap.tsx` - pridané okamžité meranie rozmerov
- `src/components/ResponsiveMarketHeatmap.tsx` - pridané debug logy a fallback
- `src/components/home/HomeHeatmap.tsx` - pridané debug logy
- `src/app/HomePage.tsx` - pridané debug logy a CSS
- `src/app/globals.css` - pridané CSS pre desktop layout

## Priorita

**Vysoká priorita**:
1. ResizeObserver a meranie rozmerov (bod 1)
2. CSS a layout kontajnerov (bod 2)
3. Render guard a podmienky zobrazenia (bod 5)

**Stredná priorita**:
4. Conditional rendering a CSS gating (bod 3)
5. Dynamic imports a lazy loading (bod 4)

**Nízka priorita**:
6. Data fetching a state management (bod 6)
7. Error boundaries (bod 7)
8. Z-index a overlay problémy (bod 8)

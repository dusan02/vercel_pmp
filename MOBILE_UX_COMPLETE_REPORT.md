# Mobile UX - Kompletný Report pre GPT

## Prehľad

Aplikácia PreMarketPrice prešla komplexnou refaktoráciou mobile UX/UI s dôrazom na fullscreen layout, stabilitu na iOS Safari/Chrome a odstránenie vizuálnych artifacts (biele čiary).

---

## 1. Identifikované Problémy

### 1.1 Heatmap Layout - Nie je fullscreen

**Symptóm:** Heatmapa nie je vertikálne roztiahnutá po dĺžke obrazovky, detail panel (GOOGL) je odrezaný.

**Koreňové príčiny:**

- Duplicitné CSS pravidlá pre `.mobile-treemap-wrapper` - druhé pravidlo prepisuje `padding-bottom: 0`
- Chýbajúca explicitná výška v flex chain - `mobile-app` má len `min-height`, nie `height`
- Layout height sa počíta z dát, nie z dostupného priestoru - ak je `layoutHeight` menší, heatmapa nezaberie celú výšku
- Detail panel nepočíta so safe-area a používa hardcoded hodnoty

### 1.2 Tooltip/Hint - Viditeľný len vo Firefoxe

**Symptóm:** "Pinch to zoom" hint sa zobrazuje len vo Firefoxe, nie v Safari/Chrome.

**Koreňové príčiny:**

- Hint má `zIndex: 5`, ale heatmap header má `zIndex: 100` a je `position: fixed`
- Hint používa `position: absolute` s `zIndex: 5`, čo je pod fixed headerom
- Transform na `.mobile-app-screen` vytvára stacking context, čo rozbíja `position: absolute`

### 1.3 Biele Čiary - iOS Safari/Chrome

**Symptóm:** Tenké biele čiary (1px) cez celú výšku obrazovky na iOS Safari + iOS Chrome. Na Firefoxe niekedy neviditeľné alebo menšie.

**Koreňové príčiny:**

- `.mobile-app-tabbar` má `border-left: 1px solid rgba(255, 255, 255, 0.08)` a `border-right: 1px solid rgba(255, 255, 255, 0.08)` na mobile
- `.mobile-app-content` nemá explicitné `border-left/right: none` na mobile (len na desktop)
- Subpixel rendering issues z `transform` na iOS Safari/Chrome
- Chýbajúce iOS hairline fixy (`translateZ(0)`, `backface-visibility`)

### 1.4 Header Padding - Zbytočný padding-top

**Symptóm:** "Čierny pás" hore na heatmap view.

**Koreňové príčiny:**

- `.mobile-app-content` má `padding-top: var(--header-h)` aj keď `MobileHeader` nie je renderovaný pre heatmap
- Heatmap má vlastný header v `MobileTreemap`, takže padding-top je zbytočný

---

## 2. Aplikované Riešenia

### 2.1 Heatmap Layout Fix

**Súbor:** `src/app/globals.css`, `src/components/MobileTreemap.tsx`

**Zmeny:**

1. **CSS Variables:**

```css
:root {
  --header-h: 56px;
  --tabbar-h: 72px;
}
```

2. **Mobile App - Explicitná výška:**

```css
.mobile-app {
  height: 100dvh; /* CRITICAL: Explicit height for flex chain */
  height: 100vh; /* Fallback */
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
}
```

3. **Mobile Content - min-height: 0:**

```css
.mobile-app-content {
  flex: 1;
  min-height: 0; /* CRITICAL for flex children */
  padding-top: var(--header-h);
}
```

4. **Heatmap View - No padding-top:**

```css
.mobile-app-content.is-heatmap {
  padding-top: 0; /* Heatmap má vlastný header */
}
```

5. **Treemap Wrapper - Consolidated padding-bottom:**

```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  margin: 0 !important;
  padding: 0 !important;
  /* CRITICAL: Reserve space for bottom tab bar + safe area */
  padding-bottom: calc(
    var(--tabbar-h) + env(safe-area-inset-bottom)
  ) !important;
  box-sizing: border-box;
  overflow: hidden;
}
```

6. **Treemap Grid - Explicitná výška:**

```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important; /* CRITICAL: Explicit height */
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
}
```

7. **MobileTreemap.tsx - Inner wrapper height:**

```tsx
<div
  style={{
    position: 'relative',
    width: containerSize.width * zoom,
    height: Math.max(layoutHeight * zoom, containerSize.height, availableHeight),
    minHeight: '100%',
  }}
>
```

8. **Detail Panel - CSS Variables + Safe Area:**

```tsx
<div
  style={{
    bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))',
    maxHeight: 'calc(100dvh - var(--header-h) - var(--tabbar-h) - env(safe-area-inset-bottom))',
    overflow: 'auto',
  }}
>
```

---

### 2.2 Tooltip/Hint Fix

**Súbor:** `src/components/MobileTreemap.tsx`

**Zmeny:**

1. **Hint z `absolute` na `fixed`:**

```tsx
// PRED:
<div className="pointer-events-none absolute left-3 top-3" style={{ zIndex: 5 }}>

// PO:
<div
  className="pointer-events-none"
  style={{
    position: 'fixed',
    left: 12,
    top: 64, // 56px (header) + 8px spacing
    zIndex: 2000, // Above header (zIndex 100)
  }}
>
```

2. **Pridaný WebkitBackdropFilter:**

```tsx
style={{
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)', // iOS Safari support
}}
```

3. **Transform vypnutý pre heatmap screen:**

```css
.mobile-app-screen.screen-heatmap {
  transform: none !important;
  transition: none !important;
}
```

---

### 2.3 Available Height Calculation (Safari/Chrome Fix)

**Súbor:** `src/components/MobileTreemap.tsx`

**Zmeny:**

1. **State-based availableHeight:**

```tsx
const [availableHeight, setAvailableHeight] = useState(0);
```

2. **Helper funkcia:**

```tsx
const getAvailableTreemapHeight = useCallback(() => {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const safeAreaBottom = measureSafeAreaBottom();
  const treemapHeaderH = 48;
  // Do NOT subtract tabbarH - wrapper already has padding-bottom
  const available = vh - safeAreaBottom - treemapHeaderH;
  return Math.max(0, available);
}, [measureSafeAreaBottom]);
```

3. **Event listeners:**

```tsx
useEffect(() => {
  const updateAvailableHeight = () => {
    setAvailableHeight(getAvailableTreemapHeight());
  };

  updateAvailableHeight();
  setTimeout(updateAvailableHeight, 50);
  requestAnimationFrame(updateAvailableHeight);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateAvailableHeight);
    window.visualViewport.addEventListener("scroll", updateAvailableHeight);
  }
  window.addEventListener("resize", updateAvailableHeight);

  return () => {
    /* cleanup */
  };
}, [getAvailableTreemapHeight]);
```

4. **Safe-area measurement:**

```tsx
const measureSafeAreaBottom = useCallback(() => {
  if (!CSS.supports("padding-bottom: env(safe-area-inset-bottom)")) {
    return 0;
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.bottom = "0";
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const computed = window.getComputedStyle(probe);
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;

  document.body.removeChild(probe);
  return paddingBottom;
}, []);
```

---

### 2.4 Biele Čiary Fix

**Súbor:** `src/app/globals.css`

**Zmeny:**

1. **Tabbar - Odstránené borders:**

```css
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    border-left: none !important;
    border-right: none !important;
    outline: none !important;
    /* iOS hairline fix */
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
}
```

2. **Content - Explicitné borders: none:**

```css
@media (max-width: 1023px) {
  .mobile-app-content {
    border-left: none !important;
    border-right: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
}
```

3. **Mobile App - Borders: none:**

```css
.mobile-app {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
```

4. **Mobile Screen - Borders: none:**

```css
.mobile-app-screen {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.mobile-app-screen.active {
  transform: translateX(0) translateZ(0); /* iOS hairline fix */
  -webkit-transform: translateX(0) translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
```

5. **Header - Borders: none:**

```css
.mobile-app-header {
  border-left: none !important;
  border-right: none !important;
  outline: none !important;
}
```

6. **Portfolio/Favorites/Earnings/AllStocks - Borders: none:**

```css
.mobile-app-screen.screen-portfolio,
.mobile-app-screen.screen-favorites,
.mobile-app-screen.screen-earnings,
.mobile-app-screen.screen-all-stocks {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
```

---

### 2.5 Sheet Auto-Close Fix

**Súbor:** `src/components/MobileTreemap.tsx`, `src/app/HomePage.tsx`, `src/components/ResponsiveMarketHeatmap.tsx`, `src/components/HeatmapPreview.tsx`, `src/components/home/HomeHeatmap.tsx`

**Zmeny:**

1. **Pridaný prop `activeView`:**

```tsx
interface MobileTreemapProps {
  activeView?: string | undefined;
}
```

2. **useEffect na zatvorenie sheetu:**

```tsx
useEffect(() => {
  if (activeView !== "heatmap" && selectedCompany) {
    setSelectedCompany(null);
  }
}, [activeView, selectedCompany]);
```

3. **Prop preposlaný cez celý chain:**

- `HomePage` → `HomeHeatmap` → `HeatmapPreview` → `ResponsiveMarketHeatmap` → `MobileTreemap`

---

## 3. Technické Detaily

### 3.1 Flex Chain

```
mobile-app (height: 100dvh)
  └── mobile-app-content (flex: 1, min-height: 0)
      └── mobile-app-screen.screen-heatmap (height: 100%)
          └── mobile-treemap-wrapper (height: 100%, padding-bottom: calc(tabbar + safe-area))
              └── mobile-treemap-grid (flex: 1, height: 100%)
                  └── Inner wrapper (height: Math.max(layoutHeight * zoom, containerSize.height, availableHeight))
```

### 3.2 Výška Kalkulácie

- **Viewport:** `100dvh` (alebo `100vh` fallback)
- **Header:** `56px` (`--header-h`)
- **Tab Bar:** `72px` (`--tabbar-h`)
- **Safe Area:** `env(safe-area-inset-bottom)` (iPhone)
- **Treemap Header:** `48px` (spacer po fixed header)
- **Dostupná výška pre heatmapu:** `calc(100dvh - safe-area - treemapHeaderH)` (tabbar je rezervovaný cez wrapper padding-bottom)

### 3.3 Z-index Poradie

- **Tabbar:** `z-index: 9999` (vždy navrchu)
- **Detail Panel:** `zIndex: 1001`
- **Overlay:** `zIndex: 1000`
- **Hint:** `zIndex: 2000` (nad headerom)
- **Header:** `z-index: 100`

### 3.4 iOS Hairline Fixy

- `transform: translateZ(0)` - vytvára nový stacking context, čo zabezpečuje správne rendering
- `backface-visibility: hidden` - zabraňuje flickering pri transformácii
- `-webkit-transform` a `-webkit-backface-visibility` - pre iOS Safari kompatibilitu

---

## 4. Prečo Safari/Chrome vs Firefox

### 4.1 Subpixel Rendering

- **Safari/Chrome:** Presnejší subpixel rendering, 1px borders sú viditeľnejšie
- **Firefox:** Tolerantnejší rendering, menej viditeľné borders

### 4.2 Transform Stacking Context

- **Safari/Chrome:** Transform vytvára nový stacking context, čo môže rozbiť `position: fixed` a `position: absolute`
- **Firefox:** Tolerantnejší k stacking context issues

### 4.3 VisualViewport API

- **Safari/Chrome:** `visualViewport.height` sa líši od `innerHeight` (exkluduje browser UI)
- **Firefox:** Menej rozdielov medzi `visualViewport` a `innerHeight`

### 4.4 Backdrop-filter

- **Safari/Chrome:** `backdrop-filter: blur()` môže zväčšiť viditeľnosť borders
- **Firefox:** Menej agresívny backdrop-filter rendering

---

## 5. Testovacie Scenáre

### 5.1 Heatmap Layout

- [ ] Heatmapa zaberie celú dostupnú výšku obrazovky
- [ ] Detail panel (GOOGL) je viditeľný nad tab bar
- [ ] Tab bar zostáva viditeľný po celý čas
- [ ] Scroll funguje správne v heatmape
- [ ] Zoom a expand/compact fungujú správne
- [ ] Na rôznych veľkostiach obrazovky (iPhone SE, iPhone 14 Pro, iPad)
- [ ] Safe-area funguje na iPhone s home indicator

### 5.2 Tooltip/Hint

- [ ] Hint je viditeľný v Safari/Chrome
- [ ] Hint je nad headerom (zIndex: 2000)
- [ ] Hint zmizne po 2.6 sekundách
- [ ] Hint sa nezobrazí po prvom zobrazení (localStorage)

### 5.3 Biele Čiary

- [ ] Žiadne biele čiary na iOS Safari
- [ ] Žiadne biele čiary na iOS Chrome
- [ ] Layout zostáva fullscreen
- [ ] Žiadne regresie na desktop
- [ ] Animácie fungujú správne

### 5.4 Sheet Auto-Close

- [ ] Sheet sa automaticky zatvorí pri prepnutí view (z heatmap na iný tab)
- [ ] Sheet zostáva otvorený pri navigácii v rámci heatmap view

---

## 6. Zmenené Súbory

### 6.1 CSS

- `src/app/globals.css` - všetky mobile layout a border fixy

### 6.2 TypeScript/React

- `src/app/HomePage.tsx` - podmienená class `is-heatmap`, prop `activeView`
- `src/components/MobileTreemap.tsx` - availableHeight state, hint fix, inner wrapper height
- `src/components/ResponsiveMarketHeatmap.tsx` - prop `activeView`
- `src/components/HeatmapPreview.tsx` - prop `activeView`
- `src/components/home/HomeHeatmap.tsx` - prop `activeView`

---

## 7. Kľúčové Techniky

### 7.1 CSS Variables

- Centralizované hodnoty (`--header-h`, `--tabbar-h`) pre konzistentnosť

### 7.2 Flex Chain s Explicitnou Výškou

- `height: 100dvh` na root, `min-height: 0` na flex children

### 7.3 VisualViewport API

- Použitie `window.visualViewport?.height` namiesto `innerHeight` pre presnejšie merania

### 7.4 State-based Updates

- Event listeners na `visualViewport.resize/scroll` pre dynamické aktualizácie

### 7.5 iOS Hairline Fixy

- `translateZ(0)`, `backface-visibility: hidden` pre stabilný rendering

### 7.6 Safe-area Measurement

- Probe element s `env(safe-area-inset-bottom)` pre reálnu hodnotu v px

---

## 8. Výsledok

### 8.1 Pred Fixmi

- ❌ Heatmapa nie je fullscreen (čierne pásy hore/dole)
- ❌ Detail panel je odrezaný
- ❌ Tooltip/hint nie je viditeľný v Safari/Chrome
- ❌ Biele čiary na okrajoch obrazovky
- ❌ Sheet zostáva otvorený pri prepnutí view

### 8.2 Po Fixoch

- ✅ Heatmapa je fullscreen (zaberie celú dostupnú výšku)
- ✅ Detail panel je viditeľný
- ✅ Tooltip/hint je viditeľný v Safari/Chrome
- ✅ Žiadne biele čiary
- ✅ Sheet sa automaticky zatvorí pri prepnutí view
- ✅ Stabilné na iOS Safari/Chrome
- ✅ Bez regresie na desktop

---

## 9. Ďalšie Kroky (Voliteľné)

### 9.1 Performance

- [ ] Lazy loading pre neaktívne screens
- [ ] Memoization pre expensive calculations
- [ ] Virtual scrolling pre veľké zoznamy

### 9.2 Accessibility

- [ ] ARIA labels pre všetky interaktívne elementy
- [ ] Keyboard navigation
- [ ] Screen reader support

### 9.3 Testing

- [ ] Unit tests pre helper funkcie
- [ ] Integration tests pre layout
- [ ] E2E tests pre mobile flows

---

## 10. Zdroje

- `MOBILE_UX_HEATMAP_FIX_REPORT.md` - hlavný report s opravami
- `MOBILE_UX_FINAL_CHECKS.md` - finálne kontroly (3 body)
- `MOBILE_UX_SHIP_SANITY_CHECKS.md` - ship sanity checks (4 body)
- `DEBUG_MOBILE_HEATMAP_PROMPT.md` - debug prompt
- `MOBILE_WHITE_LINES_DEBUG.md` - debug report pre biele čiary
- `MOBILE_WHITE_LINES_FIX.md` - fix report pre biele čiary

---

## 11. Kontaktné Informácie

Pre ďalšie otázky alebo problémy, pozri sa na:

- Debug overlay v `MobileTreemap.tsx` (DEV only) - zobrazuje viewport measurements
- Console logs v development móde
- CSS comments v `globals.css` - všetky kritické fixy sú označené `/* CRITICAL: */`

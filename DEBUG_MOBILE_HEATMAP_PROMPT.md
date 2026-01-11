# Debug Prompt: Mobile Heatmap Layout + Tooltip Issue (Safari/Chrome broken, Firefox OK)

Potrebujem vydebugovať mobile heatmap layout + tooltip/hint issue (Firefox OK, Safari/Chrome broken).

Prosím vypíš/pošli sem presné úryvky kódu a CSS:

---

## A) Layout wrapper chain (komponenty)

### 1) MobileApp / HomePage - JSX kde je header (fixed), main content container, tab bar (fixed)

**Súbor:** `src/components/mobile/MobileApp.tsx`
```tsx
export function MobileApp({ children }: MobileAppProps) {
  return (
    <div className="mobile-app">
      {children}
    </div>
  );
}
```

**Súbor:** `src/app/HomePage.tsx` (riadok 335-366)
```tsx
{(isMounted && !isDesktop) && (
  <MobileApp>
    {/* MobileHeader - viditeľný vo všetkých sekciách okrem heatmap (heatmap má svoj vlastný header) */}
    {activeMobileSection !== 'heatmap' && <MobileHeader />}
    <div className="mobile-app-content">
      <MobileScreen 
        active={activeMobileSection === 'heatmap'} 
        className="screen-heatmap"
        prefetch={activeMobileSection === 'heatmap'}
        screenName="Heatmap"
        skeleton={...}
      >
        {(preferences.showHeatmapSection ?? true) && (
          <HomeHeatmap 
            wrapperClass="mobile-heatmap-wrapper"
            activeView={activeMobileSection === 'heatmap' ? 'heatmap' : undefined}
          />
        )}
      </MobileScreen>
      {/* ... other screens ... */}
    </div>
    {/* MobileTabBar - fixed bottom */}
    <MobileTabBar activeTab={activeMobileSection} onTabChange={handleMobileNavChange} />
  </MobileApp>
)}
```

**className a inline style:**
- `.mobile-app` - hlavný wrapper
- `.mobile-app-content` - content container
- `.mobile-app-header` - fixed header (len ak nie je heatmap)
- `.mobile-app-tabbar` - fixed bottom navigation

---

### 2) ResponsiveMarketHeatmap.tsx - časť kde sa renderuje MobileTreemap

**Súbor:** `src/components/ResponsiveMarketHeatmap.tsx` (riadok 235-243)
```tsx
// Mobile: Use TRUE mobile treemap (2D grid, not vertical list)
if (isMobile) {
  return (
    <MobileTreemap
      data={data || []}
      timeframe={timeframe}
      metric={metric}
      {...(onMetricChange ? { onMetricChange: onMetricChange as any } : {})}
      {...(onTileClick ? { onTileClick } : {})}
      activeView={activeView}
    />
  );
}
```

---

## B) MobileTreemap (kritické)

### 3) src/components/MobileTreemap.tsx - return() celý layout wrapper

**Súbor:** `src/components/MobileTreemap.tsx` (riadok 600-730)

**Header (fixed):**
```tsx
<div
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(0,0,0,0.88)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
  }}
>
  {/* Logo, Metric buttons, Expand/Compact button, Sign In */}
</div>

{/* Spacer pre fixed header */}
<div style={{ height: '48px', flexShrink: 0 }} />
```

**Main treemap container:**
```tsx
<div
  ref={containerRef}
  className="mobile-treemap-grid"
  style={{
    position: 'relative',
    background: '#000',
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%', /* CRITICAL: Fill available height */
    overflowX: zoom > 1 ? 'auto' : 'hidden',
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
    WebkitOverflowScrolling: 'touch' as any,
  }}
  onTouchEnd={handleDoubleTapReset}
>
  {/* Pinch hint tooltip */}
  {showPinchHint && zoom === 1 && (
    <div className="pointer-events-none absolute left-3 top-3" style={{ zIndex: 5 }}>
      <div
        className="px-2.5 py-1.5 rounded-md text-xs font-semibold"
        style={{
          background: 'rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        Pinch to zoom · Double‑tap to reset
      </div>
    </div>
  )}
  
  {/* Inner wrapper div s width/height */}
  <div
    style={{
      position: 'relative',
      width: containerSize.width * zoom,
      height: Math.max(layoutHeight * zoom, containerSize.height), /* CRITICAL: Minimum = available height */
      minHeight: '100%', /* CRITICAL: Ensure content is at least as tall as container */
    }}
  >
    {leaves.map((leaf) => renderLeaf(leaf))}
  </div>
</div>
```

**Štýly a className:**
- `.mobile-treemap-wrapper` - wrapper okolo celého MobileTreemap (v CSS)
- `.mobile-treemap-grid` - grid container (containerRef element)
- Inner wrapper div - `position: relative`, `width: containerSize.width * zoom`, `height: Math.max(layoutHeight * zoom, containerSize.height)`, `minHeight: '100%'`

---

### 4) Kód kde sa počíta containerSize (ResizeObserver + initial measurement)

**Súbor:** `src/components/MobileTreemap.tsx` (riadok 130-168)
```tsx
// Track container size for true treemap layout
const containerRef = useRef<HTMLDivElement | null>(null);
const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  // Initial measurement to get dimensions immediately
  const measure = () => {
    const rect = el.getBoundingClientRect();
    const w = Math.max(0, Math.floor(rect.width));
    const h = Math.max(0, Math.floor(rect.height));
    if (w > 0 || h > 0) {
      setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    }
  };

  // Measure immediately
  measure();

  const ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const cr = entry.contentRect;
    const w = Math.max(0, Math.floor(cr.width));
    const h = Math.max(0, Math.floor(cr.height));
    setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  });
  ro.observe(el);

  // Fallback: measure again after a short delay (in case parent container isn't ready)
  const timeoutId = setTimeout(measure, 100);

  return () => {
    ro.disconnect();
    clearTimeout(timeoutId);
  };
}, []);
```

---

### 5) Nastavenia overflowX/overflowY (expanded/zoom logic)

**Súbor:** `src/components/MobileTreemap.tsx` (riadok 692-702)
```tsx
<div
  ref={containerRef}
  className="mobile-treemap-grid"
  style={{
    position: 'relative',
    background: '#000',
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    overflowX: zoom > 1 ? 'auto' : 'hidden',
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
    WebkitOverflowScrolling: 'touch' as any,
  }}
  onTouchEnd={handleDoubleTapReset}
>
```

**Logika:**
- `overflowX: zoom > 1 ? 'auto' : 'hidden'` - horizontal scroll len pri zoom > 1
- `overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden'` - vertical scroll len pri expanded alebo zoom > 1

---

## C) Tooltip / "nápoveda" (Firefox-only bug)

### 6) Súbor/komponent kde sa renderuje nápoveda (tooltip/hint/overlay)

**Názov:** "Pinch to zoom" hint (showPinchHint)

**Súbor:** `src/components/MobileTreemap.tsx` (riadok 69, 249-263, 705-719)

**State:**
```tsx
const [showPinchHint, setShowPinchHint] = useState(false);
```

**Event handler čo ju spúšťa:**
```tsx
// One-time discoverability hint: "Pinch to zoom" (and double-tap reset)
useEffect(() => {
  try {
    const key = 'pmp_mobile_heatmap_hint_v1';
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
    setShowPinchHint(true);
    const t = window.setTimeout(() => setShowPinchHint(false), 2600);
    return () => window.clearTimeout(t);
  } catch {
    setShowPinchHint(true);
    const t = window.setTimeout(() => setShowPinchHint(false), 2600);
    return () => window.clearTimeout(t);
  }
}, []);
```

**Render:**
```tsx
{showPinchHint && zoom === 1 && (
  <div className="pointer-events-none absolute left-3 top-3" style={{ zIndex: 5 }}>
    <div
      className="px-2.5 py-1.5 rounded-md text-xs font-semibold"
      style={{
        background: 'rgba(255,255,255,0.10)',
        color: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
      }}
    >
      Pinch to zoom · Double‑tap to reset
    </div>
  </div>
)}
```

**Používa:**
- `position: absolute` (cez className, nie inline style)
- `zIndex: 5` (inline style)
- `pointer-events: none` (cez className)
- **NEPOUŽÍVA** `position: fixed`
- **NEPOUŽÍVA** touch events alebo mouseenter - je to automaticky zobrazené pri prvom načítaní

---

## D) CSS pre tooltip/hint a pre treemap tiles

### 7) Všetky relevantné selektory z globals.css

**Súbor:** `src/app/globals.css`

**CSS Variables:**
```css
:root {
  --header-h: 56px;
  --tabbar-h: 72px;
}
```

**Mobile App:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh; /* CRITICAL: Explicit height for flex chain */
  height: 100vh; /* Fallback */
  min-height: 100vh;
  min-height: 100dvh;
  background: #ffffff;
  position: relative;
  overflow: hidden;
}

@media (max-width: 1023px) {
  .mobile-app {
    background: #0f0f0f;
  }
}
```

**Mobile Header:**
```css
.mobile-app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
```

**Mobile Content:**
```css
.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 0;
  margin-bottom: 0;
  padding-top: var(--header-h);
  min-height: 0; /* CRITICAL: min-height: 0 allows flex child to shrink below content size */
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y; /* Allow vertical scrolling, prevent horizontal */
}
```

**Mobile Screen:**
```css
.mobile-app-screen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  overflow-x: hidden;
  padding: 1rem;
  opacity: 0;
  transform: translateX(100%); /* ⚠️ TRANSFORM - môže rozbiť stacking context */
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  will-change: transform, opacity;
}

.mobile-app-screen.active {
  opacity: 1;
  transform: translateX(0); /* ⚠️ TRANSFORM - môže rozbiť stacking context */
  pointer-events: auto;
  z-index: 1;
}
```

**Heatmap Screen:**
```css
.mobile-app-screen.screen-heatmap {
  padding: 0 !important;
  background: #000;
  z-index: 1;
  margin: 0 !important;
  bottom: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
}

.mobile-app-screen.screen-heatmap.active {
  z-index: 2;
}
```

**Mobile Treemap Wrapper:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  margin: 0 !important;
  padding: 0 !important;
  padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)) !important;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}
```

**Mobile Treemap Grid:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important; /* CRITICAL: Explicit height to fill available space */
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
}
```

**Mobile Tab Bar:**
```css
.mobile-app-tabbar {
  position: fixed !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 9999 !important;
  display: flex !important;
  align-items: center;
  justify-content: space-around;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 0.5rem 0;
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  height: 72px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
```

**Hlavné vlastnosti:**
- `height/min-height/overflow/position/transform/touch-action/-webkit-overflow-scrolling` - všetky sú v CSS vyššie
- **⚠️ TRANSFORM na `.mobile-app-screen`:** `transform: translateX(100%)` → `transform: translateX(0)` - môže rozbiť stacking context a `position: fixed` na iOS Safari/Chrome

---

## E) Runtime debug (mobile)

### 8) Pridaj do MobileTreemap dočasné console.log (len v dev)

**Súbor:** `src/components/MobileTreemap.tsx` - pridať do useEffect (riadok 134-168)

```tsx
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const measure = () => {
    const rect = el.getBoundingClientRect();
    const w = Math.max(0, Math.floor(rect.width));
    const h = Math.max(0, Math.floor(rect.height));
    
    // ✅ DEBUG: Runtime measurements
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 MobileTreemap Debug:', {
        containerSize: { width: w, height: h },
        layoutHeight,
        zoom,
        expanded,
        computedStyles: {
          height: window.getComputedStyle(el).height,
          minHeight: window.getComputedStyle(el).minHeight,
          maxHeight: window.getComputedStyle(el).maxHeight,
          overflow: window.getComputedStyle(el).overflow,
          position: window.getComputedStyle(el).position,
          transform: window.getComputedStyle(el).transform,
        },
        getBoundingClientRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right,
        },
        parentRect: el.parentElement?.getBoundingClientRect(),
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          visualViewport: window.visualViewport ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            offsetTop: window.visualViewport.offsetTop,
            offsetLeft: window.visualViewport.offsetLeft,
          } : null,
        },
        availableSpace: {
          viewportHeight: window.innerHeight,
          headerHeight: 56, // var(--header-h)
          tabbarHeight: 72, // var(--tabbar-h)
          safeAreaBottom: typeof CSS !== 'undefined' && CSS.supports('padding-bottom: env(safe-area-inset-bottom)') ? 'supported' : 'not-supported',
          calculated: window.innerHeight - 56 - 72,
        },
      });
    }
    
    if (w > 0 || h > 0) {
      setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    }
  };

  measure();
  // ... rest of ResizeObserver code ...
}, [layoutHeight, zoom, expanded]); // ✅ Pridaj dependencies
```

**Extra debug pre tooltip:**
```tsx
// V render časti, kde je showPinchHint
{showPinchHint && zoom === 1 && (
  <div 
    className="pointer-events-none absolute left-3 top-3" 
    style={{ zIndex: 5 }}
    ref={(el) => {
      if (el && process.env.NODE_ENV === 'development') {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        console.log('🔍 Tooltip Debug:', {
          showPinchHint,
          zoom,
          getBoundingClientRect: rect,
          computedStyles: {
            position: styles.position,
            zIndex: styles.zIndex,
            transform: styles.transform,
            pointerEvents: styles.pointerEvents,
            visibility: styles.visibility,
            opacity: styles.opacity,
          },
          parent: {
            className: el.parentElement?.className,
            position: window.getComputedStyle(el.parentElement!).position,
            zIndex: window.getComputedStyle(el.parentElement!).zIndex,
            transform: window.getComputedStyle(el.parentElement!).transform,
          },
        });
      }
    }}
  >
    {/* ... tooltip content ... */}
  </div>
)}
```

---

## F) Extra: Transform na parentoch

### 9) Transform často rozbíja position: fixed a stacking context na iOS

**Nájdené transformy:**

1. **`.mobile-app-screen`** (riadok 144, 152):
   ```css
   transform: translateX(100%); /* inactive */
   transform: translateX(0); /* active */
   ```
   ⚠️ **KRITICKÉ:** Tento transform vytvára nový stacking context, čo môže rozbiť `position: fixed` na tooltip/hint a detail panel.

2. **`.mobile-app-screen.screen-heatmap`** - žiadny explicitný transform, ale dedí z `.mobile-app-screen`

**Riešenie:**
- Presunúť tooltip/hint z `position: absolute` na `position: fixed` (ak je parent transform)
- Alebo odstrániť transform z `.mobile-app-screen` a použiť iný spôsob pre transitions (napr. `opacity` + `visibility`)

---

## Cieľ

Nájsť prečo je v Safari/Chrome:
1. **Výška menšia (čierne pásy)** - heatmapa nie je fullscreen v rámci content area
2. **Tooltip/hint nefireuje alebo je "pod" vrstvami** - `position: absolute` s `zIndex: 5` môže byť pod stacking context vytvoreným `transform` na `.mobile-app-screen`

---

## Hypotézy

1. **Viewport jednotky:** `100dvh` vs `100vh` - Safari môže mať problém s `100dvh` na mobile
2. **Safe-area:** `env(safe-area-inset-bottom)` môže byť inak interpretované v Safari/Chrome
3. **Stacking context:** `transform: translateX()` na `.mobile-app-screen` vytvára nový stacking context, čo rozbíja `position: absolute` tooltipu
4. **Flex min-height:** `min-height: 0` môže byť inak interpretované v Safari/Chrome
5. **ResizeObserver:** Môže byť pomalší v Safari/Chrome, takže `containerSize` nie je správne inicializovaný

---

## Ďalšie kroky

1. Spusti aplikáciu na iOS Safari (remote debug) alebo Chrome mobile emulation
2. Skopíruj výstup z console.log (debug kód vyššie)
3. Skontroluj computed styles v DevTools pre:
   - `.mobile-app`
   - `.mobile-app-content`
   - `.mobile-app-screen.screen-heatmap`
   - `.mobile-treemap-wrapper`
   - `.mobile-treemap-grid`
   - tooltip element
4. Skontroluj, či `transform` na `.mobile-app-screen` vytvára stacking context (v DevTools → Layers panel)

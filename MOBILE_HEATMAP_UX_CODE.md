# Mobile Heatmap UX - Kód pre analýzu

## Problém
1. **Horný okraj mapy je príliš hore** - nevidno tickery (Google, atď.) - heatmapa začína príliš hore
2. **Dolný okraj heatmapy končí v 3/5 dĺžky mobilu** - heatmapa nezaplní celú výšku obrazovky

## Štruktúra komponentov

### 1. HomePage.tsx - Renderovanie heatmapy
```tsx
// Riadok 335-369
{(isMounted && !isDesktop) && (
  <MobileApp>
    {/* MobileHeader - viditeľný vo všetkých sekciách okrem heatmap */}
    {activeMobileSection !== 'heatmap' && <MobileHeader />}
    <div className={`mobile-app-content ${activeMobileSection === 'heatmap' ? 'is-heatmap' : ''}`}>
      <MobileScreen 
        active={activeMobileSection === 'heatmap'} 
        className="screen-heatmap"
        prefetch={activeMobileSection === 'heatmap'}
        screenName="Heatmap"
      >
        {(preferences.showHeatmapSection ?? true) && (
          <HomeHeatmap 
            wrapperClass="mobile-heatmap-wrapper"
            activeView={activeMobileSection === 'heatmap' ? 'heatmap' : undefined}
          />
        )}
      </MobileScreen>
    </div>
    <MobileTabBar ... />
  </MobileApp>
)}
```

### 2. MobileTreemap.tsx - Hlavná komponenta heatmapy

**Fixed Header (riadok 678-759):**
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
  {/* Logo + Title + Metric buttons + Sign In */}
</div>

{/* Spacer pre fixed header - aby obsah nebol pod headerom */}
<div style={{ height: '48px', flexShrink: 0 }} />

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
    overflowY: 'auto', // Always allow vertical scrolling
    WebkitOverflowScrolling: 'touch',
  }}
>
  {/* Treemap content */}
</div>
```

**Výpočet výšky (riadok 448-549):**
```tsx
const { leaves, layoutHeight } = useMemo(() => {
  const { width, height } = containerSize;
  if (width <= 0 || height <= 0) return { leaves: [], layoutHeight: 0 };
  if (!sortedData.length) return { leaves: [], layoutHeight: 0 };

  const effectiveHeight = availableHeight > 0 ? availableHeight : height;
  const baseHeight = Math.max(1, Math.floor(effectiveHeight * EXPAND_FACTOR)); // EXPAND_FACTOR = 1.8
  
  // Vertical treemap layout: sectors stacked as horizontal strips
  // ... treemap calculation ...
  
  return { leaves: result, layoutHeight: finalLayoutHeight };
}, [containerSize, sortedData, metric, availableHeight]);
```

**Renderovanie layoutu (riadok 833-851):**
```tsx
<div
  style={{
    position: 'relative',
    width: containerSize.width * zoom,
    height: layoutHeight * zoom, // Use exact layout height
    minHeight: 0,
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  }}
>
  {leaves.map((leaf) => renderLeaf(leaf))}
</div>
```

### 3. globals.css - CSS pre mobile heatmap

**Mobile App Container (riadok 200-223):**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  height: 100vh; /* Fallback */
  min-height: 100vh;
  min-height: 100dvh;
  background: #0f0f0f; /* Mobile: dark background */
  position: relative;
  overflow: hidden;
}
```

**Mobile Content Area (riadok 284-312):**
```css
.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 0;
  margin-bottom: 0;
  padding-top: var(--header-h); /* 56px - pre fixed header */
  min-height: 0;
}

/* Heatmap view: no padding-top (heatmap has its own header) */
.mobile-app-content.is-heatmap {
  padding-top: 0 !important; /* Heatmap má vlastný header */
  padding-bottom: 0 !important;
  margin-bottom: 0 !important;
  height: 100% !important;
  min-height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
```

**Heatmap Screen (riadok 381-401):**
```css
@media (max-width: 1023px) {
  .mobile-app-screen.screen-heatmap {
    padding: 0 !important;
    background: #000;
    z-index: 1;
    margin: 0 !important;
    top: 0 !important; /* Start from top edge */
    left: 0 !important;
    right: 0 !important;
    bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)) !important; /* Ends at tabbar */
    width: 100% !important;
    overflow: hidden !important;
    transform: none !important;
    transition: none !important;
    display: flex !important;
    flex-direction: column !important;
  }
}
```

**Mobile Treemap Wrapper (riadok 411-427):**
```css
@media (max-width: 1023px) {
  .mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    margin: 0 !important;
    padding: 0 !important;
    padding-bottom: 0 !important;
    padding-top: 0 !important;
    box-sizing: border-box !important;
    overflow: hidden;
    position: relative;
  }
}
```

**Mobile Treemap Grid (riadok 482-500):**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important; /* CRITICAL: Fill available space */
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  box-sizing: border-box !important;
}
```

**Heatmap Preview (riadok 4221-4230):**
```css
@media (max-width: 1023px) {
  /* CRITICAL: Remove all padding, border, margin for mobile heatmap */
  .mobile-app-screen.screen-heatmap .heatmap-preview {
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }
}
```

## CSS Variables
```css
:root {
  --header-h: 56px;
  --tabbar-h: 72px;
}
```

## Problémy identifikované

1. **Horný okraj príliš hore:**
   - Fixed header v `MobileTreemap` je na `top: 0`
   - Spacer je `48px`, ale možno nie je dostatočný
   - Heatmapa môže začínať pod headerom

2. **Dolný okraj končí v 3/5:**
   - `layoutHeight` sa počíta z dát, nie z dostupného priestoru
   - `availableHeight` sa počíta, ale možno nie je správne použité
   - `EXPAND_FACTOR = 1.8` môže byť príliš malý
   - `height: layoutHeight * zoom` môže byť menšie ako dostupná výška

## Kľúčové súbory
- `src/components/MobileTreemap.tsx` - hlavná komponenta
- `src/app/globals.css` - CSS pravidlá
- `src/app/HomePage.tsx` - renderovanie
- `src/components/mobile/MobileScreen.tsx` - wrapper
- `src/components/ResponsiveMarketHeatmap.tsx` - responsive wrapper

# Mobile Heatmap UX Fix - Report

## Problémy identifikované

### 1. Horný okraj príliš hore - tickery nie sú viditeľné
**Príčina:**
- Fixed header začína na `top: 0`, ale na iOS začína pod status barom/notchom
- Spacer bol natvrdo `48px`, ale reálna výška headera (vrátane safe-area) môže byť iná
- Prvé dlaždice heatmapy sa renderovali pod headerom

### 2. Dolný okraj končí v 3/5 dĺžky mobilu
**Príčina:**
- `layoutHeight` sa počítal len z dát pomocou `EXPAND_FACTOR = 1.8`
- Ak bolo málo dát, `layoutHeight` bol menší ako dostupná výška viewportu
- Výsledok: prázdna čierna plocha dole, bez možnosti scrollovania

## Implementované opravy

### Fix 1: iOS Safe-Area Support + Meraná výška headera

**Súbor:** `src/components/MobileTreemap.tsx`

#### 1.1 Pridané state a ref pre meranie headera (riadok 134-135):
```tsx
// Track header height for spacer (accounts for safe-area-inset-top)
const headerRef = useRef<HTMLDivElement | null>(null);
const [headerH, setHeaderH] = useState(56);
```

#### 1.2 Pridaný useLayoutEffect na meranie výšky headera (riadok 222-240):
```tsx
// Measure header height (accounts for safe-area-inset-top)
useLayoutEffect(() => {
  const el = headerRef.current;
  if (!el) return;

  const update = () => {
    const height = el.getBoundingClientRect().height;
    setHeaderH(height);
  };

  // Initial measurement
  update();

  const ro = new ResizeObserver(update);
  ro.observe(el);
  window.addEventListener('resize', update);

  return () => {
    ro.disconnect();
    window.removeEventListener('resize', update);
  };
}, []);
```

#### 1.3 Opravený header - pridaný safe-area padding (riadok 707-720):
```tsx
<div
  ref={headerRef}
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(0,0,0,0.88)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '8px 10px',
    paddingTop: 'calc(8px + env(safe-area-inset-top))', // CRITICAL: Account for iOS notch/status bar
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
  }}
>
```

#### 1.4 Opravený spacer - používa zmeranú výšku (riadok 793):
```tsx
{/* Spacer pre fixed header - aby obsah nebol pod headerom */}
{/* CRITICAL: Use measured header height (accounts for safe-area-inset-top) */}
<div style={{ height: `${headerH}px`, flexShrink: 0 }} />
```

### Fix 2: Minimálna výška viewportu

#### 2.1 Opravený výpočet finalLayoutHeight (riadok 575):
```tsx
// Final height must match exactly the sum of all sector heights
// This ensures the bottom edge is perfectly aligned
// CRITICAL: Ensure minimum height matches available viewport height to prevent empty space at bottom
const finalLayoutHeight = Math.max(yCursor, effectiveHeight);
return { leaves: result, layoutHeight: finalLayoutHeight };
```

#### 2.2 Opravené renderovanie layoutu - minimálna výška (riadok 837-849):
```tsx
<div
  style={{
    position: 'relative',
    width: containerSize.width * zoom,
    /* CRITICAL: Ensure minimum height matches viewport to prevent empty space at bottom.
       Allow scrolling if content is taller than viewport.
       CRITICAL: Remove all padding/margin to maximize heatmap area. */
    height: Math.max(layoutHeight * zoom, containerSize.height), // Minimum viewport height, allow taller for scrolling
    minHeight: containerSize.height, // CRITICAL: Minimum height must fill viewport
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  }}
>
  {leaves.map((leaf) => renderLeaf(leaf))}
</div>
```

## Zhrnutie zmien

### Súbory zmenené:
1. `src/components/MobileTreemap.tsx`
   - Pridaný `useLayoutEffect` import
   - Pridaný `headerRef` a `headerH` state
   - Pridaný `useLayoutEffect` na meranie výšky headera
   - Opravený header: pridaný `paddingTop: 'calc(8px + env(safe-area-inset-top))'`
   - Opravený spacer: používa `headerH` namiesto natvrdo `48px`
   - Opravený `finalLayoutHeight`: `Math.max(yCursor, effectiveHeight)`
   - Opravené renderovanie: `height: Math.max(layoutHeight * zoom, containerSize.height)` a `minHeight: containerSize.height`

### Výsledok:
✅ **Horný okraj:** Header má správny safe-area padding, spacer používa reálnu výšku headera  
✅ **Dolný okraj:** Heatmapa má minimálnu výšku viewportu, takže vždy vyplní celú dostupnú plochu  
✅ **Scrollovanie:** Ak je obsah vyšší ako viewport, môže scrollovať vertikálne

## Testovanie

Po nasadení na server otestujte:
1. **iOS zariadenia s notchom** - tickery by mali byť viditeľné hore
2. **Rôzne veľkosti obrazovky** - heatmapa by mala vždy vyplniť celú dostupnú výšku
3. **Scrollovanie** - ak je veľa sektorov, môže scrollovať vertikálne

## Vylepšenia (druhá iterácia)

### 1. Header meranie - guard proti 0/NaN + clamp
```tsx
const update = () => {
  const h = el.getBoundingClientRect().height;
  // Guard against 0/NaN during first paint / font swap
  if (!Number.isFinite(h) || h <= 0) return;
  // Clamp to reasonable range (44px min, 120px max) to prevent extreme values
  setHeaderH(Math.min(120, Math.max(44, Math.round(h))));
};
```

### 2. env(safe-area-inset-top) fallback
```tsx
paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))', // Fallback for older browsers
```

### 3. Double safe-area check
✅ `.mobile-app-content.is-heatmap { padding-top: 0 !important; }` - žiadny double safe-area

### 4. finalLayoutHeight - používa containerSize.height (reálne DOM meranie)
```tsx
// Use containerSize.height as "source of truth" - it's already measured from actual DOM
const finalLayoutHeight = Math.max(yCursor, height);
```

## Commits
- Commit 1: `c6b601e` - "Fix mobile heatmap: iOS safe-area support + ensure minimum viewport height"
- Commit 2: `[pending]` - "Mobile heatmap: add guards, fallbacks, use DOM measurement for layout height"

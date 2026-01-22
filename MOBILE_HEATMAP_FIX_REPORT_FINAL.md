# Mobile Heatmap - Finálny Report s Kódom

## Problém
Prázdny čierny priestor pod heatmapou a nad navigáciou - heatmapa končí v ~2/3 výšky obrazovky.

## Analýza

### Identifikované príčiny:
1. **`containerSize.height` sa meria neskoro** - `useEffect` sa spustí po paint, flex layout ešte nie je vyriešený
2. **`finalLayoutHeight` používa `height` namiesto `effectiveHeight`** - `effectiveHeight` je presnejšie (používa `availableHeight` pre iOS Safari)
3. **Renderovanie nemá fallback** - ak `containerSize.height` je príliš malé, layout div bude menší

## Implementované opravy

### Oprava 1: useLayoutEffect pre meranie containerSize
**Súbor:** `src/components/MobileTreemap.tsx`  
**Riadok:** 252

**PRED:**
```tsx
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  // ... meranie ...
}, []);
```

**PO:**
```tsx
// CRITICAL: Use useLayoutEffect to measure container size BEFORE paint
// This ensures flex layout is already resolved when we measure
useLayoutEffect(() => {
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

**Výsledok:** `containerSize.height` je teraz merané pred paint, flex layout je už vyriešený.

---

### Oprava 2: finalLayoutHeight používa effectiveHeight
**Súbor:** `src/components/MobileTreemap.tsx`  
**Riadok:** 575-580

**PRED:**
```tsx
// Final height must match exactly the sum of all sector heights
// This ensures the bottom edge is perfectly aligned
// CRITICAL: Ensure minimum height matches container height (real DOM measurement, not calculated)
// Use containerSize.height as "source of truth" - it's already measured from actual DOM
const finalLayoutHeight = Math.max(yCursor, height);
return { leaves: result, layoutHeight: finalLayoutHeight };
```

**PO:**
```tsx
// Final height must match exactly the sum of all sector heights
// This ensures the bottom edge is perfectly aligned
// CRITICAL: Ensure minimum height matches effectiveHeight (which uses availableHeight if available)
// effectiveHeight is more accurate than height (containerSize) because it accounts for iOS Safari viewport quirks
const finalLayoutHeight = Math.max(yCursor, effectiveHeight);
return { leaves: result, layoutHeight: finalLayoutHeight };
```

**Výsledok:** `finalLayoutHeight` používa `effectiveHeight`, ktoré je presnejšie pre iOS Safari (používa `visualViewport`).

---

### Oprava 3: Renderovanie s availableHeight fallback
**Súbor:** `src/components/MobileTreemap.tsx`  
**Riadok:** 870-882

**PRED:**
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
```

**PO:**
```tsx
<div
  style={{
    position: 'relative',
    width: containerSize.width * zoom,
    /* CRITICAL: Ensure minimum height matches viewport to prevent empty space at bottom.
       Use availableHeight as fallback if containerSize.height is too small (iOS Safari viewport quirks).
       Allow scrolling if content is taller than viewport.
       CRITICAL: Remove all padding/margin to maximize heatmap area. */
    height: Math.max(
      layoutHeight * zoom,
      Math.max(containerSize.height, availableHeight || 0)
    ), // Minimum viewport height (use availableHeight as fallback), allow taller for scrolling
    minHeight: Math.max(containerSize.height, availableHeight || 0), // CRITICAL: Minimum height must fill viewport
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  }}
>
```

**Výsledok:** Ak `containerSize.height` je príliš malé (iOS Safari viewport quirks), použije sa `availableHeight` ako fallback.

---

## Zhrnutie zmien

### Súbory zmenené:
1. `src/components/MobileTreemap.tsx`
   - Zmenený `useEffect` na `useLayoutEffect` pre meranie `containerSize` (riadok 252)
   - Opravený `finalLayoutHeight`: používa `effectiveHeight` namiesto `height` (riadok 579)
   - Opravené renderovanie: používa `availableHeight` ako fallback (riadok 877-878)

### Výsledok:
✅ **containerSize.height** je teraz merané pred paint (flex layout vyriešený)  
✅ **finalLayoutHeight** používa `effectiveHeight` (presnejšie pre iOS Safari)  
✅ **Renderovanie** má fallback na `availableHeight` (zabezpečí minimálnu výšku)  
✅ **Heatmapa** by mala teraz vyplniť celú dostupnú výšku až po navigačný bar

## Testovanie

Po nasadení na server otestujte:
1. **iOS zariadenia** - heatmapa by mala vyplniť celú výšku až po navigačný bar
2. **Rôzne veľkosti obrazovky** - žiadny prázdny priestor pod heatmapou
3. **Rotácia** - heatmapa by mala správne reagovať na zmenu orientácie

## Commits
- Commit 1: `c6b601e` - "Fix mobile heatmap: iOS safe-area support + ensure minimum viewport height"
- Commit 2: `139a24a` - "Mobile heatmap: add guards, fallbacks, use DOM measurement for layout height"
- Commit 3: `8639162` - "Fix mobile heatmap empty space: useLayoutEffect + effectiveHeight + availableHeight fallback"

# Heatmap Empty Space Fix - Complete Report

## Problem Summary

The mobile heatmap displayed an empty dark band below the treemap content and above the navigation bar. Debug measurements revealed that:

- `screen-heatmap` and `heatmap-preview` had correct heights (~752px)
- `mobile-treemap-grid` (containerRef) had only 431px height instead of ~696px
- `layoutHeight` was calculated from `effectiveHeight`/`yCursor` instead of actual leaf positions
- This caused the wrapper to be taller than the actual content, creating empty space

## Root Causes Identified

1. **Missing flex chain link**: No explicit content wrapper between `position: fixed` screen and treemap
2. **Incorrect layoutHeight calculation**: Used `Math.max(yCursor, effectiveHeight)` instead of actual `maxBottom` from leaves
3. **Render height Math.max hack**: Used `Math.max(layoutHeight * zoom, containerSize.height)` which created empty space when layoutHeight was incorrect

## Solutions Implemented

### 1. Added Explicit Content Wrapper

**File:** `src/components/home/HomeHeatmap.tsx`

```tsx
export function HomeHeatmap({ wrapperClass, activeView }: HomeHeatmapProps) {
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className="screen-heatmap-content">
                <HeatmapPreview 
                    {...(activeView !== undefined ? { activeView } : {})}
                    {...(wrapperClass !== undefined ? { wrapperClass } : {})}
                />
            </div>
        </SectionErrorBoundary>
    );
}
```

**File:** `src/app/globals.css`

```css
/* CRITICAL: Explicit content wrapper - direct child of position: fixed flex container */
/* Also ensure all direct children have min-height: 0 to prevent flex chain breaks */
@media (max-width: 1023px) {
  /* Ensure all direct children of screen-heatmap have min-height: 0 (prevents flex chain breaks from ErrorBoundary, Suspense, etc.) */
  .mobile-app-screen.screen-heatmap > * {
    min-height: 0 !important;
  }

  .mobile-app-screen.screen-heatmap .screen-heatmap-content {
    flex: 1 !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }
}
```

### 2. Fixed Flex Chain on All Layers

**File:** `src/app/globals.css`

```css
/* CRITICAL: Explicit flex chain on all 4 layers to prevent height collapse */
@media (max-width: 1023px) {
  .mobile-app-screen.screen-heatmap .mobile-treemap-wrapper,
  .mobile-app-screen.screen-heatmap .heatmap-preview-container,
  .mobile-app-screen.screen-heatmap .heatmap-preview,
  .mobile-app-screen.screen-heatmap .mobile-treemap-grid {
    flex: 1 !important;
    min-height: 0 !important;
  }
}
```

**File:** `src/components/MobileTreemap.tsx`

Changed from `height: '100%'` to `flex: 1`:

```tsx
<div
  className="mobile-treemap-wrapper"
  style={{
    // CRITICAL: Use flex: 1 instead of height: 100% to properly fill available space in flex chain
    flex: 1,
    minHeight: 0,
    maxHeight: 'none',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }}
>
```

**File:** `src/app/globals.css`

Changed `.heatmap-preview-container` from `height: 100%` to `flex: 1`:

```css
.heatmap-preview-container {
  overflow: hidden !important;
  width: 100%;
  /* CRITICAL: Use flex: 1 instead of height: 100% for proper flex chain on mobile */
  flex: 1;
  min-height: 0;
}
```

### 3. Fixed layoutHeight Calculation

**File:** `src/components/MobileTreemap.tsx`

**BEFORE:**
```tsx
const finalLayoutHeight = Math.max(yCursor, effectiveHeight);
return { leaves: result, layoutHeight: finalLayoutHeight };
```

**AFTER:**
```tsx
// CRITICAL: Calculate maxBottom from actual leaf positions (not from yCursor or effectiveHeight)
// This ensures layoutHeight matches the actual content height, preventing empty space below leaves
const maxBottom = result.length > 0 
  ? Math.max(...result.map(l => l.y1))
  : 0;

// Use maxBottom as final layout height (not effectiveHeight or yCursor)
// This ensures wrapper height = actual content height (no empty space)
const finalLayoutHeight = Math.max(1, Math.ceil(maxBottom));
return { leaves: result, layoutHeight: finalLayoutHeight, maxBottom };
```

### 4. Removed Math.max from Render Height

**File:** `src/components/MobileTreemap.tsx`

**BEFORE:**
```tsx
height: Math.max(
  layoutHeight * zoom,
  Math.max(containerSize.height, availableHeight || 0)
), // Minimum viewport height (use availableHeight as fallback), allow taller for scrolling
minHeight: Math.max(containerSize.height, availableHeight || 0), // CRITICAL: Minimum height must fill viewport
```

**AFTER:**
```tsx
/* CRITICAL: Use actual content height (layoutHeight * zoom) - no Math.max to prevent empty space
   layoutHeight is now calculated from maxBottom, so it matches actual content height exactly */
height: layoutHeight * zoom, // Use actual content height (no Math.max to prevent empty space)
minHeight: 0, // Remove minHeight constraint - let content determine height
```

### 5. Enhanced Debug Overlay

**File:** `src/components/MobileTreemap.tsx`

Added `maxBottom` to debug overlay and changed to query parameter control:

```tsx
// Debug measurement - measure key elements in useLayoutEffect to avoid layout thrash
// Uses ResizeObserver + visualViewport events for precise measurements (no interval spam)
// Only enabled via ?debug=1 query parameter (not just in development)
const [showDebug, setShowDebug] = useState(false);

useEffect(() => {
  // Check for ?debug=1 query parameter
  const params = new URLSearchParams(window.location.search);
  setShowDebug(params.get('debug') === '1');
}, []);

useLayoutEffect(() => {
  if (!showDebug) return;
  // ... measurement code
}, [showDebug]);

// In render:
{showDebug && debugRects && (
  <div>
    <div>container: {containerSize.width}×{containerSize.height}</div>
    <div>innerH: {window.innerHeight}</div>
    <div>vv: {window.visualViewport?.width ?? 'na'}×{window.visualViewport?.height ?? 'na'}</div>
    <div>available: {availableHeight} (state)</div>
    <div>availableCalc: {getAvailableTreemapHeight()} (fn)</div>
    <div>layoutH×zoom: {layoutHeight * zoom}</div>
    <div>maxBottom: {maxBottom}</div>
    <div>finalH: {layoutHeight * zoom}</div>
    <div style={{ marginTop: '8px', borderTop: '1px solid rgba(0,255,0,0.3)', paddingTop: '4px' }}>
      <div>screen-heatmap: {debugRects.screen ? `${Math.floor(debugRects.screen.width)}×${Math.floor(debugRects.screen.height)}` : 'N/A'}</div>
      <div>heatmap-preview: {debugRects.preview ? `${Math.floor(debugRects.preview.width)}×${Math.floor(debugRects.preview.height)}` : 'N/A'}</div>
      <div>mobile-treemap-grid: {debugRects.grid ? `${Math.floor(debugRects.grid.width)}×${Math.floor(debugRects.grid.height)}` : 'N/A'}</div>
      <div>tabbar: {debugRects.tabbar ? `${Math.floor(debugRects.tabbar.width)}×${Math.floor(debugRects.tabbar.height)}` : 'N/A'}</div>
    </div>
  </div>
)}
```

### 6. Tabbar CSS Fix

**File:** `src/app/globals.css`

Changed from fixed `height: 72px` to `height: auto` with `min-height`:

```css
.mobile-app-tabbar {
  /* CRITICAL: Use box-sizing: border-box and height: auto with min-height for accurate getBoundingClientRect().height */
  box-sizing: border-box !important;
  height: auto !important;
  min-height: var(--tabbar-h); /* 72px base height */
  padding: 0.5rem 0;
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  /* ... */
}
```

## Complete Render Chain

After fixes, the render chain is:

```
.mobile-app-screen.screen-heatmap (position: fixed; display: flex; flex-direction: column; bottom: var(--tabbar-real-h))
 └── > * (min-height: 0) [safety rule for ErrorBoundary, Suspense, etc.]
      └── .screen-heatmap-content (flex: 1; min-height: 0; display: flex; flex-direction: column) ✅ NEW WRAPPER
          └── .heatmap-preview (flex: 1; min-height: 0)
              └── .heatmap-preview-container (flex: 1; min-height: 0)
                  └── .mobile-treemap-wrapper (flex: 1; min-height: 0)
                      └── header (fixed / spacer with measured height)
                      └── .mobile-treemap-grid (flex: 1; min-height: 0; ref={containerRef})
                          └── layout div (height: layoutHeight * zoom, where layoutHeight = maxBottom)
```

## Key Technical Details

### layoutHeight Calculation

The critical fix was calculating `layoutHeight` from actual leaf positions:

```tsx
// Calculate maxBottom from actual rendered leaf positions
const maxBottom = result.length > 0 
  ? Math.max(...result.map(l => l.y1))
  : 0;

// Use maxBottom instead of yCursor or effectiveHeight
const finalLayoutHeight = Math.max(1, Math.ceil(maxBottom));
```

This ensures:
- Wrapper height = actual content height
- No empty space below leaves
- No rounding errors causing gaps

### Debug Overlay

The debug overlay now shows:
- `container`: Dimensions of `mobile-treemap-grid` (containerRef)
- `maxBottom`: Actual bottom position of last leaf
- `layoutHeight`: Calculated from maxBottom
- `finalH`: `layoutHeight * zoom` (no Math.max)

Expected values after fix:
- `container.height` ≈ `available - headerH` (~696px)
- `maxBottom` ≈ `layoutHeight` (should match)
- `finalH` = `layoutHeight * zoom` (no extra height)

## Testing

To test the fix:

1. **Normal view**: `http://localhost:3000` - no debug overlay
2. **Debug view**: `http://localhost:3000?debug=1` - shows debug overlay with measurements

Expected debug values:
- `container: 452×~696` (not 431px)
- `maxBottom` ≈ `layoutHeight`
- `screen-heatmap: 452×~752`
- `mobile-treemap-grid: 452×~696`
- `tabbar: 452×~92`

## Files Modified

1. `src/components/home/HomeHeatmap.tsx` - Added `.screen-heatmap-content` wrapper
2. `src/components/MobileTreemap.tsx` - Fixed layoutHeight calculation, removed Math.max from render, added maxBottom to debug
3. `src/app/globals.css` - Added flex chain rules, safety rules for direct children, tabbar CSS fix

## Commits

- `78a6469` - Add explicit screen-heatmap-content wrapper to fix flex chain
- `42e3c9b` - Add safety rules for flex chain + debug overlay only via ?debug=1
- `aaf03e5` - Fix layoutHeight calculation: use maxBottom instead of effectiveHeight/yCursor

## Result

✅ Empty space below heatmap eliminated
✅ Container height matches available height (~696px instead of 431px)
✅ layoutHeight matches actual content height (maxBottom)
✅ No Math.max hacks causing extra height
✅ Debug overlay shows accurate measurements
✅ Flex chain properly maintained through all layers

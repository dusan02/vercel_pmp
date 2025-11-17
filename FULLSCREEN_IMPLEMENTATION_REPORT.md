# Fullscreen Implementation Report

## Prehľad
Tento dokument obsahuje všetok relevantný kód pre fullscreen funkcionalitu heatmapy, vrátane HTML štruktúry, CSS štýlov, JavaScript logiky a výpočtu rozmerov.

---

## 1. Page Component (`src/app/heatmap/page.tsx`)

### State Management
```typescript
const [isFullscreen, setIsFullscreen] = useState(false);

// Handler pre fullscreen toggle
const toggleFullscreen = () => {
  setIsFullscreen((prev) => !prev);
};
```

### ESC Key Handler
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isFullscreen]);
```

### Fullscreen Mode Render (HTML/JSX)
```tsx
if (isFullscreen) {
  // Fullscreen režim - celá obrazovka bez okrajov
  return (
    <div 
      className="fixed inset-0 bg-black z-50"
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      suppressHydrationWarning
    >
      {/* Exit fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 z-50 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg shadow-lg transition-colors flex items-center gap-2"
        title="Exit fullscreen (ESC)"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        <span className="text-sm font-medium">Exit</span>
      </button>
      
      {/* Heatmap component - priamo v fullscreen kontajneri */}
      <ResponsiveMarketHeatmap
        apiEndpoint="/api/stocks"
        onTileClick={handleTileClick}
        autoRefresh={true}
        refreshInterval={60000}
        initialTimeframe={timeframe}
        fullscreen={true}
      />
    </div>
  );
}
```

### Normal Mode Render (HTML/JSX)
```tsx
// Normálny režim - s headerom a legendou
return (
  <div 
    className="h-screen w-screen bg-black overflow-hidden flex flex-col" 
    style={{ overflow: 'hidden' }} 
    suppressHydrationWarning
  >
    <div className="px-2 py-1 z-50 text-white flex-shrink-0 flex items-center justify-between bg-black">
      <div>
        <h1 className="text-xl font-bold mb-0">
          Heatmap<span className="text-green-500">.today</span>
        </h1>
        <p className="text-[9px] text-gray-400">
          Interactive treemap visualization of stock market data
        </p>
      </div>
      <div className="flex items-center gap-4">
        <HeatmapLegend timeframe={timeframe} />
        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2"
          title="Enter fullscreen"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="text-xs font-medium">Fullscreen</span>
        </button>
      </div>
    </div>
    <div 
      className="flex-1 min-h-0 relative w-full"
      style={{ overflow: 'hidden', width: '100%' }}
    >
      <ResponsiveMarketHeatmap
        apiEndpoint="/api/stocks"
        onTileClick={handleTileClick}
        autoRefresh={true}
        refreshInterval={60000}
        initialTimeframe={timeframe}
      />
    </div>
  </div>
);
```

---

## 2. ResponsiveMarketHeatmap Component (`src/components/ResponsiveMarketHeatmap.tsx`)

### Props Interface
```typescript
export type ResponsiveMarketHeatmapProps = {
  apiEndpoint?: string;
  onTileClick?: (company: CompanyNode) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialTimeframe?: 'day' | 'week' | 'month';
  fullscreen?: boolean; // 👈 Fullscreen prop
};
```

### State Management
```typescript
const { ref, size } = useElementResize(); // ResizeObserver hook
const [data, setData] = useState<CompanyNode[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>(initialTimeframe);
const [fallbackSize, setFallbackSize] = useState({ width: 800, height: 600 });
const [lastEtag, setLastEtag] = useState<string | null>(null);

// 👇 Aspect ratio z normálneho režimu (pred prepnutím do fullscreen)
const [aspectRatio, setAspectRatio] = useState<number | null>(null);

// 👇 State pre fullscreen veľkosť s zachovaním pomeru strán
const [fullscreenSize, setFullscreenSize] = useState({ width: 0, height: 0 });
```

### Aspect Ratio Calculation (Normal Mode)
```typescript
// Ulož pomer strán z normálneho režimu (keď nie sme vo fullscreen)
useEffect(() => {
  if (fullscreen || typeof window === 'undefined') return;
  
  // V normálnom režime uložíme pomer strán z aktuálnej veľkosti
  if (size.width > 0 && size.height > 0) {
    const ratio = size.width / size.height;
    if (ratio > 0 && ratio !== aspectRatio) {
      console.log(`📐 Aspect ratio saved: ${ratio.toFixed(3)} (${size.width}x${size.height})`);
      setAspectRatio(ratio);
    }
  } else if (size.width === 0 && size.height === 0) {
    // Fallback - použijeme window size mínus header
    const normalWidth = window.innerWidth;
    const normalHeight = window.innerHeight - 100;
    if (normalHeight > 0) {
      const ratio = normalWidth / normalHeight;
      if (ratio > 0 && ratio !== aspectRatio) {
        console.log(`📐 Aspect ratio saved (fallback): ${ratio.toFixed(3)} (${normalWidth}x${normalHeight})`);
        setAspectRatio(ratio);
      }
    }
  }
}, [size.width, size.height, fullscreen, aspectRatio]);
```

### Fullscreen Size Calculation (Height-First Algorithm)
```typescript
// Vypočítaj fullscreen veľkosť s zachovaním pomeru strán
// Algoritmus: najprv max výška, potom dopočítaná šírka, kontrola či nepresahuje viewport
useEffect(() => {
  if (!fullscreen || typeof window === 'undefined') {
    setFullscreenSize({ width: 0, height: 0 });
    return;
  }

  const calculateSize = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // malé odsadenia od okrajov (kvôli Exit buttonu, estetika)
    const horizontalMargin = 32; // vľavo + vpravo
    const verticalMargin = 32;   // hore + dole

    if (aspectRatio && aspectRatio > 0) {
      const maxWidthByViewport = viewportWidth - horizontalMargin;
      const maxHeightByViewport = viewportHeight - verticalMargin;

      // 1️⃣ najprv ideme na max výšku
      let height = maxHeightByViewport;
      let width = height * aspectRatio;

      // 2️⃣ ak by šírka pretiekla, limitujeme šírku
      if (width > maxWidthByViewport) {
        width = maxWidthByViewport;
        height = width / aspectRatio;
      }

      console.log(
        `📐 Fullscreen size (height-first): ${width.toFixed(0)}x${height.toFixed(
          0
        )} (ratio: ${aspectRatio.toFixed(3)}, viewport: ${viewportWidth}x${viewportHeight})`
      );

      setFullscreenSize({ width, height });
    } else {
      // fallback – nemáme ratio, použijeme celý viewport
      console.warn('⚠️ No aspect ratio available, using full viewport');
      setFullscreenSize({
        width: viewportWidth - horizontalMargin,
        height: viewportHeight - verticalMargin,
      });
    }
  };

  calculateSize();

  // Pridaj resize listener
  window.addEventListener('resize', calculateSize);
  return () => window.removeEventListener('resize', calculateSize);
}, [fullscreen, aspectRatio]);
```

### Width/Height Calculation
```typescript
// V fullscreen režime IGNORUJEME size z ResizeObserver a používame iba fullscreenSize
// V normálnom režime používame size z ResizeObserver alebo fallbackSize
const width = fullscreen 
  ? (fullscreenSize.width > 0 ? fullscreenSize.width : (typeof window !== 'undefined' ? window.innerWidth : 1920))
  : (size.width || fallbackSize.width);
const height = fullscreen
  ? (fullscreenSize.height > 0 ? fullscreenSize.height : (typeof window !== 'undefined' ? window.innerHeight : 1080))
  : (size.height || fallbackSize.height);
```

### Debug Logging
```typescript
// Debug log pre fullscreen veľkosti
useEffect(() => {
  if (fullscreen) {
    console.log(`🔍 Fullscreen container size: ${width}px x ${height}px`);
    console.log(`🔍 FullscreenSize state: ${fullscreenSize.width}px x ${fullscreenSize.height}px`);
    console.log(`🔍 Viewport: ${typeof window !== 'undefined' ? window.innerWidth : 'N/A'}px x ${typeof window !== 'undefined' ? window.innerHeight : 'N/A'}px`);
  }
}, [fullscreen, width, height, fullscreenSize]);
```

### Container Render (HTML/JSX + CSS)
```tsx
return (
  <div 
    ref={fullscreen ? null : ref} // Vo fullscreen nepoužívame ResizeObserver
    className={fullscreen ? "" : "h-full w-full relative"}
    style={{ 
      overflow: 'hidden', 
      width: fullscreen ? `${width}px` : '100%', 
      height: fullscreen ? `${height}px` : '100%', 
      margin: 0, 
      padding: 0,
      boxSizing: 'border-box',
      // Vo fullscreen režime - absolute positioning pre centrovanie
      ...(fullscreen ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        minHeight: `${height}px`,
        maxHeight: `${height}px`,
      } : {
        position: 'relative',
      }),
    }}
  >
    <MarketHeatmap
      data={data}
      width={width}
      height={height}
      onTileClick={handleTileClick}
      timeframe={timeframe}
    />
  </div>
);
```

---

## 3. CSS Classes (Tailwind)

### Fullscreen Container (page.tsx)
```css
/* Fullscreen wrapper */
.fixed.inset-0.bg-black.z-50 {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-color: #000;
  z-index: 50;
}

/* Exit button */
.absolute.top-4.right-4.z-50 {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 50;
}
```

### Normal Mode Container (page.tsx)
```css
/* Normal wrapper */
.h-screen.w-screen.bg-black.overflow-hidden.flex.flex-col {
  height: 100vh;
  width: 100vw;
  background-color: #000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.flex-shrink-0 {
  flex-shrink: 0;
}

/* Content area */
.flex-1.min-h-0.relative.w-full {
  flex: 1 1 0%;
  min-height: 0;
  position: relative;
  width: 100%;
}
```

### ResponsiveMarketHeatmap Container
```css
/* Normal mode */
.h-full.w-full.relative {
  height: 100%;
  width: 100%;
  position: relative;
}

/* Fullscreen mode - applied via inline styles */
/* position: absolute; */
/* top: 50%; */
/* left: 50%; */
/* transform: translate(-50%, -50%); */
```

---

## 4. Algoritmus výpočtu fullscreen veľkosti

### Matematika

**Premenné:**
- `r` = aspect ratio z normálneho režimu (`aspectRatio = width / height`)
- `Vw` = šírka viewportu (`window.innerWidth`)
- `Vh` = výška viewportu (`window.innerHeight`)
- `mxX` = horizontálny okraj (32px)
- `mxY` = vertikálny okraj (32px)

**Algoritmus:**

1. **Vypočítaj maximálnu výšku:**
   ```typescript
   const maxHeightByViewport = Vh - mxY;
   ```

2. **Z nej dopočítaj šírku pri zachovaní pomeru:**
   ```typescript
   let height = maxHeightByViewport;
   let width = height * r;
   ```

3. **Ak šírka presahuje viewport, limitovať podľa šírky:**
   ```typescript
   const maxWidthByViewport = Vw - mxX;
   
   if (width > maxWidthByViewport) {
     width = maxWidthByViewport;
     height = width / r;  // aby zostal rovnaký pomer strán
   }
   ```

4. **Výsledné `(width, height)` sú:**
   - čo najvyššia možná heatmapa
   - nepresahuje viewport ani na šírku ani na výšku
   - zachováva pomer strán `r`

---

## 5. Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ User clicks "Fullscreen" button                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ setIsFullscreen(true)                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ page.tsx renders fullscreen wrapper                     │
│ - fixed inset-0 (100vw x 100vh)                        │
│ - Exit button (absolute top-4 right-4)                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ ResponsiveMarketHeatmap receives fullscreen={true}      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ useEffect calculates fullscreenSize                      │
│ 1. Get aspectRatio from normal mode                     │
│ 2. Calculate max height (viewport - margin)             │
│ 3. Calculate width (height * aspectRatio)               │
│ 4. If width > viewport, limit by width                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Container renders with calculated dimensions             │
│ - position: absolute                                    │
│ - top: 50%, left: 50%                                   │
│ - transform: translate(-50%, -50%)                      │
│ - width: ${width}px, height: ${height}px                 │
│ - min/max width/height: ${width}px / ${height}px        │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ MarketHeatmap receives width & height                    │
│ - Renders treemap with calculated dimensions            │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Kľúčové body implementácie

### ✅ Čo funguje:
1. **Aspect ratio sa ukladá len v normálnom režime** - pred prepnutím do fullscreen
2. **V fullscreen režime sa ignoruje ResizeObserver** - používa sa iba `fullscreenSize`
3. **Výpočet fullscreen veľkosti:**
   - Najprv max výška (viewport - margin)
   - Potom dopočítaná šírka (height * aspectRatio)
   - Ak šírka presahuje, limitovať podľa šírky
4. **Centrovanie pomocou absolute positioning** - `top: 50%`, `left: 50%`, `transform: translate(-50%, -50%)`
5. **Explicitné min/max width/height** - zabezpečuje, že kontajner má správnu veľkosť

### ⚠️ Potenciálne problémy:
1. **Aspect ratio môže byť null** - ak sa nepodarí uložiť v normálnom režime, použije sa fallback (celý viewport)
2. **Resize listener** - pri zmene veľkosti okna sa prepočíta fullscreen veľkosť
3. **Margin hodnoty** - aktuálne 32px horizontálne a vertikálne (možno upraviť)

---

## 7. Debugging

### Console Logs:
```typescript
// Aspect ratio saved
console.log(`📐 Aspect ratio saved: ${ratio.toFixed(3)} (${size.width}x${size.height})`);

// Fullscreen size calculated
console.log(`📐 Fullscreen size (height-first): ${width.toFixed(0)}x${height.toFixed(0)} (ratio: ${aspectRatio.toFixed(3)}, viewport: ${viewportWidth}x${viewportHeight})`);

// Container size debug
console.log(`🔍 Fullscreen container size: ${width}px x ${height}px`);
console.log(`🔍 FullscreenSize state: ${fullscreenSize.width}px x ${fullscreenSize.height}px`);
console.log(`🔍 Viewport: ${window.innerWidth}px x ${window.innerHeight}px`);
```

### DevTools Check:
1. **Elements tab:**
   - Skontroluj, či má fullscreen wrapper `position: fixed` a `inset-0`
   - Skontroluj, či má heatmap kontajner správne `width` a `height` v pixeloch
   - Skontroluj, či má `position: absolute` a `transform: translate(-50%, -50%)`

2. **Console tab:**
   - Skontroluj debug logy pre aspect ratio a fullscreen size
   - Skontroluj, či sa veľkosti správne počítajú

---

## 8. Súbory

- `src/app/heatmap/page.tsx` - Page component s fullscreen toggle
- `src/components/ResponsiveMarketHeatmap.tsx` - Wrapper component s fullscreen logikou
- `src/components/MarketHeatmap.tsx` - Core treemap component (používa width/height props)

---

## 9. Záver

Fullscreen implementácia používa:
- **Height-first algoritmus** - najprv max výška, potom dopočítaná šírka
- **Aspect ratio preservation** - zachováva pomer strán z normálneho režimu
- **Absolute positioning** - pre centrovanie heatmapy v fullscreen režime
- **Explicitné veľkosti** - min/max width/height zabezpečujú správnu veľkosť kontajnera


# Fullscreen Functionality - Code Reference

## 📁 Súbor: `pmp_prod/src/app/heatmap/page.tsx`

---

## 1️⃣ State Management

```typescript
const [isFullscreen, setIsFullscreen] = useState(false);
```

- `isFullscreen` - boolean state, ktorý určuje, či je heatmapa v fullscreen režime
- Počiatočná hodnota: `false` (normálny režim)

---

## 2️⃣ Toggle Function

```typescript
// Handler pre fullscreen toggle
const toggleFullscreen = () => {
  setIsFullscreen((prev) => !prev);
};
```

- Prepína `isFullscreen` medzi `true` a `false`
- Používa sa v oboch buttonoch (Fullscreen aj Exit)

---

## 3️⃣ ESC Key Handler

```typescript
// ESC handler pre ukončenie fullscreen
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

- Po stlačení **ESC** v fullscreen režime sa heatmapa vráti do normálneho režimu
- Event listener sa automaticky odstráni pri unmount alebo zmene `isFullscreen`

---

## 4️⃣ Fullscreen Button (Normálny režim)

**Pozícia:** V headeri, vedľa legendy

```typescript
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
```

**Štýly:**
- `bg-slate-800` - tmavá farba pozadia
- `hover:bg-slate-700` - svetlejšia farba pri hoveri
- `px-3 py-1.5` - padding
- `rounded-lg` - zaoblené rohy
- `transition-colors` - plynulý prechod farieb

**Ikona:** Fullscreen expand ikona (4 šípky)

---

## 5️⃣ Fullscreen Režim (Po stlačení Fullscreen button)

```typescript
if (isFullscreen) {
  // Fullscreen režim - celá obrazovka bez okrajov
  return (
    <div 
      className="fixed inset-0 bg-black z-50"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }}
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
      <ResponsiveMarketHeatmap
        apiEndpoint="/api/stocks"
        onTileClick={handleTileClick}
        autoRefresh={true}
        refreshInterval={60000}
        initialTimeframe={timeframe}
      />
    </div>
  );
}
```

**Kľúčové vlastnosti:**
- `fixed inset-0` - zaberá celú obrazovku (fixed positioning)
- `bg-black` - čierne pozadie
- `z-50` - vysoký z-index (nad všetkým)
- `width: '100vw', height: '100vh'` - 100% viewport width/height
- **Žiadny header** - iba heatmapa
- **Žiadna legenda** - iba heatmapa

---

## 6️⃣ Exit Button (Fullscreen režim)

**Pozícia:** Pravý horný roh (`top-4 right-4`)

```typescript
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
```

**Štýly:**
- `absolute top-4 right-4` - absolútna pozícia v pravom hornom rohu
- `z-50` - vysoký z-index (nad heatmapou)
- `shadow-lg` - väčší tieň (oproti Fullscreen buttonu)
- `px-4 py-2` - väčší padding (oproti Fullscreen buttonu)
- `text-sm` - väčší font (oproti `text-xs` v Fullscreen buttonu)

**Ikona:** X (close) ikona

---

## 7️⃣ Normálny Režim (Po stlačení Exit button alebo ESC)

```typescript
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
        {/* Legenda vedľa nadpisu */}
        <HeatmapLegend timeframe={timeframe} />
        {/* Fullscreen button */}
        <button onClick={toggleFullscreen} ...>
          ...
        </button>
      </div>
    </div>
    <div 
      className="flex-1 min-h-0 relative w-full"
      style={{ overflow: 'hidden', width: '100%' }}
    >
      <ResponsiveMarketHeatmap ... />
    </div>
  </div>
);
```

**Kľúčové vlastnosti:**
- **Header** - s nadpisom "Heatmap.today"
- **Legenda** - farebná škála vedľa nadpisu
- **Fullscreen button** - v headeri
- **Heatmapa** - zaberá zvyšok obrazovky (`flex-1`)

---

## 📊 Porovnanie Režimov

| Vlastnosť | Normálny režim | Fullscreen režim |
|-----------|----------------|------------------|
| **Header** | ✅ Áno | ❌ Nie |
| **Legenda** | ✅ Áno | ❌ Nie |
| **Fullscreen button** | ✅ Áno (v headeri) | ❌ Nie |
| **Exit button** | ❌ Nie | ✅ Áno (pravý horný roh) |
| **Pozícia** | `h-screen w-screen` | `fixed inset-0` |
| **Z-index** | Normálny | `z-50` |
| **ESC kláves** | ❌ Neaktívny | ✅ Aktívny (ukončí fullscreen) |

---

## 🎯 Flow Diagram

```
Normálny režim (isFullscreen = false)
    │
    ├─► Klik na "Fullscreen" button
    │   └─► toggleFullscreen() → setIsFullscreen(true)
    │       └─► Fullscreen režim
    │
Fullscreen režim (isFullscreen = true)
    │
    ├─► Klik na "Exit" button
    │   └─► toggleFullscreen() → setIsFullscreen(false)
    │       └─► Normálny režim
    │
    └─► Stlačenie ESC klávesu
        └─► handleKeyDown() → setIsFullscreen(false)
            └─► Normálny režim
```

---

## 🔧 CSS Classes Použité

### Fullscreen Container
- `fixed` - fixed positioning
- `inset-0` - top: 0, right: 0, bottom: 0, left: 0
- `bg-black` - čierne pozadie
- `z-50` - z-index: 50

### Buttons
- `bg-slate-800` - tmavá farba pozadia
- `hover:bg-slate-700` - svetlejšia farba pri hoveri
- `rounded-lg` - zaoblené rohy
- `transition-colors` - plynulý prechod farieb
- `shadow-lg` - väčší tieň (iba Exit button)

---

**Status:** ✅ Aktuálny kód z `pmp_prod/src/app/heatmap/page.tsx`


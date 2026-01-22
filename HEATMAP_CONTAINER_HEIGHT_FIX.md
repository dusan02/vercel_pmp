# Heatmap Container Height Fix - Report

## Problém
Debug overlay ukázal:
- `available: 752` ✅ (správny výpočet)
- `finalH: 1581` ✅ (layout je vysoký, má byť scroll)
- **`container: 452×431` ❌** (reálny DOM kontajner má len 431px výšku)

**Príčina:** Niekde v CSS/layout reťazci sa výška "zrúti" na ~431px. Heatmapa sa síce tvári, že má dostupných 752px, ale DOM jej dá len 431px.

## Identifikovaná príčina

`.mobile-app-screen.screen-heatmap` má v CSS `top/left/right/bottom`, ale **nemá `position: fixed|absolute`**, takže `bottom:` sa ignoruje a výška sa určuje podľa flow/layoutu (a tam to končí príliš skoro).

## Implementované opravy

### 1. Pridanie `position: fixed` pre heatmap screen
**Súbor:** `src/app/globals.css` (riadok 396)

**PRED:**
```css
.mobile-app-screen.screen-heatmap {
  padding: 0 !important;
  background: #000;
  z-index: 1;
  margin: 0 !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: var(--tabbar-real-h, var(--tabbar-h)) !important;
  /* ... */
}
```

**PO:**
```css
.mobile-app-screen.screen-heatmap {
  position: fixed !important; /* CRITICAL: Fixed inset to prevent height collapse */
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: var(--tabbar-real-h, var(--tabbar-h)) !important;
  width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  background: #000;
  z-index: 1;
  overflow: hidden !important;
  transform: none !important;
  transition: none !important;
  display: flex !important;
  flex-direction: column !important;
}
```

**Výsledok:** Screen má presnú výšku = viewport – tabbar, už sa "nezmenší" na 431px.

---

### 2. Oprava flex reťazca - odstránenie `height: 100%`
**Súbor:** `src/app/globals.css`

#### 2.1 mobile-treemap-wrapper
**PRED:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  width: 100% !important;
  height: 100% !important; /* ❌ Problematic */
  min-height: 0 !important;
  /* ... */
}
```

**PO:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  /* ... */
}
```

#### 2.2 heatmap-preview-container
**PRED:**
```css
.mobile-app-screen.screen-heatmap .heatmap-preview-container {
  height: 100% !important; /* ❌ Problematic */
  width: 100% !important;
  /* ... */
}
```

**PO:**
```css
.mobile-app-screen.screen-heatmap .heatmap-preview-container {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  /* ... */
}
```

#### 2.3 mobile-treemap-grid
**PRED:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important; /* ❌ Problematic */
  /* ... */
}
```

**PO:**
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  /* CRITICAL: Use flex instead of height: 100% - prevents iOS Safari measurement issues */
  /* ... */
}
```

#### 2.4 heatmap-preview
**PRED:**
```css
.mobile-app-screen.screen-heatmap .heatmap-preview {
  width: 100% !important;
  height: 100% !important; /* ❌ Problematic */
  min-height: 0 !important;
  /* ... */
}
```

**PO:**
```css
.mobile-app-screen.screen-heatmap .heatmap-preview {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  /* ... */
}
```

**Výsledok:** Flex reťazec funguje správne - `flex: 1` + `min-height: 0` namiesto `height: 100%` (ktoré spôsobuje iOS Safari measurement issues).

---

### 3. Pridanie debug merania pre všetky kľúčové elementy
**Súbor:** `src/components/MobileTreemap.tsx` (riadok 817)

**PRIDANÉ:**
```tsx
{/* Debug overlay (DEV only) - shows viewport measurements for Safari/Chrome debugging */}
{process.env.NODE_ENV === 'development' && (() => {
  // Measure key elements for debugging
  const screenEl = document.querySelector('.mobile-app-screen.screen-heatmap') as HTMLElement;
  const previewEl = document.querySelector('.mobile-app-screen.screen-heatmap .heatmap-preview') as HTMLElement;
  const gridEl = containerRef.current;
  const tabbarEl = document.querySelector('.mobile-app-tabbar') as HTMLElement;
  
  const screenRect = screenEl?.getBoundingClientRect();
  const previewRect = previewEl?.getBoundingClientRect();
  const gridRect = gridEl?.getBoundingClientRect();
  const tabbarRect = tabbarEl?.getBoundingClientRect();
  
  return (
    <div>
      {/* Existing debug info */}
      <div>container: {containerSize.width}×{containerSize.height}</div>
      {/* ... */}
      
      {/* NEW: Key element measurements */}
      <div style={{ marginTop: '8px', borderTop: '1px solid rgba(0,255,0,0.3)', paddingTop: '4px' }}>
        <div>screen-heatmap: {screenRect ? `${Math.floor(screenRect.width)}×${Math.floor(screenRect.height)}` : 'N/A'}</div>
        <div>heatmap-preview: {previewRect ? `${Math.floor(previewRect.width)}×${Math.floor(previewRect.height)}` : 'N/A'}</div>
        <div>mobile-treemap-grid: {gridRect ? `${Math.floor(gridRect.width)}×${Math.floor(gridRect.height)}` : 'N/A'}</div>
        <div>tabbar: {tabbarRect ? `${Math.floor(tabbarRect.width)}×${Math.floor(tabbarRect.height)}` : 'N/A'}</div>
      </div>
    </div>
  );
})()}
```

**Výsledok:** Debug overlay teraz zobrazuje výšky všetkých kľúčových elementov, čo pomáha identifikovať, kde presne sa výška láme.

---

## Zhrnutie zmien

### Súbory zmenené:
1. `src/app/globals.css`
   - Pridané `position: fixed !important;` pre `.mobile-app-screen.screen-heatmap`
   - Opravený flex reťazec: odstránené `height: 100%`, použité `flex: 1` + `min-height: 0`
   - Opravené: `.mobile-treemap-wrapper`, `.heatmap-preview-container`, `.mobile-treemap-grid`, `.heatmap-preview`

2. `src/components/MobileTreemap.tsx`
   - Pridané debug meranie pre všetky kľúčové elementy (screen-heatmap, heatmap-preview, mobile-treemap-grid, tabbar)

### Výsledok:
✅ **position: fixed** zabezpečuje, že screen má presnú výšku = viewport – tabbar  
✅ **Flex reťazec** funguje správne (`flex: 1` + `min-height: 0` namiesto `height: 100%`)  
✅ **Debug meranie** zobrazuje výšky všetkých kľúčových elementov  
✅ **Container height** by mal byť teraz ~752px namiesto 431px

## Testovanie

Po nasadení otestujte:
1. **Debug overlay** - skontrolujte, či `screen-heatmap` má správnu výšku (~752px)
2. **Container height** - skontrolujte, či `mobile-treemap-grid` má správnu výšku (~752px)
3. **Prázdny pás** - skontrolujte, či zmizol medzi heatmapou a tabbarom

## Commit
- Commit: `[pending]` - "Fix heatmap container height: add position fixed + fix flex chain + add debug measurements"

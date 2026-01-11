# Mobile UX Heatmap - Analýza a Refaktoring Report

## 🔍 Identifikovaný Problém

**Hlavný problém:** Heatmapa nie je vertikálne roztiahnutá po dĺžke obrazovky, čo spôsobuje, že detail panel akcie (napr. GOOGL) nie je viditeľný.

**Symptómy:**
- Detail panel sa zobrazuje na `bottom: 72px` (nad tab bar)
- Heatmapa nezaberie celú dostupnú výšku obrazovky
- Obsah heatmapy sa neprekrýva až po spodný okraj (pred tab bar)

---

## 📐 Aktuálna Štruktúra HTML/CSS

### 1. Hierarchia Komponentov

```
MobileApp (flex column, min-height: 100vh/100dvh)
├── MobileHeader (fixed, top: 0, z-index: 100, height: ~56px)
├── mobile-app-content (flex: 1, padding-top: 56px)
│   └── MobileScreen.screen-heatmap (position: absolute, height: 100%)
│       └── HomeHeatmap
│           └── HeatmapPreview
│               └── MobileTreemap
│                   ├── Header (fixed, height: 48px)
│                   ├── Spacer (height: 48px)
│                   └── mobile-treemap-grid (flex: 1, overflow)
│                       └── Treemap content (width: containerSize.width * zoom, height: layoutHeight * zoom)
└── MobileTabBar (fixed, bottom: 0, z-index: 9999, height: 72px)
```

### 2. Kľúčové CSS Pravidlá

#### `mobile-app-content` (globals.css:92-106)
```css
.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-bottom: 0;
  margin-bottom: 0;
  padding-top: 56px; /* Výška headeru */
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
```

**Problém:** `padding-top: 56px` je správne, ale `flex: 1` môže byť problém ak parent nemá správnu výšku.

#### `mobile-app-screen.screen-heatmap` (globals.css:151-161)
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
```

**Problém:** `height: 100%` z `mobile-app-content`, ale `mobile-app-content` má `flex: 1`, čo môže viesť k nesprávnej výške.

#### `mobile-treemap-wrapper` (globals.css:168-177, 199-210)
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  height: 100%;
  width: 100%;
  position: relative;
  margin: 0;
  padding: 0;
  /* PROBLÉM: padding-bottom sa duplikuje a konfliktuje */
  padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* Duplicitné pravidlo - konflikt! */
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0;
  margin: 0 !important;
  padding: 0 !important; /* Prepisuje padding-bottom vyššie! */
  margin-bottom: 0 !important;
  padding-bottom: 0 !important; /* Prepisuje padding-bottom! */
  display: flex;
  flex-direction: column;
}
```

**KRITICKÝ PROBLÉM:** Duplicitné CSS pravidlá sa prepisujú! Druhé pravidlo prepisuje `padding-bottom: 0`, čo odstraňuje priestor pre tab bar.

#### `mobile-treemap-grid` (globals.css:213-221)
```css
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1;
  min-height: 0;
  margin: 0 !important;
  padding: 0 !important;
  margin-bottom: 0 !important;
  padding-bottom: 0 !important;
}
```

**Problém:** `flex: 1` by mal fungovať, ale parent (`mobile-treemap-wrapper`) má konfliktné CSS pravidlá.

### 3. Komponentová Štruktúra

#### `MobileTreemap.tsx` (riadok 680-724)
```tsx
<div
  ref={containerRef}
  className="mobile-treemap-grid"
  style={{
    position: 'relative',
    background: '#000',
    flex: 1,
    minHeight: 0,
    overflowX: zoom > 1 ? 'auto' : 'hidden',
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
    WebkitOverflowScrolling: 'touch' as any,
    paddingBottom: 0,
    marginBottom: 0,
  }}
>
  <div
    style={{
      position: 'relative',
      width: containerSize.width * zoom,
      height: layoutHeight * zoom, // PROBLÉM: layoutHeight môže byť menší ako dostupný priestor
      marginBottom: 0,
      paddingBottom: 0,
    }}
  >
    {leaves.map((leaf) => renderLeaf(leaf))}
  </div>
</div>
```

**Problém:** `layoutHeight` sa počíta z dát, nie z dostupného priestoru. Ak je `layoutHeight` menší ako dostupná výška, heatmapa nezaberie celú výšku.

#### Detail Panel (MobileTreemap.tsx:743-760)
```tsx
<div
  className="fixed inset-x-0 bottom-0"
  style={{
    zIndex: 1001,
    background: '#0f0f0f',
    color: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0 -12px 30px rgba(0,0,0,0.35)',
    padding: '12px 14px',
    maxHeight: 200,
    overflow: 'hidden',
    bottom: '72px', // PROBLÉM: Ak heatmapa nie je roztiahnutá, panel môže byť mimo viewportu
  }}
>
```

**Problém:** Detail panel je na `bottom: 72px`, ale ak heatmapa nezaberie celú výšku, panel môže byť mimo viditeľnej oblasti.

---

## 🔧 Návrh Riešenia

### Riešenie 1: Oprava CSS Konfliktov

**Krok 1:** Odstrániť duplicitné CSS pravidlá pre `mobile-treemap-wrapper`

**Súčasný stav (globals.css:168-210):**
```css
/* Prvé pravidlo */
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  height: 100%;
  padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
}

/* Duplicitné pravidlo - PREPISUJE padding-bottom! */
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  padding: 0 !important; /* ❌ Prepisuje padding-bottom */
  padding-bottom: 0 !important; /* ❌ Odstraňuje priestor pre tab bar */
}
```

**Opravené:**
```css
/* Zlúčiť do jedného pravidla */
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  height: 100% !important;
  width: 100% !important;
  position: relative;
  margin: 0 !important;
  padding: 0 !important;
  /* CRITICAL: Reserve space for tab bar at bottom */
  padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
  box-sizing: border-box;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0;
}
```

### Riešenie 2: Zabezpečiť, že `mobile-app-content` má správnu výšku

**Súčasný stav:**
```css
.mobile-app-content {
  flex: 1;
  padding-top: 56px;
}
```

**Problém:** `flex: 1` funguje len ak parent má definovanú výšku. `MobileApp` má `min-height: 100vh`, ale nie `height: 100vh`.

**Opravené:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100vh; /* ✅ Pridať height, nie len min-height */
  height: 100dvh; /* Dynamic viewport height pre iOS */
  background: #ffffff;
  position: relative;
  overflow: hidden;
}

.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-top: 56px; /* Výška headeru */
  /* CRITICAL: Calculate available height */
  height: calc(100vh - 56px - 72px); /* Viewport - header - tab bar */
  height: calc(100dvh - 56px - 72px); /* Dynamic viewport pre iOS */
  min-height: 0;
}
```

### Riešenie 3: Zabezpečiť, že `mobile-treemap-grid` zaberie celú dostupnú výšku

**Súčasný stav (MobileTreemap.tsx:680-724):**
```tsx
<div
  ref={containerRef}
  className="mobile-treemap-grid"
  style={{
    flex: 1,
    minHeight: 0,
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
  }}
>
  <div style={{
    height: layoutHeight * zoom, // ❌ Môže byť menší ako dostupný priestor
  }}>
```

**Opravené:**
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
    height: '100%', // ✅ Zaberie celú dostupnú výšku
    overflowX: zoom > 1 ? 'auto' : 'hidden',
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
    WebkitOverflowScrolling: 'touch' as any,
  }}
>
  <div
    style={{
      position: 'relative',
      width: containerSize.width * zoom,
      height: Math.max(layoutHeight * zoom, containerSize.height), // ✅ Minimum = dostupná výška
      minHeight: '100%', // ✅ Zabezpečí, že obsah je aspoň taký vysoký ako container
    }}
  >
```

### Riešenie 4: Oprava Detail Panel Pozície

**Súčasný stav:**
```tsx
<div style={{
  bottom: '72px', // ✅ Správne nad tab bar
  maxHeight: 200,
}}>
```

**Problém:** Ak heatmapa nie je roztiahnutá, panel môže byť mimo viewportu.

**Opravené:**
```tsx
<div
  className="fixed inset-x-0"
  style={{
    zIndex: 1001,
    background: '#0f0f0f',
    color: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0 -12px 30px rgba(0,0,0,0.35)',
    padding: '12px 14px',
    maxHeight: 'calc(100vh - 72px - 56px - 48px)', // ✅ Viewport - tab bar - header - heatmap header
    maxHeight: 'calc(100dvh - 72px - 56px - 48px)', // ✅ Dynamic viewport pre iOS
    overflow: 'auto', // ✅ Povoliť scroll ak je obsah príliš vysoký
    bottom: '72px', // ✅ Nad tab bar
  }}
>
```

---

## 📋 Zhrnutie Problémov

1. **CSS Konflikty:** Duplicitné pravidlá pre `mobile-treemap-wrapper` sa prepisujú
2. **Výška Containeru:** `mobile-app-content` má `flex: 1`, ale parent nemá `height: 100vh`
3. **Layout Height:** `layoutHeight` sa počíta z dát, nie z dostupného priestoru
4. **Detail Panel:** Môže byť mimo viewportu ak heatmapa nie je roztiahnutá

---

## 🎯 Odporúčané Zmeny

### 1. CSS Opravy (globals.css)

```css
/* ✅ Opravené: mobile-app */
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* iOS compatibility */
  min-height: 100vh;
  min-height: 100dvh;
  background: #ffffff;
  position: relative;
  overflow: hidden;
}

/* ✅ Opravené: mobile-app-content */
.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding-top: 56px; /* Výška headeru */
  /* CRITICAL: Explicit height calculation */
  height: calc(100vh - 56px - 72px);
  height: calc(100dvh - 56px - 72px);
  min-height: 0;
}

/* ✅ Opravené: mobile-treemap-wrapper (zlúčené pravidlá) */
.mobile-app-screen.screen-heatmap .mobile-treemap-wrapper {
  height: 100% !important;
  width: 100% !important;
  position: relative;
  margin: 0 !important;
  padding: 0 !important;
  /* CRITICAL: Reserve space for tab bar */
  padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important;
  box-sizing: border-box;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0;
}

/* ✅ Opravené: mobile-treemap-grid */
.mobile-app-screen.screen-heatmap .mobile-treemap-grid {
  flex: 1 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important; /* ✅ Zaberie celú dostupnú výšku */
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
}
```

### 2. Komponentové Opravy (MobileTreemap.tsx)

```tsx
// ✅ Opravené: containerRef style
<div
  ref={containerRef}
  className="mobile-treemap-grid"
  style={{
    position: 'relative',
    background: '#000',
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%', // ✅ Explicit height
    overflowX: zoom > 1 ? 'auto' : 'hidden',
    overflowY: (expanded || zoom > 1) ? 'auto' : 'hidden',
    WebkitOverflowScrolling: 'touch' as any,
  }}
>
  <div
    style={{
      position: 'relative',
      width: containerSize.width * zoom,
      height: Math.max(
        layoutHeight * zoom,
        containerSize.height // ✅ Minimum = dostupná výška
      ),
      minHeight: '100%', // ✅ Zabezpečí minimálnu výšku
    }}
  >
    {leaves.map((leaf) => renderLeaf(leaf))}
  </div>
</div>

// ✅ Opravené: Detail panel
<div
  className="fixed inset-x-0"
  style={{
    zIndex: 1001,
    background: '#0f0f0f',
    color: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0 -12px 30px rgba(0,0,0,0.35)',
    padding: '12px 14px',
    maxHeight: `calc(100dvh - 72px - 56px - 48px)`, // ✅ Viewport - tab bar - header - heatmap header
    overflow: 'auto', // ✅ Povoliť scroll
    bottom: '72px',
  }}
>
```

---

## 🧪 Testovanie

Po aplikovaní zmien overiť:

1. ✅ Heatmapa zaberie celú dostupnú výšku obrazovky
2. ✅ Detail panel (GOOGL) je viditeľný nad tab bar
3. ✅ Tab bar zostáva viditeľný po celý čas
4. ✅ Scroll funguje správne v heatmape
5. ✅ Zoom a expand/compact fungujú správne
6. ✅ Na rôznych veľkostiach obrazovky (iPhone SE, iPhone 14 Pro, iPad)

---

## 📝 Poznámky

- Použiť `100dvh` namiesto `100vh` pre lepšiu iOS kompatibilitu
- `env(safe-area-inset-bottom)` pre iPhone s notch
- `min-height: 0` je kritické pre flex children, ktoré majú `flex: 1`
- Detail panel by mal mať `overflow: auto` ak môže byť príliš vysoký

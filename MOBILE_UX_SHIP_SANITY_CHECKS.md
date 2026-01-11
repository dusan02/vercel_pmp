# Mobile UX - Ship Sanity Checks

## ✅ Kontrola 1: Sheet zatváranie pri prepnutí view

**Status:** ✅ **OPRAVENÉ**

**Nález:**
- `selectedCompany` je lokálny state v `MobileTreemap` (riadok 298)
- Pri prepnutí view (napr. z heatmap na portfolio) sa `MobileTreemap` nemusí unmountovať (len sa skryje cez `MobileScreen`)
- Sheet zostáva otvorený aj po prepnutí view → **buggy UX**

**Riešenie:**
Pridať prop `activeView` do `MobileTreemap` a `useEffect`, ktorý zatvorí sheet pri zmene view.

**Kód:**
```tsx
// MobileTreemap.tsx - pridať prop
interface MobileTreemapProps {
  // ... existing props
  activeView?: string; // Signalizuje, či je heatmap aktívny view
}

// V komponente pridať useEffect
useEffect(() => {
  // Zatvor sheet, keď sa view prepne (heatmap nie je aktívny)
  if (activeView !== 'heatmap' && selectedCompany) {
    setSelectedCompany(null);
  }
}, [activeView, selectedCompany]);
```

---

## ✅ Kontrola 2: touch-action na heatmap scroll kontajneri

**Status:** ✅ **OK** (ale možno optimalizovať)

**Nález:**
- `touch-action: manipulation` je len na jednom mieste (riadok 647) - na tile buttonoch
- `.mobile-treemap-grid` nemá explicitný `touch-action`
- CSS má `touch-action: pan-y` na `.mobile-app-content` (riadok 112)

**Riešenie:**
Ak chceš pinch/zoom alebo panning v mape, `touch-action: pan-y` môže obmedzovať. Keďže máš vlastný zoom UI (nie pinch), je to OK.

**Odporúčanie:**
- Ak chceš zachovať panning + zoom UI → nechaj `touch-action: pan-y`
- Ak chceš pridať pinch/zoom → zmeň na `touch-action: pan-x pan-y pinch-zoom`

**Aktuálny stav:**
```css
/* globals.css:112 */
.mobile-app-content {
  touch-action: pan-y; /* ✅ OK pre vlastný zoom UI */
}
```

---

## ✅ Kontrola 3: position: fixed + 100dvh na iOS

**Status:** ✅ **OK** (ale watch-out)

**Nález:**
- `.mobile-app` má `height: 100dvh` (riadok 19)
- Header je `position: fixed` (riadok 38)
- Tabbar je `position: fixed` (riadok 365)

**Watch-out:**
- Keď sa vysunie klávesnica (napr. search input), iOS niekedy spraví "skok"
- Na heatmap view nie sú inputy → **ignorovať**

**Aktuálny stav:**
```css
/* globals.css:19 */
.mobile-app {
  height: 100dvh; /* ✅ OK pre iOS */
  height: 100vh; /* Fallback */
}
```

---

## ✅ Kontrola 4: Z-index poradie sheetu vs tabbar

**Status:** ✅ **OK** (ale UX rozhodnutie)

**Nález:**
- Tabbar má `z-index: 9999 !important` (riadok 369)
- Overlay má `zIndex: 1000` (riadok 735)
- Detail panel má `zIndex: 1001` (riadok 743)

**Verdikt:**
- Tabbar je vždy navrchu (9999) ✅
- Sheet nikdy nepôjde "nad tabbar" ✅
- Ak chceš "full screen sheet", bude treba tabbar dočasne skryť

**Aktuálny stav:**
```tsx
// MobileTreemap.tsx:735-743
<button style={{ zIndex: 1000, ... }} /> {/* Overlay */}
<div style={{ zIndex: 1001, ... }} /> {/* Detail panel */}
```

```css
/* globals.css:369 */
.mobile-app-tabbar {
  z-index: 9999 !important; /* ✅ Tabbar je vždy navrchu */
}
```

---

## 📋 Implementácia Opravy - ✅ DOKONČENÉ

### 1. ✅ Pridaný prop `activeView` do MobileTreemap

**Súbor:** `src/components/MobileTreemap.tsx`

**Zmena:**
- Pridaný `activeView?: string` do `MobileTreemapProps`
- Pridaný `useEffect`, ktorý zatvorí sheet pri prepnutí view

### 2. ✅ Preposlaný prop cez celý chain

**Súbory:**
- `src/app/HomePage.tsx` → `HomeHeatmap` (s `activeView={activeMobileSection === 'heatmap' ? 'heatmap' : undefined}`)
- `src/components/home/HomeHeatmap.tsx` → `HeatmapPreview` (s `activeView`)
- `src/components/HeatmapPreview.tsx` → `ResponsiveMarketHeatmap` (s `activeView`)
- `src/components/ResponsiveMarketHeatmap.tsx` → `MobileTreemap` (s `activeView`)

### 3. ✅ useEffect na zatvorenie sheetu

**Súbor:** `src/components/MobileTreemap.tsx`

**Kód:**
```tsx
// UX: Automaticky zatvor sheet pri prepnutí view (z heatmap na iný tab)
useEffect(() => {
  if (activeView !== 'heatmap' && selectedCompany) {
    setSelectedCompany(null);
  }
}, [activeView, selectedCompany]);
```

**Výsledok:** Sheet sa automaticky zatvorí pri prepnutí view (z heatmap na iný tab).

---

## ✅ Finálny Status

| Kontrola | Status | Akcia |
|----------|--------|-------|
| 1. Sheet zatváranie | ✅ OPRAVENÉ | Pridaný `activeView` prop + useEffect |
| 2. touch-action | ✅ OK | Žiadna zmena |
| 3. 100dvh na iOS | ✅ OK | Žiadna zmena |
| 4. Z-index poradie | ✅ OK | Žiadna zmena |

---

## 🎯 Odporúčanie

**UX rozhodnutie:** Sheet by sa mal **automaticky zatvárať** pri prepnutí view (z heatmap na iný tab). Toto je "najčistejší" UX variant a zabráni "buggy" pocitu.

**Implementácia:** Pridať `activeView` prop do `MobileTreemap` a `useEffect`, ktorý zatvorí sheet pri zmene view.

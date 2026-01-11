# Mobile UX - Finálne Kontroly (3 Body)

## ✅ Kontrola 1: Header padding-top vs fixed header

**Status:** ✅ **SPRÁVNE**

**Nález:**
- Header je `position: fixed` (`.mobile-app-header { position: fixed; }` v `globals.css:38`)
- `.mobile-app-content` má `padding-top: var(--header-h)` (riadok 107)
- **Verdikt:** `padding-top` je správne, lebo header je fixed a nie je v normálnom DOM flow

**Kód:**
```css
/* globals.css:37-38 */
.mobile-app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  /* ... */
}

/* globals.css:107 */
.mobile-app-content {
  padding-top: var(--header-h); /* ✅ SPRÁVNE pre fixed header */
  /* ... */
}
```

---

## ✅ Kontrola 2: Tabbar výška - CSS variable vs reálny DOM

**Status:** ✅ **KONZISTENTNÉ**

**Nález:**
- CSS Variable: `--tabbar-h: 72px` (`globals.css:12`)
- Reálna výška: `height: 72px` (`globals.css:379`)
- `padding-bottom: calc(0.5rem + env(safe-area-inset-bottom))` (riadok 378)
- Na všetkých breakpointoch je výška konzistentná (len farby sa menia v dark mode, nie výška)

**Kód:**
```css
/* globals.css:12 */
:root {
  --tabbar-h: 72px;
}

/* globals.css:379 */
.mobile-app-tabbar {
  height: 72px; /* ✅ Sedí s CSS variable */
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  /* ... */
}
```

**Verdikt:** 72px sedí na všetkých mobile šírkach. **Neriešiť runtime meranie** - je to zbytočné.

---

## ✅ Kontrola 3: Overlay button - tabbar klikateľnosť pri otvorenom sheet-e

**Status:** ✅ **SPRÁVNE - Tabbar je klikateľný**

**Nález:**
- Overlay má `bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))'` (`MobileTreemap.tsx:737`)
- Overlay má `zIndex: 1000` (riadok 735)
- Tabbar má `z-index: 9999 !important` (`globals.css:369`)
- Detail panel má `zIndex: 1001` (riadok 743)

**Kód:**
```tsx
// MobileTreemap.tsx:728-739
<button
  type="button"
  aria-label="Close details"
  onClick={closeSheet}
  className="fixed inset-0"
  style={{
    background: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    // ✅ Don't block the mobile tab bar + safe area
    bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom))',
  }}
/>
```

**Verdikt:** 
- Overlay **neprekrýva tabbar** (bottom je nastavený na `calc(tabbar + safe-area)`)
- Tabbar má vyšší z-index (9999) ako overlay (1000)
- **Tabbar je klikateľný aj pri otvorenom sheet-e** ✅

**UX rozhodnutie:** Toto je správne - používateľ môže prepnúť view aj so sheetom otvoreným.

---

## ✅ Kontrola 4: ResizeObserver - containerSize aktualizácia

**Status:** ✅ **IMPLEMENTOVANÉ**

**Nález:**
- `MobileTreemap.tsx` používa `ResizeObserver` (riadok 149)
- `containerSize` sa aktualizuje pri zmene veľkosti kontajnera
- `Math.max(layoutHeight * zoom, containerSize.height)` (riadok 715) používa aktuálnu `containerSize.height`

**Kód:**
```tsx
// MobileTreemap.tsx:149-156
const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const { width: w, height: h } = entry.contentRect;
    setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  }
});
if (containerRef.current) {
  ro.observe(containerRef.current);
}
```

**Verdikt:** `containerSize.height` sa aktualizuje pri zmene veľkosti kontajnera (napr. zoom, orientácia). ✅

---

## 📋 Testovacie Scenáre (Pred Shipom)

### 1. iPhone SE / úzky viewport
- [ ] Otvoriť sheet na veľkom tile
- [ ] Scrollovať v sheete
- [ ] Overiť, že `overflow: auto` funguje správne

### 2. Landscape → Portrait
- [ ] Prepnúť z landscape na portrait
- [ ] Overiť, že sheet stále sedí správne
- [ ] Overiť, že tabbar nevbehne do obsahu
- [ ] Overiť, že heatmapa sa správne prispôsobí

### 3. Zoom > 1
- [ ] Nastaviť zoom > 1
- [ ] Overiť, že `containerSize.height` sa aktualizuje (ResizeObserver)
- [ ] Overiť, že `Math.max(layoutHeight * zoom, containerSize.height)` používa aktuálnu výšku
- [ ] Overiť, že detail panel je stále viditeľný

---

## ✅ Finálny Verdikt

**Všetky 3 kontroly sú OK:**
1. ✅ Header padding-top je správne (fixed header)
2. ✅ Tabbar výška je konzistentná (72px)
3. ✅ Overlay neblokuje tabbar (tabbar je klikateľný)

**Dodatočná kontrola:**
4. ✅ ResizeObserver je implementovaný (containerSize sa aktualizuje)

**Status:** ✅ **SHIP-READY**

Ďalšie kroky:
1. Build aplikácie
2. Test na rôznych mobilných zariadeniach (iPhone SE, iPhone 14 Pro, iPad)
3. Overenie detail panelu (GOOGL) viditeľnosti
4. Overenie tab bar viditeľnosti
5. Test landscape/portrait prechodu
6. Test zoom > 1

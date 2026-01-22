# iOS Safari 100vh Fix - Kompletný Report

## Všetky implementované vylepšenia

### 1. ✅ Visual Viewport cez CSS premennú
**Súbor:** `src/components/mobile/MobileApp.tsx`
- Nastavuje `--app-height` CSS premennú podľa visual viewport
- Používa `window.visualViewport?.height` pre presnejšie meranie na iOS Safari
- Aktualizuje sa pri resize, scroll a orientation change

### 2. ✅ RAF Throttle pre visualViewport scroll listener
**Súbor:** `src/components/mobile/MobileApp.tsx`
- Pridaný `raf` ref na throttling
- Zabraňuje jank počas iOS Safari toolbar animácie (spam eventy → RAF throttle)

### 3. ✅ Guard proti mikro-oscilácii výšky (1px bounce)
**Súbor:** `src/components/mobile/MobileApp.tsx`
```tsx
let last = -1; // Guard against 1px bounce/micro-oscillation

const setAppHeight = () => {
  if (raf) return;
  raf = window.requestAnimationFrame(() => {
    raf = 0;
    const h = Math.floor(window.visualViewport?.height ?? window.innerHeight);
    // Only update if height actually changed (prevents 1px bounce repaints)
    if (h !== last) {
      last = h;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    }
  });
};
```

**Výsledok:** Zabraňuje zbytočným repaintom pri 1px bounce počas toolbar animácie.

---

### 4. ✅ Meranie reálnej výšky tabbaru
**Súbor:** `src/components/mobile/MobileTabBar.tsx`
- Meria skutočnú výšku tabbaru z DOM (vrátane safe-area)
- Nastavuje `--tabbar-real-h` CSS premennú

### 5. ✅ Guard proti mikro-oscilácii tabbaru
**Súbor:** `src/components/mobile/MobileTabBar.tsx`
```tsx
let last = -1; // Guard against 1px bounce/micro-oscillation

const updateTabbarHeight = () => {
  const h = Math.floor(el.getBoundingClientRect().height);
  // Only update if height actually changed (prevents 1px bounce repaints)
  if (h > 0 && h !== last) {
    last = h;
    document.documentElement.style.setProperty('--tabbar-real-h', `${h}px`);
  }
};
```

**Výsledok:** Zabraňuje zbytočným repaintom pri 1px bounce.

---

### 6. ✅ Optimalizácia tabbar merania (ResizeObserver only)
**Súbor:** `src/components/mobile/MobileTabBar.tsx`
- Odstránený redundantný `window.resize` listener
- Ponechaný len `ResizeObserver` + `orientationchange`
- ResizeObserver už chytá: safe-area padding changes, font/zoom, layout zmeny

**PRED:**
```tsx
const ro = new ResizeObserver(updateTabbarHeight);
ro.observe(el);
window.addEventListener('resize', updateTabbarHeight); // Redundantný
window.addEventListener('orientationchange', updateTabbarHeight);
```

**PO:**
```tsx
const ro = new ResizeObserver(updateTabbarHeight);
ro.observe(el);
// Note: window.resize removed - ResizeObserver already handles resize events
window.addEventListener('orientationchange', updateTabbarHeight);
```

**Výsledok:** Menej duplicitných volaní, čistejšie.

---

### 7. ✅ CSS používa --tabbar-real-h s fallbackom
**Súbor:** `src/app/globals.css`
- Heatmap screen používa `var(--tabbar-real-h, var(--tabbar-h))`
- Reálna meraná výška (vrátane safe-area) s fallbackom na základnú výšku

### 8. ✅ Debug CSS (zakomentovaný)
**Súbor:** `src/app/globals.css`
```css
/* DEBUG: Visual boundaries (only in development) - remove in production */
@media (max-width: 1023px) {
  .mobile-app {
    /* outline: 1px solid rgba(255, 255, 255, 0.15); */ /* Uncomment for debug */
  }
  .mobile-app-screen.screen-heatmap {
    /* outline: 1px solid rgba(0, 255, 255, 0.25); */ /* Uncomment for debug */
  }
  .mobile-app-tabbar {
    /* outline: 1px solid rgba(255, 0, 255, 0.25); */ /* Uncomment for debug */
  }
}
```

**Výsledok:** Jednoducho sa dá zapnúť pre debug (odkomentovať).

---

## Overenie tabbar position

**Súbor:** `src/app/globals.css` (riadok 722)
```css
.mobile-app-tabbar {
  position: fixed !important;
  bottom: 0 !important;
  ...
}
```

✅ Tabbar je `position: fixed; bottom: 0;` → `--tabbar-real-h` je správna hodnota pre `bottom` offset heatmap screen.

---

## Zhrnutie zmien

### Súbory zmenené:
1. `src/components/mobile/MobileApp.tsx`
   - RAF throttle pre visualViewport scroll listener
   - Guard proti mikro-oscilácii (only-if-changed check)

2. `src/components/mobile/MobileTabBar.tsx`
   - Meranie reálnej výšky tabbaru (vrátane safe-area)
   - Guard proti mikro-oscilácii (only-if-changed check)
   - Optimalizácia: odstránený redundantný `window.resize`

3. `src/app/globals.css`
   - CSS používa `--app-height` a `--tabbar-real-h`
   - Debug CSS (zakomentovaný)

### Výsledok:
✅ **Visual viewport** cez CSS premennú (iOS Safari fix)  
✅ **RAF throttle** zabraňuje jank počas toolbar animácie  
✅ **Guards proti mikro-oscilácii** zabraňujú zbytočným repaintom  
✅ **Reálna výška tabbaru** sa meria z DOM (presnejšie)  
✅ **Optimalizované meranie** (ResizeObserver only, bez redundantných listenerov)  
✅ **Debug CSS** pripravený na použitie

## Testovanie - Acceptance Checklist

Po nasadení otestujte:

1. **iPhone Safari:**
   - ✅ Toolbar viditeľný → heatmap končí pri tabbare, bez pásu
   - ✅ Scroll (toolbar hidden) → heatmap končí pri tabbare, bez pásu
   - ✅ Rotácia portrait/landscape → správne sa upraví

2. **iPhone Chrome:**
   - ✅ Podobný test (Chrome má tiež svoje UI)

3. **iPad Safari (ak dostupné):**
   - ✅ Iné safe-area správanie → overiť správne fungovanie

4. **Android Chrome:**
   - ✅ Overiť, že fallback `innerHeight` nerobí škody

Ak po týchto testoch nevidíte pás nikde, máte to uzavreté a môžete to považovať za vyriešené UX bugfix.

## Commits
- Commit 1: `6b87dd8` - "Fix iOS Safari 100vh issue: use visual viewport via CSS variable + remove double safe-area"
- Commit 2: `ee7a23b` - "iOS Safari 100vh: add RAF throttle + measure real tabbar height"
- Commit 3: `[pending]` - "iOS Safari 100vh: add guards against micro-oscillation + optimize tabbar measurement"

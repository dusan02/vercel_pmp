# iOS Safari 100vh Fix - Finálny Report

## Implementované vylepšenia

### 1. ✅ RAF Throttle pre visualViewport scroll listener
**Súbor:** `src/components/mobile/MobileApp.tsx`

**PRED:**
```tsx
const setAppHeight = () => {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.floor(h)}px`);
};
// ...
window.visualViewport.addEventListener('scroll', setAppHeight);
```

**PO:**
```tsx
let raf = 0;

const setAppHeight = () => {
  // RAF throttle: prevent jank during iOS Safari toolbar animation
  if (raf) return;
  raf = window.requestAnimationFrame(() => {
    raf = 0;
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${Math.floor(h)}px`);
  });
};
// ...
const vv = window.visualViewport;
vv?.addEventListener('resize', setAppHeight);
vv?.addEventListener('scroll', setAppHeight);
// ...
return () => {
  if (raf) cancelAnimationFrame(raf);
  vv?.removeEventListener('resize', setAppHeight);
  vv?.removeEventListener('scroll', setAppHeight);
  // ...
};
```

**Výsledok:** Zabraňuje jank počas iOS Safari toolbar animácie (spam eventy → RAF throttle).

---

### 2. ✅ Meranie reálnej výšky tabbaru
**Súbor:** `src/components/mobile/MobileTabBar.tsx`

**PRIDANÉ:**
```tsx
// Measure real tabbar height (including safe-area) and set CSS variable
useEffect(() => {
  const el = navRef.current;
  if (!el) return;

  const updateTabbarHeight = () => {
    const height = el.getBoundingClientRect().height;
    if (height > 0) {
      // Set real measured height (includes safe-area from padding-bottom)
      document.documentElement.style.setProperty('--tabbar-real-h', `${Math.floor(height)}px`);
    }
  };

  // Initial measurement
  updateTabbarHeight();

  // Update on resize (orientation change, safe-area changes)
  const ro = new ResizeObserver(updateTabbarHeight);
  ro.observe(el);
  window.addEventListener('resize', updateTabbarHeight);
  window.addEventListener('orientationchange', updateTabbarHeight);

  return () => {
    ro.disconnect();
    window.removeEventListener('resize', updateTabbarHeight);
    window.removeEventListener('orientationchange', updateTabbarHeight);
  };
}, []);
```

**Výsledok:** `--tabbar-real-h` obsahuje skutočnú meranú výšku tabbaru (vrátane safe-area).

---

### 3. ✅ CSS používa --tabbar-real-h s fallbackom
**Súbor:** `src/app/globals.css`

**PRED:**
```css
:root {
  --header-h: 56px;
  --tabbar-h: 72px;
}
/* ... */
bottom: var(--tabbar-h) !important;
```

**PO:**
```css
:root {
  --header-h: 56px;
  --tabbar-h: 72px; /* Base height without safe-area (safe-area is added via padding-bottom) */
  --tabbar-real-h: 72px; /* Real measured height including safe-area (set by MobileTabBar component) */
}
/* ... */
/* CRITICAL: Heatmap screen ends exactly at top edge of tabbar (no gap)
   Use --tabbar-real-h if available (measured real height including safe-area),
   otherwise fallback to --tabbar-h (base height without safe-area) */
bottom: var(--tabbar-real-h, var(--tabbar-h)) !important;
```

**Výsledok:** Heatmap screen používa reálnu meranú výšku tabbaru (vrátane safe-area), s fallbackom na základnú výšku.

---

## Zhrnutie zmien

### Súbory zmenené:
1. `src/components/mobile/MobileApp.tsx`
   - Pridaný RAF throttle pre `visualViewport` scroll listener
   - Zabraňuje jank počas iOS Safari toolbar animácie

2. `src/components/mobile/MobileTabBar.tsx`
   - Pridané meranie reálnej výšky tabbaru (vrátane safe-area)
   - Nastavuje `--tabbar-real-h` CSS premennú

3. `src/app/globals.css`
   - Pridaná `--tabbar-real-h` CSS premenná s komentárom
   - Heatmap screen používa `--tabbar-real-h` s fallbackom na `--tabbar-h`

### Výsledok:
✅ **RAF throttle** zabraňuje jank počas iOS Safari toolbar animácie  
✅ **Reálna výška tabbaru** sa meria z DOM (vrátane safe-area)  
✅ **Heatmap screen** používa reálnu meranú výšku (presnejšie)  
✅ **Fallback** na základnú výšku, ak meranie nie je dostupné

## Testovanie

Po nasadení na server otestujte:
1. **iOS Safari** - otvorte heatmap → toolbar viditeľný
2. **Scroll** - scrollnite stránkou tak, aby sa toolbar schoval (Safari "fullscreen")
3. **Vráťte späť** - toolbar sa ukáže
   ✅ Heatmap má stále končiť presne pri tabbare, bez pásu v oboch stavoch

## Commits
- Commit 1: `6b87dd8` - "Fix iOS Safari 100vh issue: use visual viewport via CSS variable + remove double safe-area"
- Commit 2: `[pending]` - "iOS Safari 100vh: add RAF throttle + measure real tabbar height"

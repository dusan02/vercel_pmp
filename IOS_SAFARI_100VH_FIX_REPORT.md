# iOS Safari 100vh Fix - Report

## Problém
Klasický iOS Safari problém s **100vh**: app kontajner je vyšší než reálne viditeľný viewport (keď je dole Safari toolbar), ale **MobileTabBar je fixnutá na spodok viditeľnej obrazovky**. Výsledok = medzi koncom obsahu a tabbarom vznikne **prázdny pás** (rozdiel medzi `100vh` a reálnou "visual viewport" výškou).

## Príčina

### 1. Nesprávne poradie CSS deklarácií
**PRED (riadok 204-205):**
```css
height: 100dvh; /* CRITICAL: Explicit height for flex chain */
height: 100vh; /* Fallback */
```

V CSS platí: **posledná deklarácia vyhráva**, takže na podporovaných browseroch sa používalo **100vh** (a nie 100dvh). Na iOS Safari je 100vh často "väčšie" než to, čo aktuálne vidíš (toolbar).

### 2. Double safe-area
V heatmap screen CSS bolo:
```css
bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)) !important;
```

Ale tabbar už má `padding-bottom: calc(0.5rem + env(safe-area-inset-bottom))`, takže safe-area bolo započítané 2×.

## Implementované opravy

### Oprava 1: Visual Viewport cez CSS premennú (iOS bulletproof)
**Súbor:** `src/components/mobile/MobileApp.tsx`

**PRED:**
```tsx
export function MobileApp({ children }: MobileAppProps) {
  return (
    <div className="mobile-app">
      {children}
    </div>
  );
}
```

**PO:**
```tsx
export function MobileApp({ children }: MobileAppProps) {
  useEffect(() => {
    const setAppHeight = () => {
      // Use visualViewport if available (more accurate on iOS Safari/Chrome)
      // visualViewport excludes browser UI (address bar, toolbar) which innerHeight includes
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.floor(h)}px`);
    };

    // Initial set
    setAppHeight();

    // Update on visualViewport resize (iOS Safari toolbar show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight);
      window.visualViewport.addEventListener('scroll', setAppHeight);
    }

    // Fallback: window resize (desktop, older browsers)
    window.addEventListener('resize', setAppHeight);

    // Also update on orientation change
    window.addEventListener('orientationchange', setAppHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setAppHeight);
        window.visualViewport.removeEventListener('scroll', setAppHeight);
      }
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
    };
  }, []);

  return (
    <div className="mobile-app">
      {children}
    </div>
  );
}
```

**Výsledok:** `--app-height` CSS premenná sa dynamicky aktualizuje podľa visual viewport (presnejšie pre iOS Safari).

---

### Oprava 2: CSS používa --app-height premennú
**Súbor:** `src/app/globals.css`  
**Riadok:** 201-207

**PRED:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh; /* CRITICAL: Explicit height for flex chain */
  height: 100vh; /* Fallback */
  min-height: 100vh;
  min-height: 100dvh;
  ...
}
```

**PO:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100vh; /* Fallback for older browsers */
  height: var(--app-height, 100dvh); /* CRITICAL: Use visual viewport height (iOS Safari fix) */
  min-height: 100vh; /* Fallback */
  min-height: var(--app-height, 100dvh); /* CRITICAL: Use visual viewport height */
  ...
}
```

**Výsledok:** CSS používa `--app-height` premennú, ktorá sa dynamicky aktualizuje podľa visual viewport.

---

### Oprava 3: Odstránenie double safe-area
**Súbor:** `src/app/globals.css`  
**Riadok:** 391

**PRED:**
```css
/* CRITICAL: Heatmap screen ends exactly at top edge of tabbar (no gap) */
bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom)) !important;
```

**PO:**
```css
/* CRITICAL: Heatmap screen ends exactly at top edge of tabbar (no gap)
   Note: tabbar already has safe-area-inset-bottom in its padding, so we only need tabbar height */
bottom: var(--tabbar-h) !important;
```

**Výsledok:** Safe-area nie je započítané 2× (tabbar už má safe-area v padding-bottom).

---

## Zhrnutie zmien

### Súbory zmenené:
1. `src/components/mobile/MobileApp.tsx`
   - Pridaný `useEffect` na nastavenie `--app-height` CSS premennej
   - Používa `visualViewport` pre presnejšie meranie na iOS Safari
   - Aktualizuje sa pri resize, scroll a orientation change

2. `src/app/globals.css`
   - `.mobile-app` používa `var(--app-height, 100dvh)` namiesto natvrdo `100vh`
   - Heatmap screen `bottom` používa len `var(--tabbar-h)` (bez double safe-area)

### Výsledok:
✅ **--app-height** sa dynamicky aktualizuje podľa visual viewport (iOS Safari fix)  
✅ **CSS používa --app-height** namiesto natvrdo 100vh  
✅ **Double safe-area odstránené** (tabbar už má safe-area v padding)  
✅ **Prázdny pás** medzi obsahom a tabbarom by mal zmiznúť

## Testovanie

Po nasadení na server otestujte:
1. **iOS Safari** - prázdny pás medzi obsahom a tabbarom by mal zmiznúť
2. **Scrollovanie toolbaru** - app výška by sa mala dynamicky aktualizovať
3. **Rotácia** - app výška by sa mala správne upraviť
4. **Rôzne iOS zariadenia** - iPhone s notchom, bez notch, iPad

## Commit
- Commit: `[pending]` - "Fix iOS Safari 100vh issue: use visual viewport via CSS variable + remove double safe-area"

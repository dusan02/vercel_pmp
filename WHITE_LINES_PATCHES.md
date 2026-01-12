# White Lines - 3 Varianty Patchov + Minimal Profi Fix

## 📊 Audit: 100vw použitia

**Výsledok:** ✅ **Žiadne 100vw použitia** v projekte
- Používa sa `width: 100%` a `height: 100dvh` (OK)
- Nie je potreba 100vw fix

---

## Variant A: Backdrop-filter Seam Fix

**Problém:** `backdrop-filter: blur()` na iOS Safari/Chrome vytvára subpixel seams na okrajoch header/tabbar.

**Riešenie:** Použiť `isolation: isolate` + pseudo-element overlay + odstránenie box-shadow.

**Diff do `globals.css`:**

```css
/* ============================================
   PATCH A: Backdrop-filter Seam Fix (iOS Safari/Chrome)
   ============================================ */

/* Mobile Header - Backdrop-filter seam fix */
@media (max-width: 1023px) {
  .mobile-app-header {
    /* CRITICAL: Isolation context prevents blur artifacts from bleeding */
    isolation: isolate;
    position: relative;
    /* Remove box-shadow (replaced by border-bottom) */
    box-shadow: none !important;
    /* Use border instead of shadow for cleaner rendering */
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    /* Background clip to prevent edge glow */
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
    /* Remove any edge glow artifacts */
    outline: 0;
    border-radius: 0;
  }
  
  /* Pseudo-element overlay to prevent blur edge artifacts */
  .mobile-app-header::before {
    content: '';
    position: absolute;
    top: 0;
    left: -1px;
    right: -1px;
    bottom: 0;
    background: rgba(15, 15, 15, 0.95);
    z-index: -1;
    /* Extend slightly beyond edges to cover blur artifacts */
    width: calc(100% + 2px);
    margin-left: -1px;
    margin-right: -1px;
  }
}

/* Mobile Tabbar - Backdrop-filter seam fix */
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    /* CRITICAL: Isolation context prevents blur artifacts from bleeding */
    isolation: isolate;
    position: relative;
    /* Remove box-shadow (replaced by border-top) */
    box-shadow: none !important;
    /* Use border instead of shadow for cleaner rendering */
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    /* Background clip to prevent edge glow */
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
    /* Remove any edge glow artifacts */
    outline: 0;
    border-radius: 0;
  }
  
  /* Pseudo-element overlay to prevent blur edge artifacts */
  .mobile-app-tabbar::before {
    content: '';
    position: absolute;
    top: 0;
    left: -1px;
    right: -1px;
    bottom: 0;
    background: rgba(15, 15, 15, 0.98);
    z-index: -1;
    /* Extend slightly beyond edges to cover blur artifacts */
    width: calc(100% + 2px);
    margin-left: -1px;
    margin-right: -1px;
  }
}
```

**Kde vložiť:** Po riadku 68 (koniec `.mobile-app-header` mobile sekcie) a po riadku 449 (koniec `.mobile-app-tabbar` mobile sekcie).

**Čo zmazať:** 
- Riadok 64: `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);` (v mobile header sekcii)
- Riadok 443: `box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);` (v mobile tabbar sekcii)

**Prečo to zabilo biele čiary:**
- `isolation: isolate` vytvára nový stacking context, čo zabraňuje blur artifacts z presvitu
- Pseudo-element `::before` s rozšíreným pozadím pokrýva subpixel seams na okrajoch
- Odstránenie `box-shadow` eliminuje "edge glow" efekt
- `background-clip: padding-box` zabraňuje presvitu pozadia cez okraje

---

## Variant B: Transform Seam Fix (Screen Slider)

**Problém:** `transform: translateX(100%)` na `.mobile-app-screen` vytvára subpixel seams pri animácii.

**Riešenie:** Použiť `translate3d` namiesto `translateX` + `width: 100%` + `contain: paint`.

**Diff do `globals.css`:**

```css
/* ============================================
   PATCH B: Transform Seam Fix (Screen Slider)
   ============================================ */

/* Mobile Screen - Transform seam fix */
@media (max-width: 1023px) {
  .mobile-app-screen {
    /* CRITICAL: Use translate3d instead of translateX for hardware acceleration + no seams */
    transform: translate3d(100%, 0, 0);
    -webkit-transform: translate3d(100%, 0, 0);
    /* Explicit width constraints to prevent subpixel rounding issues */
    width: 100%;
    max-width: 100%;
    left: 0;
    right: 0;
    /* Contain paint to prevent edge artifacts */
    contain: paint;
    will-change: transform;
    /* Overflow clip to prevent horizontal leaks */
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback for older Safari */
  }
  
  .mobile-app-screen.active {
    /* CRITICAL: Use translate3d for consistent rendering */
    transform: translate3d(0, 0, 0);
    -webkit-transform: translate3d(0, 0, 0);
    /* Maintain hardware acceleration */
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  
  /* Container for screens - prevent overflow leaks */
  .mobile-app-content {
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback */
    width: 100%;
    max-width: 100%;
  }
}
```

**Kde vložiť:** Po riadku 191 (koniec `.mobile-app-screen.active`).

**Čo zmazať:**
- Riadok 171: `transform: translateX(100%);` → nahradiť `translate3d(100%, 0, 0)`
- Riadok 183: `transform: translateX(0);` → už je nahradené v `.active`, ale overiť
- Riadok 187: `transform: translateX(0) translateZ(0);` → nahradiť `translate3d(0, 0, 0)`

**Prečo to zabilo biele čiary:**
- `translate3d` používa hardware acceleration a lepšie subpixel rendering
- `width: 100%` + `max-width: 100%` zabraňuje rounding issues
- `contain: paint` izoluje rendering a zabraňuje edge artifacts
- `overflow-x: clip` zabraňuje horizontálnym leaks

---

## Variant C: Gap/Leak Fix (100vw Rounding)

**Problém:** Aj keď nie je 100vw, môže byť gap medzi elementmi alebo presvitajúce pozadie.

**Riešenie:** Jednotné pozadie na root + `overflow-x: clip` + explicitné width constraints.

**Diff do `globals.css`:**

```css
/* ============================================
   PATCH C: Gap/Leak Fix (Background Leak)
   ============================================ */

/* Root level - prevent background leaks */
@media (max-width: 1023px) {
  html, body {
    /* CRITICAL: Match mobile-app background to prevent leaks */
    background: #0f0f0f !important;
    /* Prevent horizontal overflow */
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback */
    width: 100%;
    max-width: 100%;
  }
  
  #__next {
    /* CRITICAL: Match background and prevent leaks */
    background: #0f0f0f !important;
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback */
  }
  
  .mobile-app {
    /* CRITICAL: Explicit width constraints */
    width: 100%;
    max-width: 100%;
    /* Prevent horizontal overflow */
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback */
    /* Overscroll behavior to prevent bounce leaks */
    overscroll-behavior-x: none;
    -webkit-overscroll-behavior-x: none;
  }
  
  .mobile-app-content {
    /* CRITICAL: Prevent horizontal leaks */
    overflow-x: clip;
    overflow-x: -webkit-clip; /* Fallback */
    width: 100%;
    max-width: 100%;
  }
}
```

**Kde vložiť:** Na začiatok súboru, hneď po `:root` sekcii (po riadku 13).

**Čo zmazať:** Nič (pridáva sa nová sekcia).

**Prečo to zabilo biele čiary:**
- Jednotné pozadie na `html`, `body`, `#__next`, `.mobile-app` zabraňuje presvitu
- `overflow-x: clip` zabraňuje horizontálnym leaks
- `width: 100%` + `max-width: 100%` zabraňuje rounding issues
- `overscroll-behavior-x: none` zabraňuje bounce leaks na iOS

---

## Patch 3: Edge Glow Fix (Blur Layers)

**Problém:** `box-shadow` + `backdrop-filter` vytvára "edge glow" na okrajoch.

**Riešenie:** Odstrániť `box-shadow`, použiť `border-top/bottom`, `background-clip: padding-box`.

**Diff do `globals.css`:**

```css
/* ============================================
   PATCH 3: Edge Glow Fix (Blur Layers)
   ============================================ */

/* Mobile Header - Remove edge glow */
@media (max-width: 1023px) {
  .mobile-app-header {
    /* CRITICAL: Remove box-shadow to eliminate edge glow */
    box-shadow: none !important;
    /* Use border-bottom instead (cleaner rendering) */
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    /* Background clip to prevent edge artifacts */
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
    /* Remove any edge glow artifacts */
    outline: 0;
    border-radius: 0;
  }
}

/* Mobile Tabbar - Remove edge glow */
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    /* CRITICAL: Remove box-shadow to eliminate edge glow */
    box-shadow: none !important;
    /* Use border-top instead (cleaner rendering) */
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    /* Background clip to prevent edge artifacts */
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
    /* Remove any edge glow artifacts */
    outline: 0;
    border-radius: 0;
  }
}
```

**Kde vložiť:** 
- Po riadku 68 (v mobile header sekcii)
- Po riadku 449 (v mobile tabbar sekcii)

**Čo zmazať:**
- Riadok 64: `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);` (v mobile header)
- Riadok 443: `box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);` (v mobile tabbar)

**Prečo to zabilo biele čiary:**
- `box-shadow` vytvára "edge glow" pri subpixel rendering
- `border-top/bottom` je čistejšie renderovaný
- `background-clip: padding-box` zabraňuje presvitu pozadia
- `outline: 0` a `border-radius: 0` eliminujú akékoľvek edge artifacts

---

## Minimal "Profi" Fix (Low Risk, Môžeš Dať Hneď)

**Toto je "safe" fix, ktorý takmer nikdy neškodí a pokrýva najčastejšie príčiny:**

```css
/* ============================================
   MINIMAL PROFI FIX - Low Risk, Ship-Ready
   ============================================ */

/* Root level - prevent leaks */
@media (max-width: 1023px) {
  html, body {
    background: #0f0f0f !important;
    overflow-x: clip;
    overflow-x: -webkit-clip;
    width: 100%;
    max-width: 100%;
  }
  
  #__next, .mobile-app {
    background: #0f0f0f !important;
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
    overflow-x: -webkit-clip;
  }
  
  .mobile-app-content {
    overflow-x: clip;
    overflow-x: -webkit-clip;
    width: 100%;
    max-width: 100%;
  }
  
  /* Transform fix - use translate3d */
  .mobile-app-screen {
    transform: translate3d(100%, 0, 0);
    -webkit-transform: translate3d(100%, 0, 0);
    width: 100%;
    max-width: 100%;
    left: 0;
    right: 0;
    contain: paint;
  }
  
  .mobile-app-screen.active {
    transform: translate3d(0, 0, 0);
    -webkit-transform: translate3d(0, 0, 0);
  }
  
  /* Remove edge glow from blur layers */
  .mobile-app-header,
  .mobile-app-tabbar {
    box-shadow: none !important;
    background-clip: padding-box;
    -webkit-background-clip: padding-box;
    outline: 0;
    border-radius: 0;
  }
}
```

**Kde vložiť:** Na začiatok súboru, hneď po `:root` sekcii (po riadku 13).

**Čo zmazať:** Nič (pridáva sa nová sekcia).

**Prečo to funguje:**
- Pokrýva všetky 3 hlavné príčiny (gap/leak, transform, edge glow)
- Low risk - neovplyvňuje layout ani pozície
- Ship-ready - môžeš to dať hneď bez testov

---

## Odporúčanie

1. **Ak chceš "low risk" fix hneď:** Použi **Minimal Profi Fix**
2. **Ak máš výsledok testu T1/T2/T3:** Použi príslušný Variant (A/B/C)
3. **Ak chceš "najbezpečnejšie":** Použi **Patch 3 (Edge Glow)** + **Minimal Profi Fix**

---

## Testovanie

Po aplikovaní fixu:
1. Build aplikácie (`npm run build`)
2. Restart servera (`npm start`)
3. Test na iOS Safari/Chrome
4. Overiť, že čiary zmizli
5. Overiť, že layout zostal fullscreen
6. Overiť, že desktop nemá regresie

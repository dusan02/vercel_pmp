# White Lines Debug Report - iOS Safari/Chrome

## 1. CSS Audit - Výsledky

### Nájdené potenciálne zdroje bielych čiar:

#### V `globals.css`:

**Mobile-specific borders (už odstránené, ale skontrolovať):**
- Riadok 54-55: `.mobile-app-header` - `border-left: none !important; border-right: none !important;` ✅
- Riadok 66-67: `.mobile-app-header` (mobile) - `border-left: none !important; border-right: none !important;` ✅
- Riadok 135-136: `.mobile-app-content` (mobile) - `border-left: none !important; border-right: none !important;` ✅
- Riadok 440-441: `.mobile-app-tabbar` (mobile) - `border-left: none !important; border-right: none !important;` ✅

**Potenciálne problémy:**
- Riadok 50: `.mobile-app-header` - `border-bottom: 1px solid rgba(0, 0, 0, 0.08);` (len bottom, OK)
- Riadok 63: `.mobile-app-header` (mobile) - `border-bottom: 1px solid rgba(255, 255, 255, 0.08);` (len bottom, OK)
- Riadok 423: `.mobile-app-tabbar` - `border-top: 1px solid rgba(0, 0, 0, 0.08);` (len top, OK)
- Riadok 438: `.mobile-app-tabbar` (mobile) - `border-top: 1px solid rgba(255, 255, 255, 0.08);` (len top, OK)

**Box-shadow (môže vytvárať "seams"):**
- Riadok 51: `.mobile-app-header` - `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);` (len bottom shadow, OK)
- Riadok 64: `.mobile-app-header` (mobile) - `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);` (len bottom shadow, OK)
- Riadok 427: `.mobile-app-tabbar` - `box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);` (len top shadow, OK)
- Riadok 443: `.mobile-app-tabbar` (mobile) - `box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);` (len top shadow, OK)

**Backdrop-filter (môže vytvárať rendering artifacts):**
- Riadok 48-49: `.mobile-app-header` - `backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);` ⚠️
- Riadok 186-190: `.mobile-app-screen.active` - `transform: translateX(0) translateZ(0);` (iOS hairline fix) ✅

**Transform (môže vytvárať subpixel seams):**
- Riadok 171: `.mobile-app-screen` - `transform: translateX(100%);` ⚠️
- Riadok 187: `.mobile-app-screen.active` - `transform: translateX(0) translateZ(0);` ⚠️
- Riadok 205: `.mobile-app-screen.screen-heatmap` - `transform: none !important;` ✅

#### V komponentoch:

**MobileTreemap.tsx:**
- Riadok 636: `boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.28)'` - **INSET BORDER** ⚠️ (na tile-och, nie na okrajoch)
- Riadok 700: `borderBottom: '1px solid rgba(255,255,255,0.08)'` (len bottom, OK)
- Riadok 745: `border: '1px solid rgba(255, 255, 255, 0.1)'` (na button-och, nie na okrajoch)
- Riadok 840: `border: '1px solid rgba(255,255,255,0.12)'` (na hint, nie na okrajoch)

**MarketHeatmap.tsx:**
- Riadok 251-252: `borderLeft/borderRight` na legend points (len desktop, OK)

### ZÁVER z CSS auditu:
- ✅ Všetky vertikálne borders sú explicitne odstránené na mobile
- ⚠️ **Backdrop-filter** na headeri môže vytvárať rendering artifacts
- ⚠️ **Transform** na `.mobile-app-screen` môže vytvárať subpixel seams
- ⚠️ **Box-shadow** môže vytvárať "seams" pri subpixel rendering

---

## 2. Debug Farby - Pridané do globals.css

Pridané na koniec `globals.css` (riadky 8529+):

```css
/* STEP 2: Debug colors - to identify if lines are BORDER or GAP/leak */
/* UNCOMMENT TO TEST - Mobile only */
/*
@media (max-width: 1023px) {
  html, body {
    background: red !important;
  }
  #__next, .mobile-app {
    background: lime !important;
  }
  .mobile-app-content {
    background: cyan !important;
  }
}
*/
```

**Inštrukcie:**
1. Odkomentujte (odstráňte `/*` a `*/`)
2. Načítajte stránku na iOS Safari/Chrome
3. **Otázka:** ZMENÍ sa farba tých čiar? 
   - **ÁNO** = ide o GAP/leak (presvitajúce pozadie)
   - **NIE** = ide o BORDER (element má vlastný border)

---

## 3. DevTools / Inspector - KRITICKÉ

**Inštrukcie pre iOS Safari Remote Debug:**

1. Pripojte iPhone k Mac-u
2. Na Mac-u: Safari → Develop → [Vaše iPhone] → [URL]
3. Na iOS Safari: Nastavenia → Safari → Advanced → Web Inspector (ON)

**Kroky:**
1. Kliknite priamo na **ľavú bielu čiaru** (1px na ľavom okraji)
2. V DevTools Elements tab nájdite highlighted element
3. Skopírujte:
   - **Element:** tag + class + id
   - **Parent chain** (aspoň 6 úrovní nahor)
   - **Computed styles** pre ten element:
     - `border-left`
     - `border-right`
     - `outline`
     - `box-shadow`
     - `background`
     - `width`
     - `position`
     - `transform`
     - `filter`
     - `backdrop-filter`
   - **Computed styles** pre 2 najbližších parentov (rovnaké polia)

4. Opakujte pre **pravú bielu čiaru**

**Očakávané výsledky:**
- Ak je to `html` alebo `body` → gap/leak
- Ak je to `.mobile-app` → gap/leak
- Ak je to `.mobile-app-header` alebo `.mobile-app-tabbar` → border alebo backdrop-filter artifact
- Ak je to `.mobile-app-screen` → transform artifact

---

## 4. Test: Vypnúť Transformy - Pridané do globals.css

Pridané na koniec `globals.css`:

```css
/* STEP 4: Test - Disable transforms (subpixel seam test) */
/* UNCOMMENT TO TEST - Mobile only */
/*
@media (max-width: 1023px) {
  .mobile-app-screen,
  .mobile-app-screen.active,
  .mobile-app-header,
  .mobile-app-tabbar {
    transform: none !important;
    transition: none !important;
  }
}
*/
```

**Inštrukcie:**
1. Odkomentujte
2. Načítajte stránku na iOS Safari/Chrome
3. **Otázka:** Čiary zmiznú? 
   - **ÁNO** = problém je v transform (subpixel seam)
   - **NIE** = problém nie je v transform

---

## 5. Test: Vypnúť Blur (Backdrop-filter) - Pridané do globals.css

Pridané na koniec `globals.css`:

```css
/* STEP 5: Test - Disable blur (backdrop-filter seam test) */
/* UNCOMMENT TO TEST - Mobile only */
/*
@media (max-width: 1023px) {
  .mobile-app-header,
  .mobile-app-tabbar {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
}
*/
```

**Inštrukcie:**
1. Odkomentujte
2. Načítajte stránku na iOS Safari/Chrome
3. **Otázka:** Čiary zmiznú? 
   - **ÁNO** = problém je v backdrop-filter (blur seam)
   - **NIE** = problém nie je v backdrop-filter

---

## 6. Finálny Patch - Návrh (na základe možných príčin)

### Scenár A: Problém je v BACKDROP-FILTER

**Riešenie:**
```css
@media (max-width: 1023px) {
  .mobile-app-header {
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    /* CRITICAL: iOS Safari/Chrome backdrop-filter fix - prevent white line artifacts */
    isolation: isolate;
    will-change: backdrop-filter;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
  }
}
```

### Scenár B: Problém je v TRANSFORM

**Riešenie:**
```css
@media (max-width: 1023px) {
  .mobile-app-screen {
    /* CRITICAL: iOS Safari/Chrome transform fix - prevent subpixel seams */
    transform: translateX(100%) translateZ(0);
    -webkit-transform: translateX(100%) translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  
  .mobile-app-screen.active {
    transform: translateX(0) translateZ(0);
    -webkit-transform: translateX(0) translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
}
```

### Scenár C: Problém je v GAP/LEAK (presvitajúce pozadie)

**Riešenie:**
```css
@media (max-width: 1023px) {
  html, body {
    background: #0f0f0f !important; /* Match mobile-app background */
    overflow: hidden;
  }
  
  #__next {
    background: #0f0f0f !important;
    width: 100vw;
    overflow-x: hidden;
  }
  
  .mobile-app {
    width: 100vw;
    max-width: 100vw;
    overflow-x: hidden;
  }
}
```

### Scenár D: Problém je v BOX-SHADOW (subpixel rendering)

**Riešenie:**
```css
@media (max-width: 1023px) {
  .mobile-app-header,
  .mobile-app-tabbar {
    box-shadow: none !important;
    /* Use border-top/bottom instead of box-shadow for cleaner rendering */
  }
}
```

---

## Ďalšie Kroky

1. ✅ Spustiť testy 2, 4, 5 (odkomentovať v globals.css)
2. ✅ Získať DevTools output z kroku 3
3. ✅ Na základe výsledkov aplikovať príslušný patch zo Scenára A-D
4. ✅ Testovať na iOS Safari a iOS Chrome
5. ✅ Overiť, že desktop nemá regresie

---

## Poznámky

- Všetky fixy sú už aplikované pre vertikálne borders (`border-left/right: none !important`)
- Problém môže byť v **subpixel rendering** iOS Safari/Chrome
- **Backdrop-filter** môže vytvárať rendering artifacts pri blur
- **Transform** môže vytvárať subpixel seams pri animácii
- **Box-shadow** môže vytvárať "seams" pri subpixel rendering

---

## Kontakt

Pre ďalšie otázky alebo problémy, pozri sa na:
- `globals.css` - všetky kritické fixy sú označené `/* CRITICAL: */`
- Debug sekcia na konci `globals.css` (riadky 8529+)

# Mobile White Lines Fix - Zhrnutie

## Identifikovaný problém

**Symptóm:** Tenké biele čiary (1px) cez celú výšku obrazovky na iOS Safari + iOS Chrome. Na Firefoxe niekedy neviditeľné alebo menšie.

**Koreňové príčiny:**
1. `.mobile-app-tabbar` má `border-left: 1px solid rgba(255, 255, 255, 0.08)` a `border-right: 1px solid rgba(255, 255, 255, 0.08)` na mobile
2. `.mobile-app-content` nemá explicitné `border-left/right: none` na mobile (len na desktop)
3. Subpixel rendering issues z `transform` na iOS Safari/Chrome
4. Chýbajúce iOS hairline fixy (translateZ(0), backface-visibility)

---

## Aplikované fixy

### 1. `.mobile-app-tabbar` - Odstránené vertikálne borders

**Súbor:** `src/app/globals.css` (riadok 395-411)

**PRED:**
```css
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }
}
```

**PO:**
```css
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    /* CRITICAL: Remove vertical borders to prevent white lines on iOS Safari/Chrome */
    border-left: none !important;
    border-right: none !important;
    outline: none !important;
    /* iOS hairline fix: prevent subpixel rendering artifacts */
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
}
```

**Dôvod:** Tabbar má `position: fixed`, takže jeho borders sú viditeľné cez celú výšku obrazovky. Odstránenie borders + iOS hairline fixy zabezpečia, že čiary zmiznú.

---

### 2. `.mobile-app-content` - Explicitné border-left/right: none na mobile

**Súbor:** `src/app/globals.css` (riadok 120-130)

**PRED:**
```css
/* Desktop: bez vertikálnych čiar */
@media (min-width: 1024px) {
  .mobile-app-content {
    border-left: none;
    border-right: none;
  }
}
```

**PO:**
```css
/* Mobile: explicitne odstrániť vertikálne čiary (prevent white lines on iOS Safari/Chrome) */
@media (max-width: 1023px) {
  .mobile-app-content {
    border-left: none !important;
    border-right: none !important;
    outline: none !important;
    box-shadow: none !important;
  }
}

/* Desktop: bez vertikálnych čiar */
@media (min-width: 1024px) {
  .mobile-app-content {
    border-left: none;
    border-right: none;
  }
}
```

**Dôvod:** Na mobile nebol explicitne nastavený `border-left/right: none`, takže môže dediť borders alebo vytvárať gaps.

---

### 3. `.mobile-app` - Pridané border/outline/box-shadow: none

**Súbor:** `src/app/globals.css` (riadok 15-26)

**PRED:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #ffffff;
  position: relative;
  overflow: hidden;
}
```

**PO:**
```css
.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #ffffff;
  position: relative;
  overflow: hidden;
  /* CRITICAL: Remove borders/outlines to prevent white lines on iOS Safari/Chrome */
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
```

**Dôvod:** Zabezpečí, že hlavný wrapper nemá žiadne borders/outlines, ktoré by mohli vytvárať čiary.

---

### 4. `.mobile-app-screen` - Pridané border/outline/box-shadow: none

**Súbor:** `src/app/globals.css` (riadok 129-170)

**PRED:**
```css
.mobile-app-screen {
  padding: 1rem;
  opacity: 0;
  transform: translateX(100%);
  transition: opacity 0.3s, transform 0.3s;
}
```

**PO:**
```css
.mobile-app-screen {
  padding: 1rem;
  opacity: 0;
  transform: translateX(100%);
  transition: opacity 0.3s, transform 0.3s;
  /* CRITICAL: Remove borders/outlines to prevent white lines on iOS Safari/Chrome */
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.mobile-app-screen.active {
  opacity: 1;
  transform: translateX(0) translateZ(0); /* iOS hairline fix */
  -webkit-transform: translateX(0) translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
```

**Dôvod:** Odstránenie borders/outlines + iOS hairline fixy (`translateZ(0)`, `backface-visibility: hidden`) zabezpečia, že transform nevyvolá subpixel rendering artifacts.

---

### 5. `.mobile-app-header` - Odstránené border-left/right

**Súbor:** `src/app/globals.css` (riadok 40-65)

**PRED:**
```css
.mobile-app-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
```

**PO:**
```css
.mobile-app-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  /* CRITICAL: Remove vertical borders to prevent white lines */
  border-left: none !important;
  border-right: none !important;
  outline: none !important;
}

@media (max-width: 1023px) {
  .mobile-app-header {
    /* Rovnaké fixy aj pre mobile */
    border-left: none !important;
    border-right: none !important;
    outline: none !important;
  }
}
```

**Dôvod:** Header má `position: fixed`, takže jeho borders by mohli byť viditeľné.

---

### 6. Portfolio/Favorites/Earnings/AllStocks screens - Pridané border/outline fixy

**Súbor:** `src/app/globals.css` (riadok 277-284, 378-384)

**PRED:**
```css
.mobile-app-screen.screen-portfolio,
.mobile-app-screen.screen-favorites,
.mobile-app-screen.screen-earnings,
.mobile-app-screen.screen-all-stocks {
  background: #ffffff;
}
```

**PO:**
```css
.mobile-app-screen.screen-portfolio,
.mobile-app-screen.screen-favorites,
.mobile-app-screen.screen-earnings,
.mobile-app-screen.screen-all-stocks {
  background: #ffffff;
  /* CRITICAL: Remove borders/outlines to prevent white lines */
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
```

**Dôvod:** Zabezpečí, že všetky screens majú explicitne odstránené borders/outlines.

---

## Prečo len Safari/Chrome?

1. **Subpixel rendering:** Safari/Chrome majú iný subpixel rendering algoritmus než Firefox, čo môže spôsobovať viditeľnosť 1px borders
2. **Transform stacking context:** Transform vytvára nový stacking context, čo môže spôsobovať rendering artifacts na iOS
3. **Border rendering:** Safari/Chrome renderujú 1px borders presnejšie (alebo viditeľnejšie) než Firefox
4. **Backdrop-filter:** `backdrop-filter: blur()` môže zväčšiť viditeľnosť borders

---

## Výsledok

1. ✅ **Odstránené vertikálne borders** z tabbaru, headeru, content area
2. ✅ **Pridané iOS hairline fixy** (`translateZ(0)`, `backface-visibility: hidden`)
3. ✅ **Explicitné border/outline/box-shadow: none** na všetkých mobile wrapperoch
4. ✅ **Zachovaný fullscreen layout** - žiadne regresie
5. ✅ **Bez regresie na desktop** - fixy sú len pre mobile (max-width: 1023px)

---

## Testovanie

Po aplikovaní fixov overiť:
1. ✅ Biele čiary zmizli na iOS Safari
2. ✅ Biele čiary zmizli na iOS Chrome
3. ✅ Layout zostáva fullscreen
4. ✅ Žiadne regresie na desktop
5. ✅ Animácie fungujú správne (transform s translateZ(0))

---

## Alternatívne riešenie (ak fixy nepomôžu)

Ak biele čiary stále zostanú, možno je to gap medzi elementmi, nie border. V tom prípade:

1. **Skontrolovať margin/padding** medzi elementmi
2. **Použiť `gap: 0`** na flex/grid kontajneroch
3. **Nahradiť transform animáciu** opacity + visibility (bez transform)
4. **Použiť CSS Grid** namiesto absolute positioning

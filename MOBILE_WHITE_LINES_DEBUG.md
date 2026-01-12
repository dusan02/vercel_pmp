# Mobile White Lines Debug Report

## Identifikované zdroje bielych čiar

### 1. `.mobile-app-tabbar` - border-left/right na mobile

**Súbor:** `src/app/globals.css` (riadok 401-402)

```css
@media (max-width: 1023px) {
  .mobile-app-tabbar {
    /* Vertikálne čiary - konzistentné s mobile-app-content */
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }
}
```

**Problém:** Toto vytvára biele čiary na ľavej a pravej strane tabbaru, ktoré sú viditeľné cez celú výšku obrazovky (pretože tabbar je `position: fixed`).

---

### 2. `.mobile-app-content` - chýba explicitné border-left/right: none na mobile

**Súbor:** `src/app/globals.css` (riadok 120-125)

```css
/* Desktop: bez vertikálnych čiar */
@media (min-width: 1024px) {
  .mobile-app-content {
    border-left: none;
    border-right: none;
  }
}
```

**Problém:** Na mobile (max-width: 1023px) `.mobile-app-content` NEMÁ explicitne nastavené `border-left: none; border-right: none;`, takže môže dediť borders alebo vytvárať gap.

---

### 3. `.mobile-app-screen` - padding: 1rem na base, nie všetky screens majú padding: 0

**Súbor:** `src/app/globals.css` (riadok 147, 163)

```css
.mobile-app-screen {
  padding: 1rem; /* Base padding */
}

.mobile-app-screen.screen-heatmap {
  padding: 0 !important; /* Len heatmap má padding: 0 */
}
```

**Problém:** Portfolio, Earnings, Favorites, AllStocks screens majú stále `padding: 1rem`, čo môže vytvárať viditeľné medzery/gaps.

---

### 4. Transform subpixel rendering (iOS Safari/Chrome)

**Súbor:** `src/app/globals.css` (riadok 149, 157)

```css
.mobile-app-screen {
  transform: translateX(100%);
  transition: opacity 0.3s, transform 0.3s;
}

.mobile-app-screen.active {
  transform: translateX(0);
}
```

**Problém:** Transform môže vytvárať subpixel rendering issues na iOS Safari/Chrome, čo sa môže prejaviť ako tenké biele čiary.

---

## Riešenia

### Riešenie A: Čistý CSS fix (odporúčané)

1. **Odstrániť border-left/right z tabbaru** (alebo nastaviť na transparent)
2. **Pridať explicitné border-left/right: none na mobile-app-content**
3. **Odstrániť padding z všetkých screens** (alebo nastaviť na 0 pre všetky)
4. **Pridať iOS hairline fixy** (transform: translateZ(0), backface-visibility)

### Riešenie B: Refaktor layout/animácie

1. **Nahradiť transform animáciu opacity + visibility** (bez transform)
2. **Použiť CSS Grid namiesto absolute positioning**
3. **Odstrániť všetky borders z mobile wrapperoch**

---

## Prečo len Safari/Chrome?

1. **Subpixel rendering:** Safari/Chrome majú iný subpixel rendering algoritmus než Firefox
2. **Transform stacking context:** Transform vytvára nový stacking context, čo môže spôsobovať rendering artifacts
3. **Border rendering:** Safari/Chrome renderujú 1px borders presnejšie (alebo viditeľnejšie) než Firefox
4. **Backdrop-filter:** `backdrop-filter: blur()` môže zväčšiť viditeľnosť borders

---

## Testovacie otázky

### A) Je čiara presne na ľavej/pravej hrane viewportu?

**Očakávaná odpoveď:** Áno - `.mobile-app-tabbar` má `border-left: 1px` a `border-right: 1px` na mobile.

### B) Keď nastavím background: red na body/html, čiary ostanú biele?

**Očakávaná odpoveď:** Áno - borders majú vlastnú farbu `rgba(255, 255, 255, 0.08)`, nie sú to gaps.

### C) Zmiznú čiary, keď nastavím padding: 0 na všetky screens?

**Očakávaná odpoveď:** Nie - padding nie je zdroj, borders sú.

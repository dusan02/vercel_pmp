# Mobile Production Ready Fixes

**Dátum:** 2025-12-30  
**Cieľ:** Opraviť technické hrany pre production-ready mobilnú verziu

---

## 1. Opravené Problémy

### 1.1 Bottom Nav Safe-Area Handling

**Problém:**
- `height: 64px` + `padding-bottom: calc(0.5rem + env(safe-area-inset-bottom))` znamenalo, že reálna výška navu bola viac než 64px
- Grid row `auto` to zobral, ale výška bola nepredvídateľná
- Na iPhone s home indikátorom môže byť nav opticky "vyšší" a zoberie viac miesta

**Riešenie:**
- Použitie `::after` pseudo-elementu pre safe-area spacer
- Content box má fixnú výšku 64px
- Safe-area je len extra "pod" spacer, nie súčasť content boxu

**Pred:**
```css
.bottom-navigation {
  height: 64px;
  padding: 0.5rem 0;
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
}
```

**Po:**
```css
.bottom-navigation {
  height: 64px;
  padding: 0.5rem 0;
  /* Safe-area handled via ::after spacer (more predictable than padding) */
}

.bottom-navigation::after {
  content: "";
  display: block;
  height: env(safe-area-inset-bottom);
  width: 100%;
  flex-shrink: 0;
}
```

**Výhody:**
- ✅ Predvídateľná výška content boxu (64px)
- ✅ Safe-area je oddelená od content boxu
- ✅ Grid row `auto` sa správa konzistentne

---

### 1.2 UP Button Offset

**Problém:**
- UP button mal `bottom: calc(16px + env(safe-area-inset-bottom))`
- Keď je nav grid row (nie fixed), UP button môže sedieť priamo nad navom a zakrývať posledné tlačidlo
- To je príliš nízko pre Variant A (grid row nav)

**Riešenie:**
- UP button je teraz umiestnený nad navom: `bottom: calc(64px + 16px + env(safe-area-inset-bottom))`
- 64px = výška navu
- 16px = margin nad navom
- safe-area = iOS home indicator

**Pred:**
```css
.fab-container {
  bottom: calc(16px + env(safe-area-inset-bottom));
}
```

**Po:**
```css
.fab-container {
  /* Position above bottom nav: nav height (64px) + margin (16px) + safe-area */
  bottom: calc(64px + 16px + env(safe-area-inset-bottom));
}
```

**Výhody:**
- ✅ UP button neprekrýva bottom nav
- ✅ Posledné tlačidlo v nav bare je vždy klikateľné
- ✅ Konzistentné správanie na všetkých zariadeniach

---

### 1.3 Heatmap Height (CSS namiesto Inline Styles)

**Problém:**
- Heatmap používala inline `style={{ height: '100%', minHeight: 0 }}`
- Inline "100%" je najčastejší zdroj regressions
- Ak sa v budúcnosti zmení wrapper (padding/margin), môže sa vrátiť 0×0

**Riešenie:**
- Výška je teraz definovaná cez CSS na `.mobile-view-heatmap .heatmap-preview-container`
- Inline štýly sú odstránené (okrem `cursor: 'pointer'`)

**Pred:**
```tsx
<div
  className="relative w-full bg-black overflow-hidden group heatmap-preview-container lg:hidden"
  style={{ height: '100%', minHeight: 0, cursor: 'pointer' }}
>
```

**Po:**
```tsx
<div
  className="relative w-full bg-black overflow-hidden group heatmap-preview-container lg:hidden h-full"
  style={{ cursor: 'pointer' }}
>
```

**CSS:**
```css
.mobile-view-heatmap .heatmap-preview-container {
  height: 100%;
  min-height: 0;
}
```

**Výhody:**
- ✅ Výška je definovaná cez CSS (stabilnejšie)
- ✅ Menej inline štýlov = menej regressions
- ✅ Jednoduchšie udržiavanie

---

## 2. Zoznam Zmenených Súborov

- `src/app/globals.css` - Opravená bottom nav safe-area handling, UP button offset, heatmap height CSS
- `src/components/HeatmapPreview.tsx` - Odstránené inline štýly pre height

---

## 3. Production Ready Checklist

### ✅ Opravené

- [x] Bottom nav safe-area handling (::after spacer)
- [x] UP button offset (nad navom)
- [x] Heatmap height (CSS namiesto inline)

### ⚠️ Ešte Treba Overiť (v reálnej prevádzke)

- [ ] iOS Safari orientácia (portrait → landscape → portrait): nevráti sa prázdna heatmap?
- [ ] Pomalý device / low memory: switching view nespôsobuje lag kvôli remountu?
- [ ] Font scaling / Accessibility text size: bottom nav labely sa nerozbijú na 2 riadky?
- [ ] UP button: neblokuje bottom nav tap target? (✅ opravené)
- [ ] AllStocks 2000 items: ak je tam veľa cardov, zvážiť `react-window` / virtualization

---

## 4. Technické Detaily

### 4.1 Bottom Nav Structure

```
.bottom-navigation (flex container)
├── .nav-item (flex items)
└── ::after (safe-area spacer)
```

**Výška:**
- Content: 64px (fixná)
- Safe-area: `env(safe-area-inset-bottom)` (dynamická)
- Celková: 64px + safe-area

### 4.2 UP Button Positioning

```
Viewport
├── ... (content)
├── .fab-container (fixed)
│   └── bottom: calc(64px + 16px + env(safe-area-inset-bottom))
└── .bottom-navigation (grid row)
    └── height: 64px + safe-area
```

**Výpočet:**
- Nav height: 64px
- Margin: 16px
- Safe-area: `env(safe-area-inset-bottom)`
- **Total:** `calc(64px + 16px + env(safe-area-inset-bottom))`

### 4.3 Heatmap Height Flow

```
.mobile-shell (grid)
└── .mobile-main-content (grid row: 1fr)
    └── .mobile-view-heatmap (height: 100%, min-height: 0)
        └── .heatmap-preview-container (height: 100%, min-height: 0)
            └── ResponsiveMarketHeatmap
```

**Kľúčové vlastnosti:**
- `min-height: 0` je kritické pre grid overflow context
- Výška je definovaná cez CSS, nie inline
- Parent má `height: 100%` (grid row `1fr`)

---

## 5. Testovanie

### 5.1 Bottom Nav

**Test:**
- iPhone SE (375px) - overiť, či nav má správnu výšku
- iPhone 14 Pro Max (s home indicator) - overiť safe-area spacer
- Landscape mode - overiť, či nav zostáva stabilný

**Očakávané výsledky:**
- ✅ Nav má fixnú výšku 64px (bez safe-area)
- ✅ Safe-area spacer je viditeľný len na iPhone s home indicatorom
- ✅ Grid row `auto` sa správa konzistentne

### 5.2 UP Button

**Test:**
- iPhone SE - overiť, či UP button nie je nad navom
- iPhone 14 Pro Max - overiť safe-area offset
- Kliknúť na posledné tlačidlo v nav bare - overiť, či nie je prekryté

**Očakávané výsledky:**
- ✅ UP button je nad navom (nie v nav bare)
- ✅ Posledné tlačidlo v nav bare je vždy klikateľné
- ✅ Safe-area offset funguje správne

### 5.3 Heatmap

**Test:**
- iPhone SE - overiť, či heatmap má správnu výšku
- Rotácia (portrait → landscape → portrait) - overiť, či sa heatmap nerozbije
- Resize viewport - overiť, či sa heatmap správne prispôsobí

**Očakávané výsledky:**
- ✅ Heatmap má 100% výšku view kontajnera
- ✅ Rotácia nespôsobuje prázdnu heatmap
- ✅ Resize funguje správne

---

## 6. Verdikt

**Status:** ✅ **Production Ready** (podmienečne)

**Opravené:**
- ✅ Bottom nav safe-area handling
- ✅ UP button offset
- ✅ Heatmap height (CSS namiesto inline)

**Ešte treba overiť v reálnej prevádzke:**
- ⚠️ iOS Safari orientácia
- ⚠️ Pomalý device / low memory
- ⚠️ Font scaling / Accessibility
- ⚠️ AllStocks virtualization (ak je potrebná)

**Odporúčanie:**
- Release je možný, ale monitorovať výkon a UX v prvých 1-2 dňoch
- Ak sa objavia problémy s výkonom (AllStocks 2000 items), zvážiť virtualization
- Ak sa objavia problémy s orientáciou, overiť heatmap render guard

---

**Report vytvorený:** 2025-12-30  
**Status:** ✅ Opravené

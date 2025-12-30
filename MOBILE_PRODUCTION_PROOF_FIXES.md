# Mobile Production-Proof Fixes

**Dátum:** 2025-12-30  
**Cieľ:** Opraviť regresie a doladiť detaily pre production-proof mobilnú verziu

---

## 1. Opravené Problémy

### 1.1 Bottom Nav Safe-Area Spacer (Samostatný Element)

**Problém:**
- `::after` pseudo-element sa môže počítať do flex `space-around`, čo môže rozhádzať spacing tlačidiel
- Nie je najpredvídateľnejšie riešenie

**Riešenie:**
- Safe-area spacer je teraz samostatný `<div>` element mimo flex flow
- Wrapper používa `flex-direction: column` pre nav + safe-area
- Safe-area spacer má matching background pre vizuálnu konzistentnosť

**Pred:**
```css
.bottom-navigation::after {
  content: "";
  display: block;
  height: env(safe-area-inset-bottom);
  width: 100%;
  flex-shrink: 0;
}
```

**Po:**
```tsx
<div className="bottom-navigation-wrapper">
  <BottomNavigation ... />
  <div className="bottom-navigation-safearea" />
</div>
```

```css
.bottom-navigation-wrapper {
  display: flex;
  flex-direction: column;
}

.bottom-navigation-safearea {
  height: env(safe-area-inset-bottom);
  width: 100%;
  background: rgba(17, 17, 17, 0.95); /* Match nav background */
  flex-shrink: 0;
}
```

**Výhody:**
- ✅ Safe-area spacer je mimo flex flow nav tlačidiel
- ✅ Žiadne ovplyvnenie spacing tlačidiel
- ✅ Najpredvídateľnejšie riešenie

---

### 1.2 FAB Bottom Padding (Prevencia Prekrývania Obsahu)

**Problém:**
- FAB môže prekrývať poslednú kartu v AllStocks/Portfolio keď scrollneš úplne dole
- FAB je fixed, ale content pod ním nie je odsadený

**Riešenie:**
- Pridaný `padding-bottom: calc(56px + 16px)` do `.mobile-main-content`
- 56px = výška FAB
- 16px = margin nad navom

**Pred:**
```css
.mobile-main-content {
  /* No padding-bottom needed - nav is now a grid row, not fixed overlay */
}
```

**Po:**
```css
.mobile-main-content {
  /* Padding for FAB (56px height + 16px margin) to prevent content overlap */
  padding-bottom: calc(56px + 16px);
}
```

**Výhody:**
- ✅ Posledná karta nie je prekrytá FAB
- ✅ Konzistentné správanie na všetkých zariadeniach
- ✅ Scroll funguje správne až do konca

---

### 1.3 Heatmap Height (Flex Layout)

**Problém:**
- Reťazenie `height: 100%` môže byť krehké
- Ak sa zmení wrapper (padding/margin), môže sa vrátiť 0×0

**Riešenie:**
- `.mobile-view-heatmap` používa `display: flex; flex-direction: column`
- Heatmap container má `flex: 1` namiesto `height: 100%`

**Pred:**
```css
.mobile-view-heatmap {
  height: 100%;
  min-height: 0;
}

.mobile-view-heatmap .heatmap-preview-container {
  height: 100%;
  min-height: 0;
}
```

**Po:**
```css
.mobile-view-heatmap {
  padding: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mobile-view-heatmap .heatmap-preview-container {
  flex: 1;
  min-height: 0;
}
```

**Výhody:**
- ✅ Flex layout je stabilnejší než reťazenie 100% výšok
- ✅ Menej regressions
- ✅ Lepšie správanie pri resize

---

### 1.4 Nav Label Truncation (Text Scaling / Accessibility)

**Problém:**
- Pri zvýšenom "Text size" v iOS môže label v nav bare skočiť na 2 riadky
- Nav row bude vyšší → menej miesta pre content

**Riešenie:**
- Pridané `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`
- Pridané `max-width: 100%` a `width: 100%` pre správne truncation
- Pridané `text-align: center` pre centrovanie

**Pred:**
```css
.nav-label {
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s ease;
}
```

**Po:**
```css
.nav-label {
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  width: 100%;
  text-align: center;
}
```

**Výhody:**
- ✅ Labely sa nikdy nerozbijú na 2 riadky
- ✅ Nav row má fixnú výšku (64px)
- ✅ Funguje s accessibility text scaling

---

## 2. Zoznam Zmenených Súborov

- `src/components/MobileShell.tsx` - Pridaný safe-area spacer ako samostatný element
- `src/app/globals.css` - Opravená safe-area handling, FAB padding, heatmap flex layout, nav label truncation

---

## 3. Production-Proof Checklist

### ✅ Opravené

- [x] Bottom nav safe-area spacer (samostatný element mimo flex flow)
- [x] FAB bottom padding (prevencia prekrývania obsahu)
- [x] Heatmap height (flex layout)
- [x] Nav label truncation (text scaling / accessibility)

### ⚠️ Ešte Treba Overiť (v reálnej prevádzke)

- [ ] iOS Safari orientácia (portrait → landscape → portrait): nevráti sa prázdna heatmap?
- [ ] Pomalý device / low memory: switching view nespôsobuje lag kvôli remountu?
- [ ] AllStocks 2000 items: ak je tam veľa cardov, zvážiť `react-window` / virtualization
- [ ] Screenshot z iOS (spodok obrazovky s navom + FAB) - overiť, či sa spacing "nepohol"
- [ ] Screenshot z AllStocks na úplnom dne scrollu - overiť, či FAB neprekrýva poslednú kartu

---

## 4. Technické Detaily

### 4.1 Bottom Nav Structure (Nové)

```
.bottom-navigation-wrapper (flex column)
├── .bottom-navigation (flex row, space-around)
│   ├── .nav-item (flex: 1)
│   ├── .nav-item (flex: 1)
│   └── ...
└── .bottom-navigation-safearea (height: env(safe-area-inset-bottom))
```

**Výhody:**
- Safe-area spacer je mimo flex flow nav tlačidiel
- Žiadne ovplyvnenie spacing tlačidiel
- Najpredvídateľnejšie riešenie

### 4.2 FAB Positioning

```
Viewport
├── ... (content)
├── .mobile-main-content
│   └── padding-bottom: calc(56px + 16px) ← prevencia prekrývania
├── .fab-container (fixed)
│   └── bottom: calc(64px + 16px + env(safe-area-inset-bottom))
└── .bottom-navigation-wrapper (grid row)
    └── .bottom-navigation (height: 64px)
        └── .bottom-navigation-safearea
```

**Výpočet:**
- FAB height: 56px
- FAB margin: 16px
- Nav height: 64px
- Safe-area: `env(safe-area-inset-bottom)`
- **Content padding:** `calc(56px + 16px)` = 72px
- **FAB bottom:** `calc(64px + 16px + env(safe-area-inset-bottom))`

### 4.3 Heatmap Height Flow (Nové)

```
.mobile-shell (grid)
└── .mobile-main-content (grid row: 1fr)
    └── .mobile-view-heatmap (flex column, height: 100%)
        └── .heatmap-preview-container (flex: 1)
            └── ResponsiveMarketHeatmap
```

**Kľúčové vlastnosti:**
- `display: flex; flex-direction: column` na view
- `flex: 1` na container (namiesto `height: 100%`)
- `min-height: 0` je kritické pre flex overflow context

### 4.4 Nav Label Truncation

```
.nav-item (flex: 1, min-width: 0)
└── .nav-label
    ├── white-space: nowrap
    ├── overflow: hidden
    ├── text-overflow: ellipsis
    └── width: 100%
```

**Kľúčové vlastnosti:**
- `min-width: 0` na flex item (umožňuje shrink)
- `white-space: nowrap` (zabráni 2 riadkom)
- `text-overflow: ellipsis` (zobrazí "..." pri pretečení)

---

## 5. Testovanie

### 5.1 Bottom Nav Safe-Area

**Test:**
- iPhone SE (375px) - overiť, či spacing tlačidiel je konzistentný
- iPhone 14 Pro Max (s home indicator) - overiť safe-area spacer
- Landscape mode - overiť, či nav zostáva stabilný

**Očakávané výsledky:**
- ✅ Spacing tlačidiel je konzistentný (nie je ovplyvnený safe-area)
- ✅ Safe-area spacer je viditeľný len na iPhone s home indicatorom
- ✅ Nav row má fixnú výšku 64px (bez safe-area)

### 5.2 FAB Bottom Padding

**Test:**
- AllStocks view - scrollnúť úplne dole
- Portfolio view - scrollnúť úplne dole
- Overiť, či posledná karta nie je prekrytá FAB

**Očakávané výsledky:**
- ✅ Posledná karta nie je prekrytá FAB
- ✅ Scroll funguje správne až do konca
- ✅ FAB je vždy viditeľný a klikateľný

### 5.3 Heatmap Flex Layout

**Test:**
- iPhone SE - overiť, či heatmap má správnu výšku
- Rotácia (portrait → landscape → portrait) - overiť, či sa heatmap nerozbije
- Resize viewport - overiť, či sa heatmap správne prispôsobí

**Očakávané výsledky:**
- ✅ Heatmap má 100% výšku view kontajnera
- ✅ Rotácia nespôsobuje prázdnu heatmap
- ✅ Resize funguje správne (flex layout)

### 5.4 Nav Label Truncation

**Test:**
- iOS Settings → Display & Brightness → Text Size → Increase
- Overiť, či labely sa nerozbijú na 2 riadky
- Overiť, či sa zobrazí "..." pri pretečení

**Očakávané výsledky:**
- ✅ Labely sa nikdy nerozbijú na 2 riadky
- ✅ Nav row má fixnú výšku 64px
- ✅ "..." sa zobrazí pri pretečení

---

## 6. Verdikt

**Status:** ✅ **Production-Proof Ready**

**Opravené:**
- ✅ Bottom nav safe-area spacer (samostatný element)
- ✅ FAB bottom padding (prevencia prekrývania)
- ✅ Heatmap flex layout (stabilnejšie)
- ✅ Nav label truncation (text scaling)

**Ešte treba overiť v reálnej prevádzke:**
- ⚠️ iOS Safari orientácia
- ⚠️ Pomalý device / low memory
- ⚠️ AllStocks virtualization (ak je potrebná)
- ⚠️ Screenshot z iOS (spodok obrazovky s navom + FAB)
- ⚠️ Screenshot z AllStocks na úplnom dne scrollu

**Odporúčanie:**
- Release je možný - všetky kritické problémy sú opravené
- Monitorovať výkon a UX v prvých 1-2 dňoch
- Ak sa objavia problémy s výkonom (AllStocks 2000 items), zvážiť virtualization
- Ak sa objavia problémy s orientáciou, overiť heatmap render guard

---

**Report vytvorený:** 2025-12-30  
**Status:** ✅ Production-Proof Ready

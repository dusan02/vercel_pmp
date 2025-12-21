# Mobile UX/UI Optimization

## 📱 Prehľad optimalizácií

Kompletná optimalizácia UX/UI pre mobilné zariadenia s dôrazom na:
- Kompaktný layout
- Touch-friendly interakcie
- Horizontálne scrollovanie
- Optimalizované veľkosti fontov
- Lepšie využitie priestoru

---

## 🎯 Kľúčové zmeny

### 1. **Header Layout (Mobile)**

#### Desktop → Mobile transformácia:
- **Desktop**: 3-zónový layout (Brand | Indices | Navigation)
- **Mobile**: Kompaktný horizontálny layout s možnosťou scrollovania

#### Mobilné optimalizácie:
- ✅ Zmenšený padding: `1.25rem` → `0.5rem`
- ✅ Kompaktnejšie gapy: `2rem` → `0.5rem`
- ✅ Tagline skrytý (šetrí priestor)
- ✅ Menší logo: `32px` → `28px` → `24px` (small mobile)
- ✅ Zmenšené fonty brandingu

### 2. **Market Indices (Mobile)**

#### Horizontálne scrollovanie:
- ✅ Indikátory v jednom rade s horizontálnym scrollovaním
- ✅ Skryté scrollbary (čistý vzhľad)
- ✅ Smooth scrolling s `-webkit-overflow-scrolling: touch`
- ✅ Kompaktnejšie karty: `100-130px` → `80-90px` → `70-80px`

#### Veľkosti:
- **Tablet (≤1024px)**: `85-110px` width
- **Mobile (≤768px)**: `80-90px` width
- **Small Mobile (≤480px)**: `70-80px` width

#### Typografia:
- Názov: `0.8125rem` → `0.6875rem`
- Cena: `1.0625rem` → `0.8125rem` → `0.75rem`
- Zmena: `0.9375rem` → `0.6875rem` → `0.625rem`

### 3. **Navigation (Mobile)**

#### Touch-friendly design:
- ✅ Minimálna veľkosť tlačidiel: `44px × 44px` (Apple HIG)
- ✅ Horizontálne scrollovanie
- ✅ Väčšie ikony: `16px` → `18px`
- ✅ Kompaktnejšie padding: `0.625rem 1rem` → `0.5rem 0.625rem`

#### Small Mobile (≤480px):
- ✅ Skryté textové labely (len ikony)
- ✅ Minimálna šírka: `44px`
- ✅ Padding: `0.5rem`

### 4. **Touch Optimizations**

#### Interakcie:
- ✅ `-webkit-tap-highlight-color`: jemný highlight
- ✅ `-webkit-touch-callout: none`: bez long-press menu
- ✅ `user-select: none`: bez text selection
- ✅ `touch-action: manipulation`: rýchlejšie tapy

---

## 📐 Breakpointy

### Desktop (≥1024px)
- Plný 3-zónový layout
- Všetky prvky viditeľné
- Normálne veľkosti

### Tablet (768px - 1024px)
- Flex-wrap layout
- Market indices pod brandom
- Navigation vpravo

### Mobile (≤768px)
- Kompaktný horizontálny layout
- Horizontálne scrollovanie pre indices a navigáciu
- Skrytý tagline
- Zmenšené veľkosti

### Small Mobile (≤480px)
- Extra kompaktný layout
- Len ikony v navigácii (bez textu)
- Najmenšie veľkosti fontov
- Minimalistický dizajn

### Landscape Mobile (≤768px, landscape)
- Optimalizované pre horizontálnu orientáciu
- Viac priestoru pre indices
- Lepšie rozloženie

---

## 🎨 Visual Improvements

### Scroll Indicators
- Gradient overlay na okrajoch scrollovateľných kontajnerov
- Indikuje možnosť scrollovania
- Smooth fade-in/out

### Spacing
- Konzistentné gapy: `0.25rem` - `0.5rem`
- Padding: `0.375rem` - `0.5rem`
- Margin: minimalizovaný

### Typography Scale
```
Desktop:  1.125rem - 1.375rem
Tablet:   1rem - 1.125rem
Mobile:   0.875rem - 1rem
Small:    0.75rem - 0.875rem
```

---

## ⚡ Performance

### Optimizácie:
- ✅ `scroll-behavior: smooth` pre smooth scrolling
- ✅ `-webkit-overflow-scrolling: touch` pre iOS
- ✅ Skryté scrollbary (lepší vzhľad)
- ✅ Minimalizované animácie na mobile
- ✅ Touch-friendly veľkosti (bez potreby zoomu)

---

## 📱 Testovanie

### Odporúčané zariadenia:
- iPhone SE (375px)
- iPhone 12/13/14 (390px)
- iPhone 14 Pro Max (430px)
- Samsung Galaxy S21 (360px)
- iPad Mini (768px)

### Testované scenáre:
- ✅ Portrait orientation
- ✅ Landscape orientation
- ✅ Touch interactions
- ✅ Horizontal scrolling
- ✅ Navigation usability
- ✅ Market indices readability

---

## 🔧 Technické detaily

### CSS Classes
- `.header-container`: Main flex container
- `.header-left`: Branding zone
- `.header-center`: Market indices (scrollable)
- `.header-right`: Navigation (scrollable)
- `.mobile-nav-container`: Mobile navigation wrapper

### Media Queries
```css
@media (max-width: 1024px) { /* Tablet */ }
@media (max-width: 768px) { /* Mobile */ }
@media (max-width: 480px) { /* Small Mobile */ }
@media (max-width: 768px) and (orientation: landscape) { /* Landscape */ }
```

---

## ✅ Checklist

- [x] Kompaktný header layout
- [x] Horizontálne scrollovanie pre indices
- [x] Touch-friendly navigácia (44px min)
- [x] Skrytý tagline na mobile
- [x] Optimalizované veľkosti fontov
- [x] Smooth scrolling
- [x] Landscape orientation support
- [x] Small mobile support (≤480px)
- [x] Touch optimizations
- [x] Performance optimizations

---

## 🚀 Výsledok

Header je teraz plne optimalizovaný pre mobilné zariadenia:
- ✅ Kompaktný a efektívny layout
- ✅ Touch-friendly interakcie
- ✅ Horizontálne scrollovanie kde potrebné
- ✅ Lepšie využitie priestoru
- ✅ Profesionálny vzhľad na všetkých zariadeniach


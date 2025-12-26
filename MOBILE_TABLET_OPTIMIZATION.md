# 📱 Mobile & Tablet UX/UI Optimization

## Prehľad

Komplexná optimalizácia UX/UI pre mobilné zariadenia a tablety s dôrazom na:
- Touch-friendly interakcie
- Kompaktný layout
- Horizontálne scrollovanie kde potrebné
- Adaptive columns v tabuľkách
- Optimalizované veľkosti fontov
- Lepšie využitie priestoru

---

## 🎯 Kľúčové optimalizácie

### 1. **Touch Targets (44px minimum)**

Všetky interaktívne prvky majú minimálnu veľkosť 44×44px (Apple HIG, Material Design):
- ✅ Tlačítka
- ✅ Links
- ✅ Input fields
- ✅ Table rows
- ✅ Navigation items
- ✅ Heatmap tiles

### 2. **Header Optimizations**

#### Tablet (768px - 1024px)
- Kompaktnejší layout
- Menší logo (40px)
- Zmenšené fonty
- Market indices: 90-120px width

#### Mobile (≤768px)
- Sticky header
- Skrytý tagline
- Menší logo (36px)
- Horizontálne scrollovanie pre market indices
- Horizontálne scrollovanie pre navigáciu
- Kompaktné gapy (0.5rem)

#### Small Mobile (≤480px)
- Extra kompaktný layout
- Logo 32px
- Len ikony v navigácii (bez textu)
- Market indices: 75-80px width

### 3. **Market Heatmap**

#### Mobile optimizations:
- Touch-friendly tiles (min 40px, small tiles 44px)
- Kompaktné controls
- Lepšie spacing
- Smooth scrolling

### 4. **Portfolio Section**

#### Mobile optimizations:
- Horizontálne scrollovanie tabuľky
- Skryté stĺpce: Sector, Industry (≤768px)
- Skrytý stĺpec: Company (≤480px)
- Touch-friendly quantity input (44px min)
- Kompaktné padding

#### Zobrazené stĺpce na mobile:
- Logo
- Ticker
- # (Quantity)
- Price
- % Change
- Value
- Actions

### 5. **Tables (Favorites, All Stocks)**

#### Mobile optimizations:
- Horizontálne scrollovanie
- Skryté stĺpce: Sector, Industry (≤768px)
- Skrytý stĺpec: Company (≤480px)
- Kompaktné padding
- Touch-friendly favorite star (44px)

### 6. **Cookie Consent Banner**

#### Mobile optimizations:
- Vertikálny layout
- Full-width tlačítka
- Centrovanie textu
- Touch-friendly buttons (44px)

---

## 📐 Breakpoints

### Desktop (≥1024px)
- Plný layout
- Všetky stĺpce viditeľné
- Normálne veľkosti

### Tablet (768px - 1024px)
- Kompaktnejší layout
- Viac stĺpcov viditeľných
- Stredné veľkosti

### Mobile (≤768px)
- Kompaktný layout
- Horizontálne scrollovanie
- Skryté menej dôležité stĺpce
- Touch-friendly veľkosti

### Small Mobile (≤480px)
- Extra kompaktný layout
- Minimálne stĺpce
- Len ikony v navigácii
- Najmenšie veľkosti

### Landscape Mobile (≤768px, landscape)
- Optimalizované pre horizontálnu orientáciu
- Viac priestoru pre obsah
- Lepšie rozloženie

---

## 🎨 CSS Classes

### Portfolio Table
- `.portfolio-table-wrapper` - Wrapper pre horizontálne scrollovanie
- `.portfolio-table` - Hlavná tabuľka
- `.portfolio-col-*` - Stĺpce s responsive triedami

### Responsive Hide Classes
- `.portfolio-col-sector` - Skrytý na mobile
- `.portfolio-col-industry` - Skrytý na mobile
- `.portfolio-col-company` - Skrytý na small mobile

---

## ⚡ Performance Optimizations

1. **Smooth Scrolling**
   - `-webkit-overflow-scrolling: touch` pre iOS
   - `scroll-behavior: smooth`

2. **Touch Actions**
   - `touch-action: manipulation` - rýchlejšie tapy
   - `-webkit-tap-highlight-color` - jemný highlight

3. **Text Selection**
   - `user-select: none` na interaktívnych prvkoch
   - `-webkit-touch-callout: none` - bez long-press menu

4. **Viewport**
   - `maximumScale: 5` - povolený zoom pre accessibility
   - `userScalable: true` - povolený zoom

---

## 📱 Testovanie

### Odporúčané zariadenia:
- iPhone SE (375px)
- iPhone 12/13/14 (390px)
- iPhone 14 Pro Max (430px)
- Samsung Galaxy S21 (360px)
- iPad Mini (768px)
- iPad (1024px)

### Testované scenáre:
- ✅ Portrait orientation
- ✅ Landscape orientation
- ✅ Touch interactions
- ✅ Horizontal scrolling
- ✅ Navigation usability
- ✅ Table scrolling
- ✅ Heatmap interactions
- ✅ Form inputs

---

## ✅ Checklist

- [x] Touch targets (44px minimum)
- [x] Header mobile optimization
- [x] Market indices horizontal scroll
- [x] Navigation horizontal scroll
- [x] Portfolio table horizontal scroll
- [x] Adaptive columns (hide less important)
- [x] Heatmap touch optimizations
- [x] Cookie consent mobile layout
- [x] Smooth scrolling
- [x] Touch action optimizations
- [x] Viewport settings
- [x] Landscape orientation support
- [x] Small mobile support (≤480px)
- [x] Tablet optimizations

---

## 🚀 Výsledok

Aplikácia je teraz plne optimalizovaná pre mobilné zariadenia a tablety:
- ✅ Touch-friendly interakcie
- ✅ Kompaktný a efektívny layout
- ✅ Horizontálne scrollovanie kde potrebné
- ✅ Adaptive columns v tabuľkách
- ✅ Lepšie využitie priestoru
- ✅ Profesionálny vzhľad na všetkých zariadeniach
- ✅ Accessibility podpora (zoom, focus states)

---

## 📝 Poznámky

- Všetky optimalizácie sú v `src/styles/mobile-optimizations.css`
- CSS je importovaný v `src/app/globals.css`
- Komponenty používajú responsive CSS triedy
- Viewport settings sú v `src/app/layout.tsx`


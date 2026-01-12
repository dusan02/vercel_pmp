# 📱 Mobilné UX Report - PreMarketPrice

**Dátum:** 2025-01-XX  
**Verzia:** Aktuálna produkčná verzia  
**Zameranie:** iOS Safari, iOS Chrome, Android Chrome

---

## 📋 Prehľad

Aplikácia používa **moderný app-like mobile layout** s:
- **Fixed header** (viditeľný vo všetkých sekciách okrem heatmap)
- **Fixed bottom navigation** (5 sekcií: Heatmap, Portfolio, Favorites, Earnings, Stocks)
- **Screen-based navigation** (každá sekcia je samostatný screen, nie scroll-to-section)
- **Fullscreen heatmap** (vlastný header, natiahnutá až k navigácii)

---

## 🏗️ Architektúra

### HTML Štruktúra

```
MobileApp (div.mobile-app)
├── MobileHeader (viditeľný okrem heatmap)
│   └── BrandLogo + "PreMarketPrice" + LoginButton
├── mobile-app-content (div.mobile-app-content)
│   ├── MobileScreen.screen-heatmap (active/inactive)
│   │   └── HomeHeatmap
│   │       └── MobileTreemap (vlastný fixed header)
│   ├── MobileScreen.screen-portfolio
│   ├── MobileScreen.screen-favorites
│   ├── MobileScreen.screen-earnings
│   └── MobileScreen.screen-all-stocks
└── MobileTabBar (fixed bottom navigation)
    └── 5 tabs: Heatmap, Portfolio, Favorites, Earnings, Stocks
```

### CSS Layout Systém

**Kontajnery:**
- `.mobile-app`: `height: 100dvh`, `display: flex`, `flex-direction: column`
- `.mobile-app-content`: `flex: 1`, `display: flex`, `flex-direction: column`
- `.mobile-app-screen`: `position: absolute`, `width: 100%`, `height: 100%`
- `.mobile-app-header`: `position: fixed`, `top: 0`, `z-index: 100`
- `.mobile-app-tabbar`: `position: fixed`, `bottom: 0`, `z-index: 9999`

**CSS Variables:**
- `--header-h: 56px`
- `--tabbar-h: 72px`

---

## 🎨 Sekcie

### 1. Heatmap (Úvodná sekcia)

**Štruktúra:**
- Vlastný fixed header (Logo + "PreMarketPrice" + Metric buttons + Expand/Compact + Sign In)
- Fullscreen layout (natiahnutá až k navigácii)
- Žiadny padding/margin (maximálne využitie plochy)

**Funkcie:**
- **Metric toggle:** `%` (Percent Change) vs `$` (Market Cap Change)
- **View toggle:** Compact (štvorce) vs Expanded (obdĺžniky)
- **Zoom:** Pinch-to-zoom, double-tap reset
- **Detail panel:** Bottom sheet pri kliknutí na dlaždicu (z-index: 10000, nad navigáciou)

**Layout:**
- Header: `position: fixed`, `top: 0`, `z-index: 100`, `height: 48px`
- Spacer: `height: 48px` (aby obsah nebol pod headerom)
- Treemap grid: `flex: 1`, `height: 100%`, `overflow: hidden`
- Inner wrapper: `width: containerSize.width * zoom`, `height: availableHeight`

**Problémy riešené:**
- ✅ Kontajner dosahuje až k navigácii
- ✅ Farebná heatmapa je natiahnutá do max šírky a výšky
- ✅ Detail panel nie je prekrytý navigáciou (z-index: 10000)
- ✅ Spodná hrana je zarovnaná s footerom

**Potenciálne zlepšenia:**
- ⚠️ Pinch hint môže byť rušivý (možno skryť po prvom použití)
- ⚠️ Debug overlay v development móde (odstrániť v production)

---

### 2. Portfolio

**Štruktúra:**
- Header: "Portfolio" + Search input
- Mobile: Card layout (PortfolioCardMobile)
- Desktop: Table layout (sortovateľné stĺpce)

**Mobile Layout:**
- Grid layout: `[grid-template-columns:40px_minmax(56px,1fr)_56px_72px_56px_52px]`
- Sortovateľné stĺpce: Ticker, Quantity (#), Price, % Change, Delta
- Kliknutie na kartu: Bottom sheet s detailmi
- Add stock: Search input s autocomplete

**Funkcie:**
- **Sortovanie:** Mobile chips (ticker, quantity, price, percent, delta)
- **Quantity input:** Inline editovanie množstva
- **Remove stock:** Delete button na každej karte
- **Search:** Autocomplete s keyboard navigation

**Layout:**
- Padding-top: `calc(var(--header-h) + 0.5rem)` (aby nadpis nebol pod headerom)
- Padding-bottom: `0` (obsah sa dotýka navigácie)
- Background: `#0f0f0f` (dark theme)

**Potenciálne zlepšenia:**
- ✅ Desktop sortovanie funguje
- ⚠️ Mobile sortovanie by mohlo mať vizuálne indikátory (▲/▼)
- ⚠️ Search results môžu byť lepšie viditeľné (kontrast)

---

### 3. Favorites

**Štruktúra:**
- Header: "Favorites" + Sort chips
- Mobile: Card layout (podobný Portfolio)
- Desktop: Table layout

**Funkcie:**
- **Sortovanie:** Chips (ticker, price, % change, market cap, cap diff)
- **Toggle favorite:** Star button na každej karte
- **Detail view:** Bottom sheet pri kliknutí

**Layout:**
- Podobný Portfolio (rovnaký padding-top, padding-bottom: 0)
- Sort chips: Horizontal scrollable

**Potenciálne zlepšenia:**
- ⚠️ Sort chips môžu byť lepšie viditeľné (active state)
- ⚠️ Empty state môže byť informatívnejší

---

### 4. Earnings

**Štruktúra:**
- Header: "Today's Earnings" (left-aligned)
- List layout: Earnings cards
- Filter: Time (Before Market, After Market, All)

**Funkcie:**
- **Filter:** Time-based filtering
- **Detail view:** Bottom sheet pri kliknutí
- **Auto-refresh:** Pravidelné obnovovanie dát

**Layout:**
- Padding-top: `calc(var(--header-h) + 0.5rem)`
- Padding-bottom: `0`
- Background: `#0f0f0f`

**Potenciálne zlepšenia:**
- ⚠️ Filter chips môžu byť lepšie viditeľné
- ⚠️ Empty state (žiadne earnings) môže byť informatívnejší

---

### 5. All Stocks

**Štruktúra:**
- Header: "All Stocks" + Search input + Filter chips
- Mobile: Card layout
- Desktop: Table layout

**Funkcie:**
- **Search:** Full-text search (ticker, company name)
- **Filter:** Sector, Industry
- **Sortovanie:** Chips (ticker, sector, industry, market cap, cap diff, price, % change)
- **Pagination:** Infinite scroll

**Layout:**
- Padding-top: `calc(var(--header-h) + 0.5rem)`
- Padding-bottom: `0`
- Background: `#0f0f0f` (forced, overrides bg-white/bg-slate)

**Potenciálne zlepšenia:**
- ✅ Background je teraz správne čierny
- ⚠️ Filter chips môžu byť lepšie viditeľné
- ⚠️ Search môže mať lepšie autocomplete

---

## 🧭 Navigácia

### Bottom Tab Bar

**Štruktúra:**
- 5 tabs: Heatmap, Portfolio, Favorites, Earnings, Stocks
- Fixed position: `bottom: 0`, `z-index: 9999`
- Height: `72px` + `env(safe-area-inset-bottom)`

**Funkcie:**
- **Active indicator:** Podčiarknutie pod aktívnym tabom
- **Keyboard navigation:** Arrow keys, Home, End
- **Touch optimization:** `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`
- **Accessibility:** ARIA labels, descriptions, focus management

**Styling:**
- Background: `#0f0f0f` (solid, no blur)
- Border-top: `1px solid rgba(255, 255, 255, 0.08)`
- Tab icons: `22px`
- Tab labels: Small text below icons
- Active tab: No background, only indicator

**Potenciálne zlepšenia:**
- ✅ Navigácia je funkčná a prístupná
- ⚠️ Tab labels môžu byť lepšie čitateľné (font size)
- ⚠️ Active indicator môže byť výraznejší

---

### Header

**Štruktúra:**
- Fixed position: `top: 0`, `z-index: 100`
- Height: `56px` (var(--header-h))
- Background: `#0f0f0f` (solid, no blur)
- Border-bottom: `1px solid rgba(255, 255, 255, 0.08)`

**Obsah:**
- BrandLogo (left)
- "PreMarketPrice" title (left, next to logo)
- LoginButton (right, square 44x44px)

**Heatmap Header:**
- Vlastný header v MobileTreemap
- Logo + "PreMarketPrice" + Metric buttons + Expand/Compact + Sign In
- Background: `rgba(0,0,0,0.88)`
- Height: `48px`

**Potenciálne zlepšenia:**
- ✅ Header je minimalistický a funkčný
- ⚠️ Title môže byť lepšie viditeľný (font weight)

---

## 🎨 Design System

### Farba

**Background:**
- Main: `#0f0f0f` (dark theme)
- Heatmap: `#000` (čierna)
- Cards: `rgba(255, 255, 255, 0.05)` (semi-transparent)

**Text:**
- Primary: `#ffffff`
- Secondary: `rgba(255, 255, 255, 0.65)`
- Muted: `rgba(255, 255, 255, 0.4)`

**Borders:**
- Primary: `rgba(255, 255, 255, 0.08)`
- Secondary: `rgba(255, 255, 255, 0.05)`

**Accent:**
- Blue: `#2563eb` (active states)
- Green: `#10b981` (positive changes)
- Red: `#ef4444` (negative changes)

### Typography

**Headings:**
- H2: `font-semibold`, `text-lg` (section headers)
- H3: `font-medium`, `text-base` (card titles)

**Body:**
- Default: `text-sm`
- Small: `text-xs`
- Tiny: `text-[10px]`

### Spacing

**Padding:**
- Container: `1rem` (16px)
- Cards: `0.75rem` (12px)
- Buttons: `0.5rem` (8px)

**Gaps:**
- Small: `0.5rem` (8px)
- Medium: `1rem` (16px)
- Large: `1.5rem` (24px)

---

## 📐 Layout & Kontajnery

### Root Level

```css
.mobile-app {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #0f0f0f;
  overflow-x: hidden;
}
```

### Content Area

```css
.mobile-app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: var(--header-h); /* 56px */
  min-height: 0;
}

.mobile-app-content.is-heatmap {
  padding-top: 0; /* Heatmap má vlastný header */
  padding-bottom: 0;
  height: 100%;
  min-height: 100%;
}
```

### Screens

```css
.mobile-app-screen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  padding: 1rem 1rem 0 1rem;
  padding-bottom: 0;
  overflow-y: auto;
  opacity: 0;
  transform: translate3d(100%, 0, 0);
  transition: opacity 0.3s, transform 0.3s;
}

.mobile-app-screen.active {
  opacity: 1;
  transform: translate3d(0, 0, 0);
  z-index: 1;
}

.mobile-app-screen.screen-heatmap {
  padding: 0;
  background: #000;
  transform: none;
  transition: none;
  display: flex;
  flex-direction: column;
}
```

---

## 🔧 Technické Detaily

### Performance

**Optimizácie:**
- Lazy loading screens (prefetch len pre heatmap)
- Suspense boundaries pre každý screen
- Skeleton loaders
- Memoization (React.memo, useMemo, useCallback)

**Potenciálne zlepšenia:**
- ⚠️ Code splitting pre jednotlivé sekcie
- ⚠️ Virtual scrolling pre veľké zoznamy (All Stocks)

### Accessibility

**ARIA:**
- `role="tablist"`, `role="tab"`, `role="tabpanel"`
- `aria-selected`, `aria-hidden`, `aria-label`
- Keyboard navigation (Arrow keys, Home, End, Enter, Escape)

**Potenciálne zlepšenia:**
- ⚠️ Screen reader announcements pre zmeny sekcií
- ⚠️ Focus management pri prepínaní sekcií

### Touch Optimization

**Implementované:**
- `touch-action: manipulation` (prevent double-tap zoom)
- `-webkit-tap-highlight-color: transparent`
- `-webkit-touch-callout: none`
- `user-select: none` (na niektorých elementoch)

**Potenciálne zlepšenia:**
- ✅ Touch optimization je dobre implementovaná

---

## 🐛 Známe Problémy

### Riešené ✅

1. **Biele vertikálne čiary na iOS Safari/Chrome**
   - ✅ Riešenie: Odstránené všetky `border-left/right`, `outline`, `box-shadow`
   - ✅ Riešenie: `isolation: isolate`, solid backgrounds namiesto blur

2. **Kontajner heatmapy nedosahuje až k navigácii**
   - ✅ Riešenie: `padding-bottom: 0`, `height: 100%`, `min-height: 100%`

3. **Detail panel prekrytý navigáciou**
   - ✅ Riešenie: `z-index: 10000` (navigácia má `z-index: 9999`)

4. **Spodná hrana heatmapy nie je zarovnaná**
   - ✅ Riešenie: `minHeight: availableHeight`, správny výpočet výšky

5. **Dvojité scrollbary na homepage heatmap**
   - ✅ Riešenie: `overflow: hidden` na všetkých kontajneroch

6. **"Stocks" sekcia nemá čierny background**
   - ✅ Riešenie: Forced `#0f0f0f` background pre `.screen-all-stocks`

### Potenciálne Problémy ⚠️

1. **Performance na starších zariadeniach**
   - ⚠️ Heatmap môže byť pomalá pri veľkom počte akcií
   - **Odporúčanie:** Virtual scrolling, throttling

2. **Accessibility**
   - ⚠️ Screen reader announcements chýbajú
   - **Odporúčanie:** Pridať `aria-live` regiony

3. **Empty states**
   - ⚠️ Niektoré sekcie nemajú informatívne empty states
   - **Odporúčanie:** Pridať helpful messages a CTA

4. **Error handling**
   - ⚠️ Error boundaries sú implementované, ale error messages môžu byť lepšie
   - **Odporúčanie:** User-friendly error messages

---

## 📊 Metriky UX

### Pozitíva ✅

1. **Moderný app-like design**
   - Native feel, smooth transitions
   - Intuitívna navigácia

2. **Fullscreen heatmap**
   - Maximálne využitie plochy
   - Immersive experience

3. **Konzistentný design**
   - Jednotný design system
   - Konzistentné spacing a typography

4. **Performance**
   - Rýchle načítanie
   - Smooth scrolling

5. **Accessibility**
   - Keyboard navigation
   - ARIA labels

### Oblasti na zlepšenie 🔄

1. **Vizuálne indikátory**
   - Sortovanie: Pridať ▲/▼ ikony
   - Active states: Výraznejšie indikátory

2. **Empty states**
   - Informatívnejšie messages
   - CTA buttons

3. **Error handling**
   - User-friendly error messages
   - Retry mechanisms

4. **Loading states**
   - Lepšie skeleton loaders
   - Progress indicators

---

## 🎯 Odporúčania

### Krátkodobé (1-2 týždne)

1. **Pridať vizuálne indikátory sortovania**
   - ▲/▼ ikony pri sortovaných stĺpcoch
   - Active state pre sort chips

2. **Vylepšiť empty states**
   - Informatívne messages
   - CTA buttons

3. **Vylepšiť error handling**
   - User-friendly messages
   - Retry buttons

### Strednodobé (1 mesiac)

1. **Code splitting**
   - Lazy load jednotlivé sekcie
   - Znížiť initial bundle size

2. **Virtual scrolling**
   - Pre veľké zoznamy (All Stocks)
   - Zlepšiť performance

3. **Screen reader support**
   - `aria-live` regiony
   - Announcements pre zmeny

### Dlhodobé (2-3 mesiace)

1. **Offline support**
   - Service workers
   - Cache stratégie

2. **Push notifications**
   - Earnings alerts
   - Price alerts

3. **Analytics**
   - User behavior tracking
   - Performance monitoring

---

## 📝 Záver

Mobilné UX je **vysoko kvalitné** s moderným app-like designom. Hlavné problémy boli vyriešené (biele čiary, kontajnery, zarovnanie). Aplikácia je **rýchla, prístupná a intuitívna**.

**Priorita zlepšení:**
1. Vizuálne indikátory (sortovanie, active states)
2. Empty states a error handling
3. Performance optimizácie (code splitting, virtual scrolling)

**Celkové hodnotenie:** ⭐⭐⭐⭐ (4/5)

---

**Vytvorené:** 2025-01-XX  
**Autor:** AI Assistant  
**Verzia dokumentu:** 1.0

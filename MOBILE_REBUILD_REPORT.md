# Mobile Rebuild Report - View-Based Navigation Implementation

## Prehľad

Mobilná verzia aplikácie bola kompletne prepracovaná s dôrazom na **app-like UX** namiesto scroll-to-sekcií. Hlavná zmena: **view-based navigation** - každá sekcia je samostatná obrazovka, ktorá sa prepína cez bottom navigation, nie scroll.

---

## 1. Diagnostika Problémov (Čo bolo rozbité)

### 1.1 Globálny Font-Size Hack
**Problém:**
```css
.homepage-wrapper {
  font-size: 0.3rem; /* 30% of base size */
}
```
- Brutálny globálny zásah, ktorý rozbíjal SVG/text/layout v heatmape
- Spôsoboval "nevysvetliteľné" rozpady layoutu
- Kompaktnosť by sa mala riešiť v komponente, nie cez globálny root

**Riešenie:** Odstránené úplne

### 1.2 Scroll-to-Sections + Fixed Bottom Nav
**Problém:**
- `scrollIntoView` na mobile často zastavil scroll "o kus vyššie/nižšie"
- Prekrytie obsahu spodným navbarom
- Rozbitý fokus (hlavne iOS Safari)
- Zbytočný vertikálny odpad (header + indexy + nav + boxy)

**Riešenie:** Zmenené na view-based navigation (každá sekcia = samostatná view)

### 1.3 Heatmap Renderovanie
**Problém:**
- Na mobile renderovalo len pozadie (fialový blok s labelom "TECHNOLOGY")
- Zlá šírka/výška kontajnera v momente renderu (0 → potom sa nevyráta layout)
- Font-size hack rozbíjal SVG/text

**Riešenie:** View-based rendering, heatmap má vlastný view s plnou výškou

### 1.4 Tabuľky na Mobile
**Problém:**
- Portfolio/Favorites/All Stocks sú tabuľky s veľa stĺpcami
- Na mobile vidno iba 1–2 stĺpce, zvyšok uteká mimo viewport
- Horizontal overflow

**Riešenie:** (Čiastočne) AllStocksSection už má StockCardMobile, treba dodať aj pre Favorites a Portfolio

### 1.5 Floating "UP" Tlačidlo
**Problém:**
- Prekrýva obsah (z-index + fixed position bez safe-area offsetu)

**Riešenie:** `bottom: 88px` (nad bottom nav) + iOS safe area support

---

## 2. Implementované Zmeny

### 2.1 Zrušený Globálny Font-Size Hack

**Súbor:** `src/app/globals.css`

**Pred:**
```css
.homepage-wrapper {
  font-size: 0.3rem;
  /* 30% of 16px = 4.8px base, but using rem for relative scaling */
}

.heatmap-page-wrapper {
  font-size: 1rem;
  /* Normal size for heatmap */
}
```

**Po:**
```css
/* REMOVED: Global font-size hack was breaking mobile layout
 * Compactness should be handled in individual components, not via global scaling
 */
```

**Dôvod:** Kompaktnosť sa má riešiť v jednotlivých komponentoch, nie cez globálny root scaling.

---

### 2.2 Vytvorený MobileShell Komponent

**Súbor:** `src/components/MobileShell.tsx`

**Účel:** App-like container pre mobile views s view-based navigáciou

**Kód:**
```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from './PageHeader';
import { BottomNavigation } from './BottomNavigation';
import { MarketIndices } from './MarketIndices';
import { LoginButton } from './LoginButton';
import { BrandLogo } from './BrandLogo';

export type MobileView = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

interface MobileShellProps {
  children?: React.ReactNode;
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
  navigation?: React.ReactNode;
}

/**
 * MobileShell - App-like container for mobile views
 * Replaces scroll-to-sections with view switching
 * 
 * Structure:
 * - Sticky header (brand + sign-in)
 * - Optional sticky indices bar
 * - Main content (single view)
 * - Fixed bottom navigation
 */
export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  activeView,
  onViewChange,
  navigation
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // Consistent with Tailwind lg breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only render mobile shell on mobile devices
  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="mobile-shell">
      {/* Sticky Header - Brand + Sign In */}
      <header className="mobile-header">
        <div className="mobile-header-container">
          <div className="flex items-center gap-3">
            <BrandLogo size={40} className="brand-logo" />
            <h1 className="brand-minimal m-0">
              <span className="brand-name">
                <span className="brand-premarket">PreMarket</span>
                <span className="brand-price"> Price</span>
              </span>
            </h1>
          </div>
          <div className="flex items-center">
            <LoginButton />
          </div>
        </div>
      </header>

      {/* Sticky Market Indices Bar */}
      <div className="mobile-indices-bar">
        <MarketIndices />
      </div>

      {/* Main Content - Single View */}
      <main className="mobile-main-content">
        {children}
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNavigation
        activeSection={activeView}
        onSectionChange={onViewChange}
      />
    </div>
  );
};
```

**Kľúčové vlastnosti:**
- Renderuje len na mobile (`window.innerWidth < 1024`)
- Sticky header (brand + sign-in)
- Sticky market indices bar
- Main content s safe padding pre bottom nav
- Fixed bottom navigation

---

### 2.3 Vytvorený MobileViews Komponent

**Súbor:** `src/components/MobileViews.tsx`

**Účel:** Renderuje len aktívny view (nie všetky sekcie pod sebou)

**Kód:**
```typescript
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { StockData } from '@/lib/types';
import { MobileView } from './MobileShell';

// Dynamic imports for mobile views
const HeatmapPreview = dynamic(
  () => import('@/components/HeatmapPreview').then((mod) => mod.HeatmapPreview),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading heatmap...</div> }
);

const PortfolioSection = dynamic(
  () => import('@/components/PortfolioSection').then((mod) => mod.PortfolioSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading portfolio...</div> }
);

const FavoritesSection = dynamic(
  () => import('@/components/FavoritesSection').then((mod) => mod.FavoritesSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading favorites...</div> }
);

const TodaysEarningsFinnhub = dynamic(
  () => import('@/components/TodaysEarningsFinnhub'),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading earnings...</div> }
);

const AllStocksSection = dynamic(
  () => import('@/components/AllStocksSection').then((mod) => mod.AllStocksSection),
  { ssr: false, loading: () => <div className="p-4 text-center text-gray-500">Loading stocks...</div> }
);

interface MobileViewsProps {
  activeView: MobileView;
  // Portfolio props
  portfolioStocks: StockData[];
  portfolioHoldings: Record<string, number>;
  allStocks: StockData[];
  portfolioLoading: boolean;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onRemoveStock: (ticker: string) => void;
  onAddStock: (ticker: string, quantity?: number) => void;
  calculatePortfolioValue: (stock: StockData) => number;
  totalPortfolioValue: number;
  // Favorites props
  favoriteStocks: StockData[];
  favoritesLoading: boolean;
  favSortKey: any;
  favAscending: boolean;
  onFavSort: (key: any) => void;
  onToggleFavorite: (ticker: string) => void;
  isFavorite: (ticker: string) => boolean;
  // All Stocks props
  displayedStocks: StockData[];
  allStocksLoading: boolean;
  allSortKey: any;
  allAscending: boolean;
  onAllSort: (key: any) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
  selectedSector: string;
  selectedIndustry: string;
  onSectorChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  uniqueSectors: string[];
  availableIndustries: string[];
}

/**
 * MobileViews - Renders only the active view (no scroll-to-sections)
 * Each view is a separate screen, switched via bottom navigation
 */
export const MobileViews: React.FC<MobileViewsProps> = ({
  activeView,
  // Portfolio
  portfolioStocks,
  portfolioHoldings,
  allStocks,
  portfolioLoading,
  onUpdateQuantity,
  onRemoveStock,
  onAddStock,
  calculatePortfolioValue,
  totalPortfolioValue,
  // Favorites
  favoriteStocks,
  favoritesLoading,
  favSortKey,
  favAscending,
  onFavSort,
  onToggleFavorite,
  isFavorite,
  // All Stocks
  displayedStocks,
  allStocksLoading,
  allSortKey,
  allAscending,
  onAllSort,
  searchTerm,
  onSearchChange,
  hasMore,
  selectedSector,
  selectedIndustry,
  onSectorChange,
  onIndustryChange,
  uniqueSectors,
  availableIndustries,
}) => {
  // Render only the active view
  switch (activeView) {
    case 'heatmap':
      return (
        <div className="mobile-view mobile-view-heatmap">
          <HeatmapPreview />
        </div>
      );

    case 'portfolio':
      return (
        <div className="mobile-view mobile-view-portfolio">
          <PortfolioSection
            portfolioStocks={portfolioStocks}
            portfolioHoldings={portfolioHoldings}
            allStocks={allStocks}
            loading={portfolioLoading}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveStock={onRemoveStock}
            onAddStock={onAddStock}
            calculatePortfolioValue={calculatePortfolioValue}
            totalPortfolioValue={totalPortfolioValue}
          />
        </div>
      );

    case 'favorites':
      return (
        <div className="mobile-view mobile-view-favorites">
          <FavoritesSection
            favoriteStocks={favoriteStocks}
            loading={favoritesLoading}
            sortKey={favSortKey}
            ascending={favAscending}
            onSort={onFavSort}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
          />
        </div>
      );

    case 'earnings':
      return (
        <div className="mobile-view mobile-view-earnings">
          <TodaysEarningsFinnhub />
        </div>
      );

    case 'allStocks':
      return (
        <div className="mobile-view mobile-view-all-stocks">
          <AllStocksSection
            displayedStocks={displayedStocks}
            loading={allStocksLoading}
            sortKey={allSortKey}
            ascending={allAscending}
            onSort={onAllSort}
            onToggleFavorite={onToggleFavorite}
            isFavorite={isFavorite}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            hasMore={hasMore}
            selectedSector={selectedSector}
            selectedIndustry={selectedIndustry}
            onSectorChange={onSectorChange}
            onIndustryChange={onIndustryChange}
            uniqueSectors={uniqueSectors}
            availableIndustries={availableIndustries}
          />
        </div>
      );

    default:
      return (
        <div className="mobile-view">
          <div className="p-4 text-center text-gray-500">Unknown view</div>
        </div>
      );
  }
};
```

**Kľúčové vlastnosti:**
- Renderuje len aktívny view (switch statement)
- Každá sekcia je samostatná obrazovka
- Dynamic imports pre code splitting
- Loading states pre každý view

---

### 2.4 Upravený HomePage.tsx

**Súbor:** `src/app/HomePage.tsx`

**Zmeny:**

1. **Pridané importy:**
```typescript
const MobileShell = dynamic(
  () => import('@/components/MobileShell').then((mod) => mod.MobileShell),
  { ssr: false, loading: () => null }
);
const MobileViews = dynamic(
  () => import('@/components/MobileViews').then((mod) => mod.MobileViews),
  { ssr: false, loading: () => null }
);
```

2. **Zmenená navigácia:**
```typescript
// Mobile: View-based navigation (no scrolling)
// Desktop: Scroll-based navigation (keep existing behavior)
const handleBottomNavChange = (section: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => {
  setActiveBottomSection(section);
  // On desktop, still use scroll-to-section
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
    switch (section) {
      case 'heatmap':
        scrollToSection('section-heatmap');
        break;
      // ... other cases
    }
  }
  // On mobile, view switching is handled by MobileShell/MobileViews
};
```

3. **Nový return statement:**
```typescript
return (
  <>
    {/* Mobile: App-like view switching */}
    <MobileShell
      activeView={activeBottomSection}
      onViewChange={handleBottomNavChange}
      navigation={
        <div className="hidden lg:block">
          <SectionNavigation
            preferences={preferences}
            onToggleSection={(key) => savePreferences({ [key]: !(preferences[key] ?? true) })}
            onScrollToSection={scrollToSection}
          />
        </div>
      }
    >
      <MobileViews {...mobileViewsProps} />
    </MobileShell>

    {/* Desktop: Traditional scroll-based layout */}
    <div className="homepage-container hidden lg:block">
      {/* ... existing desktop layout ... */}
    </div>
  </>
);
```

**Kľúčové vlastnosti:**
- Mobile: MobileShell + MobileViews (view-based)
- Desktop: Zachovaný pôvodný layout (scroll-based)
- Konzistentné breakpointy (1024px)

---

### 2.5 CSS Styling Pre MobileShell

**Súbor:** `src/app/globals.css`

**Pridané CSS:**
```css
/* Mobile Shell - App-like container */
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height for mobile */
  overflow: hidden;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--clr-surface);
  border-bottom: 1px solid var(--clr-border);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.mobile-header-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  max-width: 100%;
}

.mobile-indices-bar {
  position: sticky;
  top: 60px; /* Height of mobile header */
  z-index: 99;
  background: rgba(17, 17, 17, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.mobile-main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 80px; /* Safe area for fixed bottom nav */
  /* iOS safe area support */
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

/* Desktop: hide mobile shell */
@media (min-width: 1024px) {
  .mobile-shell {
    display: none;
  }
}

/* Mobile Views */
.mobile-view {
  width: 100%;
  min-height: 100%;
  padding: 1rem;
}

.mobile-view-heatmap {
  padding: 0;
  min-height: calc(100vh - 140px); /* Full height minus header + indices + nav */
}

.mobile-view-portfolio,
.mobile-view-favorites,
.mobile-view-all-stocks {
  padding-bottom: 2rem;
}

.mobile-view-earnings {
  padding: 1rem;
}
```

**Kľúčové vlastnosti:**
- `100dvh` pre dynamic viewport height (mobile)
- Safe padding pre bottom nav (`80px` + iOS safe area)
- Sticky header a indices bar
- Touch scrolling support

---

### 2.6 Opravený UP Button

**Súbor:** `src/app/globals.css`

**Pred:**
```css
.fab-container {
  position: fixed;
  bottom: 80px;
  right: 1rem;
  z-index: 999;
  /* ... */
}
```

**Po:**
```css
.fab-container {
  position: fixed;
  bottom: 88px; /* Above bottom nav (64px) + safe margin */
  right: 1rem;
  z-index: 999;
  /* iOS safe area support */
  bottom: calc(88px + env(safe-area-inset-bottom));
  /* ... */
}
```

---

### 2.7 Zjednotené Breakpointy

**Pred:**
- Mobile = `max-width: 768px`
- Desktop = `min-width: 1024px` (nekonzistentné)

**Po:**
- Mobile = `< 1024px` (konzistentne s Tailwind `lg`)
- Desktop = `>= 1024px`

**Použitie:**
```typescript
// JavaScript
setIsMobile(window.innerWidth < 1024);

// CSS
@media (min-width: 1024px) {
  .mobile-shell {
    display: none;
  }
}

// Tailwind
<div className="lg:hidden"> {/* Mobile only */}
<div className="hidden lg:block"> {/* Desktop only */}
```

---

## 3. Aktuálna Architektúra

### 3.1 Mobile Flow

```
User opens app on mobile
  ↓
MobileShell detects mobile (< 1024px)
  ↓
Renders:
  - Sticky header (brand + sign-in)
  - Sticky market indices bar
  - MobileViews (renders only active view)
  - Fixed bottom navigation
  ↓
User taps bottom nav item
  ↓
handleBottomNavChange updates activeView
  ↓
MobileViews switches to new view (no scroll)
```

### 3.2 Desktop Flow

```
User opens app on desktop
  ↓
MobileShell detects desktop (>= 1024px)
  ↓
Returns children directly (bypasses mobile shell)
  ↓
Desktop layout renders:
  - Full header with navigation
  - All sections stacked vertically
  - Scroll-to-section navigation
```

### 3.3 View Switching Logic

```typescript
// Mobile: View switching (no scroll)
if (isMobile) {
  // MobileShell handles view switching
  // MobileViews renders only active view
}

// Desktop: Scroll-to-section (existing behavior)
if (isDesktop) {
  // Scroll to section element
  scrollToSection('section-heatmap');
}
```

---

## 4. Zoznam Zmenených Súborov

### Nové súbory:
- `src/components/MobileShell.tsx` - App-like container pre mobile
- `src/components/MobileViews.tsx` - View renderer (len aktívny view)

### Upravené súbory:
- `src/app/HomePage.tsx` - Integrácia MobileShell + MobileViews
- `src/app/globals.css` - CSS pre MobileShell, safe padding, mobile views

### Odstránené:
- `.homepage-wrapper { font-size: 0.3rem; }` - Globálny font-size hack

---

## 5. Technické Detaily

### 5.1 Breakpoints
- **Mobile**: `< 1024px` (konzistentne s Tailwind `lg`)
- **Desktop**: `>= 1024px`

### 5.2 Safe Areas
- Bottom nav height: `64px`
- Safe padding: `80px` (64px + 16px margin)
- iOS safe area: `env(safe-area-inset-bottom)`

### 5.3 View Height
- Mobile shell: `100vh` / `100dvh` (dynamic viewport height)
- Heatmap view: `calc(100vh - 140px)` (full height minus header + indices + nav)
- Other views: `min-height: 100%` s padding

### 5.4 Performance
- Dynamic imports pre code splitting
- MobileShell renderuje len na mobile
- Desktop layout zachovaný (žiadne zmeny)

---

## 6. Čo Ešte Treba

### 6.1 Heatmap na Mobile
**Status:** Čiastočne hotové (má vlastný view)
**Treba:** 
- Overiť, či heatmap renderuje správne na mobile
- Možno fullscreen variant alebo preview + link

### 6.2 Tabuľky → Cards
**Status:** AllStocksSection už má StockCardMobile
**Treba:**
- FavoritesSection - zmeniť na cards na mobile
- PortfolioSection - zmeniť na cards na mobile

### 6.3 Filters/Search na Mobile
**Status:** AllStocksSection má search a filters
**Treba:**
- Overiť, či fungujú správne na mobile
- Možno sticky filter bar

---

## 7. Testovanie

### 7.1 Mobile (< 1024px)
- [ ] MobileShell sa renderuje
- [ ] View switching funguje (heatmap → portfolio → favorites → earnings → allStocks)
- [ ] Žiadny scroll-to-section
- [ ] Bottom nav nič neprekrýva
- [ ] Safe padding funguje
- [ ] Heatmap renderuje správne
- [ ] Tabuľky sú cards (alebo aspoň čitateľné)

### 7.2 Desktop (>= 1024px)
- [ ] MobileShell sa nerenderuje
- [ ] Desktop layout zachovaný
- [ ] Scroll-to-section funguje
- [ ] Všetky sekcie viditeľné

---

## 8. Zhrnutie

**Hlavné zmeny:**
1. ✅ Zrušený globálny font-size hack
2. ✅ Vytvorený MobileShell (app-like container)
3. ✅ Vytvorený MobileViews (view-based rendering)
4. ✅ Zmenená navigácia z scroll-to-sekcií na view switching
5. ✅ Pridaný safe padding pre bottom nav
6. ✅ Opravený UP button positioning
7. ✅ Zjednotené breakpointy (1024px)

**Výsledok:**
- Mobile: App-like UX (view switching, žiadny scroll chaos)
- Desktop: Zachovaný pôvodný layout (scroll-based)
- Konzistentné breakpointy
- Safe areas pre iOS

**Ešte treba:**
- Overiť heatmap rendering na mobile
- Zmeniť Favorites a Portfolio na cards na mobile
- Testovanie na skutočných zariadeniach

---

## 9. Kódové Príklady

### 9.1 Použitie MobileShell

```typescript
<MobileShell
  activeView={activeBottomSection}
  onViewChange={handleBottomNavChange}
  navigation={/* desktop navigation */}
>
  <MobileViews {...mobileViewsProps} />
</MobileShell>
```

### 9.2 Pridanie Nového View

```typescript
// V MobileViews.tsx
case 'newView':
  return (
    <div className="mobile-view mobile-view-new">
      <NewViewComponent {...props} />
    </div>
  );
```

### 9.3 CSS Pre Nový View

```css
.mobile-view-new {
  padding: 1rem;
  min-height: 100%;
}
```

---

## 10. Best Practices

1. **Nikdy nepoužívať globálny font-size hack** - riešiť kompaktnosť v komponente
2. **View-based navigation na mobile** - nie scroll-to-sections
3. **Safe areas vždy** - `env(safe-area-inset-bottom)` pre iOS
4. **Konzistentné breakpointy** - 1024px všade
5. **Dynamic imports** - code splitting pre mobile views
6. **Touch-friendly** - min 44x44px touch targets

---

**Report vytvorený:** 2025-12-30
**Verzia:** 1.0
**Status:** Implementované (čiastočne - treba overiť heatmap a cards)


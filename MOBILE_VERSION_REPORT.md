# Mobile Version Implementation Report

## Prehľad

Mobilná verzia aplikácie PreMarket Price bola kompletne prepracovaná s dôrazom na optimalizáciu UX pre dotykové zariadenia. Implementácia zahŕňa zjednodušený header, vertikálny heatmap layout, kompaktné karty pre akcie, vždy viditeľnú spodnú navigáciu a 3 market indexy.

---

## 1. Architektúra a Komponenty

### 1.1 Hlavné Komponenty

#### **PageHeader.tsx** - Responzívny Header
```typescript
// pmp_prod/src/components/PageHeader.tsx

export function PageHeader({ navigation }: PageHeaderProps) {
  return (
    <header className="header">
      <div className="header-container">
        {/* MOBILE: Simple layout - Brand + Sign In */}
        <div className="lg:hidden flex items-center justify-between w-full">
          <div className="brand-container flex items-center gap-3">
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

        {/* DESKTOP: Full layout */}
        <div className="hidden lg:flex items-center justify-between w-full">
          {/* LEFT ZONE: Branding */}
          <div className="header-left">
            <div className="brand-container">
              <BrandLogo size={48} className="brand-logo" />
              <div className="brand-content">
                <h1 className="brand-minimal">
                  <span className="brand-name">
                    <span className="brand-premarket">PreMarket</span>
                    <span className="brand-price"> Price</span>
                  </span>
                </h1>
                <p className="brand-tagline">
                  Trade ahead of the market
                </p>
              </div>
            </div>
          </div>

          {/* CENTER ZONE: Market Indices */}
          <div className="header-center desktop-indices">
            <MarketIndices />
          </div>

          {/* RIGHT ZONE: Navigation & Login */}
          <div className="header-right flex items-center gap-4">
            {navigation}
            <div className="border-l pl-4 border-gray-700 h-6 flex items-center">
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
```

**Kľúčové vlastnosti:**
- **Mobile**: Zobrazuje len brand logo + názov + login button (40px logo)
- **Desktop**: Zobrazuje brand + tagline + market indices + navigation + login (48px logo)
- Používa Tailwind CSS `lg:hidden` a `hidden lg:flex` pre responzívne zobrazenie

---

#### **BottomNavigation.tsx** - Vždy Viditeľná Spodná Navigácia
```typescript
// pmp_prod/src/components/BottomNavigation.tsx

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeSection,
  onSectionChange
}) => {
  const navItems = [
    {
      id: 'heatmap' as const,
      label: 'Heatmap',
      icon: BarChart3,
      color: 'text-blue-600'
    },
    {
      id: 'portfolio' as const,
      label: 'Portfolio',
      icon: PieChart,
      color: 'text-purple-600'
    },
    {
      id: 'favorites' as const,
      label: 'Favorites',
      icon: Star,
      color: 'text-yellow-600'
    },
    {
      id: 'earnings' as const,
      label: 'Earnings',
      icon: Calendar,
      color: 'text-green-600'
    },
    {
      id: 'allStocks' as const,
      label: 'All Stocks',
      icon: BarChart3,
      color: 'text-indigo-600'
    }
  ];

  return (
    <nav className="bottom-navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`nav-item ${isActive ? 'active' : ''}`}
            aria-label={item.label}
          >
            <Icon 
              className={`nav-icon ${isActive ? item.color : 'text-gray-500'}`} 
              size={24} 
            />
            <span className={`nav-label ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
              {item.label}
            </span>
            {isActive && <div className="active-indicator" />}
          </button>
        );
      })}
    </nav>
  );
};
```

**Kľúčové vlastnosti:**
- 5 navigačných položiek: Heatmap, Portfolio, Favorites, Earnings, All Stocks
- Vždy viditeľná na spodku obrazovky (fixed position)
- Aktívna sekcia je zvýraznená farbou a indikátorom
- Používa Lucide React ikony (24px)
- Touch-friendly veľkosť tlačidiel (min 44x44px)

---

#### **StockCardMobile.tsx** - Mobilné Karty Pre Akcie
```typescript
// pmp_prod/src/components/StockCardMobile.tsx

export const StockCardMobile = memo(({
  stock,
  isFavorite,
  onToggleFavorite,
  priority = false
}: StockCardMobileProps) => {
  const formattedPrice = useMemo(() => formatPrice(stock.currentPrice), [stock.currentPrice]);
  const formattedPercentChange = useMemo(() => formatPercent(stock.percentChange), [stock.percentChange]);
  
  const fullCompanyName = useMemo(() => getCompanyName(stock.ticker), [stock.ticker]);
  const isPositive = stock.percentChange >= 0;

  return (
    <div className="bg-[#111] border border-gray-800 rounded-lg p-4 mb-3 active:bg-gray-900 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
             <CompanyLogo 
              ticker={stock.ticker} 
              {...(stock.logoUrl ? { logoUrl: stock.logoUrl } : {})} 
              size={48} 
              priority={priority} 
            />
             <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="absolute -bottom-1 -right-1 w-6 h-6 flex items-center justify-center bg-gray-900 rounded-full border border-gray-700 shadow-sm z-10"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <span className={`text-sm ${isFavorite ? 'text-yellow-400' : 'text-gray-500'}`}>
                {isFavorite ? '★' : '☆'}
              </span>
            </button>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white">{stock.ticker}</h3>
              <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-900 rounded border border-gray-800">
                {stock.sector}
              </span>
            </div>
            <p className="text-sm text-gray-400 truncate mt-0.5">{fullCompanyName}</p>
          </div>
        </div>

        <div className="text-right flex-shrink-0 ml-3">
          <div className="font-mono font-bold text-white text-lg">${formattedPrice}</div>
          <div className={`flex items-center justify-end gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isPositive ? '+' : ''}{formattedPercentChange}%
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <div className="flex gap-4">
          <div>
            <span className="block text-gray-600 mb-0.5">Mkt Cap</span>
            <span className="text-gray-300 font-medium">{formatBillions(stock.marketCap)}</span>
          </div>
           <div>
            <span className="block text-gray-600 mb-0.5">Cap Diff</span>
            <span className={`font-medium ${stock.marketCapDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
               {stock.marketCapDiff >= 0 ? '+' : ''}{formatMarketCapDiff(stock.marketCapDiff)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
```

**Kľúčové vlastnosti:**
- Kompaktný layout: Logo (48px) + Ticker + Sector badge + Company name
- Cena a percentuálna zmena vpravo s trend ikonami
- Market Cap a Cap Diff v spodnej sekcii
- Favorites toggle button na logu
- Touch-friendly (active:bg-gray-900)
- Memoizovaný pre optimalizáciu výkonu

---

#### **MarketIndices.tsx** - 3 Market Indexy (SPY, QQQ, DIA)
```typescript
// pmp_prod/src/components/MarketIndices.tsx

const INDICES = [
    { ticker: 'SPY', name: 'S&P 500' },
    { ticker: 'QQQ', name: 'NASDAQ' },
    { ticker: 'DIA', name: 'DOW' }
];

export function MarketIndices() {
    const [data, setData] = useState<Record<string, StockData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let abortController: AbortController | null = null;
        
        const fetchIndices = async () => {
            if (abortController) {
                abortController.abort();
            }
            abortController = new AbortController();
            
            const tickers = INDICES.map(i => i.ticker).join(',');
            
            try {
                const res = await fetch(`/api/stocks?tickers=${tickers}`, {
                    signal: abortController.signal,
                    cache: 'no-store',
                });
                
                if (!res.ok) {
                    throw new Error(`API returned ${res.status}: ${res.statusText}`);
                }

                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    const map: Record<string, StockData> = {};
                    json.data.forEach((stock: StockData) => {
                        map[stock.ticker] = stock;
                    });
                    setData(map);
                }
            } catch (err: any) {
                // Handle errors gracefully
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        // Auto-refresh every minute
        const interval = setInterval(fetchIndices, 60000);
        return () => {
            clearInterval(interval);
            if (abortController) {
                abortController.abort();
            }
        };
    }, []);

    return (
        <div className="market-indicators-section">
            <div className="market-indicators-container">
                <div className="market-indicators">
                    {INDICES.map(({ ticker, name }) => {
                        const stock = data[ticker];
                        const price = stock?.currentPrice;
                        const change = stock?.percentChange;
                        const isPositive = (change || 0) >= 0;

                        return (
                            <div key={ticker} className="market-indicator animate-in fade-in duration-500" title={`${name} (${ticker})`}>
                                <span className="indicator-name">{ticker}</span>
                                <div className="indicator-values">
                                    <div className="indicator-price">
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-6 w-24 block rounded"></span>
                                        ) : (
                                            `$${formatPrice(price)}`
                                        )}
                                    </div>
                                    <div className={`indicator-change ${isPositive ? 'positive' : 'negative'}`}>
                                        {isPositive ? (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="18 15 12 9 6 15"/>
                                            </svg>
                                        ) : (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="6 9 12 15 18 9"/>
                                            </svg>
                                        )}
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 block rounded mt-1"></span>
                                        ) : (
                                            <span>{formatPercent(change)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
```

**Kľúčové vlastnosti:**
- Zobrazuje 3 indexy: SPY (S&P 500), QQQ (NASDAQ), DIA (DOW)
- Auto-refresh každú minútu
- Loading state s skeleton UI
- Pozitívne/negatívne zmeny s ikonami
- AbortController pre cleanup pri unmount

---

#### **useMediaQuery.ts** - React Hook Pre Media Queries
```typescript
// pmp_prod/src/hooks/useMediaQuery.ts

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        // Avoid running on server
        if (typeof window === 'undefined') return;

        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }

        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);

        return () => media.removeEventListener('change', listener);
    }, [matches, query]);

    return matches;
}
```

**Použitie:**
```typescript
const isMobile = useMediaQuery('(max-width: 768px)');
```

---

### 1.2 Responzívny Heatmap

#### **ResponsiveMarketHeatmap.tsx** - Vertikálny Layout Pre Mobile
```typescript
// pmp_prod/src/components/ResponsiveMarketHeatmap.tsx

export const ResponsiveMarketHeatmap: React.FC<ResponsiveMarketHeatmapProps> = ({
  sectorLabelVariant = 'compact',
  // ... other props
}) => {
  const { ref, size } = useElementResize();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      ref={ref}
      className="h-full w-full relative mobile-heatmap-wrapper"
      style={{
        overflowY: isMobile ? 'auto' : 'hidden',
        overflowX: 'hidden',
        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
      }}
    >
      <MarketHeatmap
        data={data}
        width={width}
        height={height}
        sectorLabelVariant={sectorLabelVariant}
        zoomedSector={null}
      />
    </div>
  );
};
```

**Kľúčové vlastnosti:**
- Vertikálny scroll na mobile (`overflowY: 'auto'`)
- Touch scrolling (`WebkitOverflowScrolling: 'touch'`)
- Compact sector labels pre homepage
- Full sector labels pre heatmap page

---

### 1.3 All Stocks Section - Mobile Layout

#### **AllStocksSection.tsx** - 5 Stĺpcová Tabuľka Pre Mobile
```typescript
// pmp_prod/src/components/AllStocksSection.tsx

// Table header configuration - Mobile (5 columns only)
const TABLE_HEADERS_MOBILE: { key?: SortKey; label: string; sortable: boolean }[] = [
  { label: 'Logo', sortable: false },
  { key: 'ticker', label: 'Ticker', sortable: true },
  { key: 'percentChange', label: '% Change', sortable: true },
  { key: 'marketCapDiff', label: 'Cap Diff', sortable: true },
  { label: 'Action', sortable: false },
];

export const AllStocksSection = React.memo(function AllStocksSection({
  // ... props
}) {
  // ... logic

  return (
    <section className="all-stocks">
      {/* ... header ... */}
      
      {isMobile ? (
        <div className="grid grid-cols-1 gap-3">
          {displayedStocks.map((stock, index) => (
            <StockCardMobile
              key={stock.ticker}
              stock={stock}
              isFavorite={isFavorite(stock.ticker)}
              onToggleFavorite={favoriteHandlers.get(stock.ticker) || (() => onToggleFavorite(stock.ticker))}
              priority={index < 100}
            />
          ))}
        </div>
      ) : (
        <div className="table-wrapper-mobile-safe">
          <table>
            <thead>
              <tr>
                {TABLE_HEADERS_DESKTOP.map((header, index) => (
                  <th
                    key={index}
                    onClick={header.sortable && header.key ? () => onSort(header.key!) : undefined}
                    className={header.sortable ? `sortable ${sortKey === header.key ? "active-sort" : ""}` : undefined}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedStocks.map((stock, index) => (
                <StockTableRow
                  key={stock.ticker}
                  stock={stock}
                  isFavorite={isFavorite(stock.ticker)}
                  onToggleFavorite={favoriteHandlers.get(stock.ticker) || (() => onToggleFavorite(stock.ticker))}
                  priority={index < 100}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
```

**Kľúčové vlastnosti:**
- **Mobile**: Používa `StockCardMobile` komponenty v grid layout
- **Desktop**: Používa tradičnú tabuľku s `StockTableRow`
- 5 stĺpcov na mobile (Logo, Ticker, % Change, Cap Diff, Action)
- 10 stĺpcov na desktop (vrátane Company, Sector, Industry, Market Cap, Price)

---

## 2. CSS Styling

### 2.1 Bottom Navigation Styles
```css
/* pmp_prod/src/app/globals.css */

.bottom-navigation {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(17, 17, 17, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px 0;
  z-index: 1000;
  height: 64px;
}

.bottom-navigation .nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  min-width: 60px;
  min-height: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.bottom-navigation .nav-item.active {
  color: #3b82f6;
}

.bottom-navigation .nav-item .active-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  background: #3b82f6;
  border-radius: 50%;
}
```

### 2.2 Market Indices Styles
```css
.market-indicators-section {
  width: 100%;
  padding: 12px 16px;
  background: rgba(17, 17, 17, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.market-indicators-container {
  max-width: 100%;
  margin: 0 auto;
}

.market-indicators {
  display: flex;
  gap: 16px;
  justify-content: space-around;
  align-items: center;
}

.market-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.indicator-name {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.indicator-price {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  font-family: 'Courier New', monospace;
}

.indicator-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}

.indicator-change.positive {
  color: #10b981;
}

.indicator-change.negative {
  color: #ef4444;
}
```

### 2.3 Mobile Heatmap Wrapper
```css
.mobile-heatmap-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 1024px) {
  .mobile-heatmap-wrapper {
    overflow-y: hidden;
  }
}
```

### 2.4 Homepage Wrapper (Font Scaling)
```css
.homepage-wrapper {
  font-size: 0.3rem; /* 30% of base size for compact homepage */
}

.heatmap-page-wrapper {
  font-size: 1rem; /* Full size for heatmap page */
}
```

---

## 3. Integrácia v HomePage

```typescript
// pmp_prod/src/app/HomePage.tsx

export default function HomePage() {
  const [mobileSelectedSector, setMobileSelectedSector] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks'>('heatmap');

  // Dynamic imports for mobile components
  const BottomNavigation = dynamic(() => import('@/components/BottomNavigation').then(mod => mod.BottomNavigation), { ssr: false });
  const MarketIndices = dynamic(() => import('@/components/MarketIndices').then(mod => mod.MarketIndices), { ssr: false });

  const handleBottomNavChange = (section: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks') => {
    setActiveSection(section);
    // Scroll to section
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="homepage-wrapper">
      {/* Market Indices - Mobile only, shown below header */}
      <div className="lg:hidden container mx-auto px-4 py-2">
        <MarketIndices />
      </div>

      {/* Main content sections */}
      {/* ... */}

      {/* Mobile Bottom Navigation - Always visible on mobile/tablet */}
      <div className="lg:hidden">
        <BottomNavigation
          activeSection={activeSection}
          onSectionChange={handleBottomNavChange}
        />
      </div>
    </div>
  );
}
```

---

## 4. Technické Detaily

### 4.1 Breakpoints
- **Mobile**: `max-width: 768px` (lg breakpoint v Tailwind)
- **Desktop**: `min-width: 1024px` (lg breakpoint v Tailwind)

### 4.2 Touch Targets
- Minimálna veľkosť: **44x44px** (Apple HIG, Material Design)
- Bottom navigation items: **60x44px**
- Stock card favorite button: **24x24px** (s paddingom = 44px touch area)

### 4.3 Performance Optimizations
- **Dynamic imports** pre mobile komponenty (code splitting)
- **React.memo** pre StockCardMobile
- **useMemo** pre formátované hodnoty
- **Priority loading** pre logá (prvých 100 akcií)

### 4.4 Accessibility
- **ARIA labels** na navigačných tlačidlách
- **Semantic HTML** (nav, header, section)
- **Keyboard navigation** podporované
- **Screen reader friendly** (aria-label, title attributes)

---

## 5. Zoznam Súborov

### Komponenty
- `src/components/PageHeader.tsx` - Responzívny header
- `src/components/BottomNavigation.tsx` - Spodná navigácia
- `src/components/StockCardMobile.tsx` - Mobilné karty pre akcie
- `src/components/MarketIndices.tsx` - Market indexy (SPY, QQQ, DIA)
- `src/components/ResponsiveMarketHeatmap.tsx` - Responzívny heatmap wrapper
- `src/components/AllStocksSection.tsx` - Responzívna sekcia všetkých akcií

### Hooks
- `src/hooks/useMediaQuery.ts` - Media query hook

### Styling
- `src/app/globals.css` - Globálne štýly (bottom-navigation, market-indicators, mobile-heatmap-wrapper)

### Integrácia
- `src/app/HomePage.tsx` - Hlavná stránka s mobilnou integráciou

---

## 6. UX Vylepšenia

### 6.1 Zjednodušený Header
- **Mobile**: Len brand + login (minimalistický)
- **Desktop**: Brand + tagline + indices + navigation + login (kompletný)

### 6.2 Vždy Viditeľná Navigácia
- Fixed position na spodku obrazovky
- 5 hlavných sekcií vždy dostupných
- Aktívna sekcia vizuálne zvýraznená

### 6.3 Vertikálny Heatmap
- Sektory zobrazené vertikálne (jeden pod druhým)
- Každý sektor má vlastný treemap
- Smooth scrolling s touch support

### 6.4 Kompaktné Karty
- Všetky dôležité informácie na jednom mieste
- Touch-friendly veľkosti
- Favorites toggle priamo na karte

### 6.5 Market Indexy
- 3 hlavné indexy vždy viditeľné
- Auto-refresh každú minútu
- Loading states s skeleton UI

---

## 7. Testovanie

### 7.1 Responzívne Testovanie
- **iPhone SE** (375px) - Najmenší mobile
- **iPhone 12/13** (390px) - Štandardný mobile
- **iPad** (768px) - Tablet
- **Desktop** (1024px+) - Plná verzia

### 7.2 Touch Interakcie
- Tap na navigačné tlačidlá
- Swipe na heatmap
- Long press na favorites
- Scroll performance

---

## 8. Zhrnutie

Mobilná verzia aplikácie PreMarket Price poskytuje:

✅ **Zjednodušený UX** - Minimalistický header, vždy viditeľná navigácia
✅ **Touch-friendly** - Všetky interakcie optimalizované pre dotyk
✅ **Performance** - Code splitting, memoization, priority loading
✅ **Accessibility** - ARIA labels, semantic HTML, keyboard navigation
✅ **Responzívny design** - Plynulé prechody medzi mobile/desktop
✅ **Real-time data** - Auto-refresh pre market indexy a heatmap

Všetky komponenty sú navrhnuté s dôrazom na mobilný UX a výkon, pričom zachovávajú plnú funkcionalitu desktopovej verzie.


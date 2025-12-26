# 📱 Mobile & Tablet Table Optimization

## Prehľad

Optimalizácia zobrazenia tabuliek pre mobilné zariadenia a tablety s zoskupením stĺpcov do kompaktnejších riadkov.

---

## 🎯 Zoskupenie stĺpcov na mobile

### Favorites & All Stocks Tables

**Desktop (≥1024px):**
- Logo | Ticker | Company | Sector | Industry | Market Cap | Price | % Change | Cap Diff | Favorites

**Mobile/Tablet (≤1024px):**
- **Column 1:** Logo + Ticker + Company (vertikálne)
- **Column 2:** Sector + Industry (vertikálne)
- **Column 3:** Market Cap + Cap Diff (vertikálne)
- **Column 4:** Price + % Change (vertikálne)
- **Column 5:** Favorites

### Portfolio Table

**Desktop (≥1024px):**
- Logo | Ticker | Company | Sector | Industry | # | Price | % Change | Value | Actions

**Mobile/Tablet (≤1024px):**
- **Column 1:** Logo + Ticker + Company (vertikálne)
- **Column 2:** Sector + Industry (vertikálne)
- **Column 3:** # (Quantity)
- **Column 4:** Price + % Change (vertikálne)
- **Column 5:** Value
- **Column 6:** Actions

---

## 📐 Implementácia

### 1. **StockTableRow Component**

Každý stĺpec má:
- `.desktop-only` - zobrazuje sa len na desktop
- `.mobile-compact-cell` - zobrazuje sa len na mobile
- `.mobile-group-*` - triedy pre zoskupené stĺpce

### 2. **PortfolioSection Component**

Podobná štruktúra s:
- `.portfolio-mobile-group-*` - triedy pre portfolio zoskupené stĺpce

### 3. **CSS Rules**

#### Desktop-only elements
```css
@media (max-width: 1024px) {
  .desktop-only {
    display: none !important;
  }
}
```

#### Mobile compact cells
```css
@media (max-width: 1024px) {
  .mobile-compact-cell {
    display: flex !important;
    flex-direction: column;
    gap: 0.25rem;
  }
}
```

#### Hide separate columns on mobile
- Ticker (separate) - `nth-child(2)`
- Company (separate) - `nth-child(3)`
- Industry (separate) - `nth-child(5)`
- % Change (separate) - `nth-child(8)`
- Cap Diff (separate) - `nth-child(9)`

#### Header labels
Header labels majú `::after` pseudo-element, ktorý zobrazuje zoskupené informácie:
- "Logo" → "Logo / Ticker / Company"
- "Sector" → "Sector / Industry"
- "Market Cap" → "Market Cap / Cap Diff"
- "Price" → "Price / % Change"

---

## 🎨 Vizuálne vylepšenia

### Mobile Compact Cell
- Vertikálne zobrazenie informácií
- Menšie fonty pre sekundárne informácie
- Lepšie spacing medzi riadkami
- Farbové rozlíšenie (positive/negative)

### Riadky
- Minimálna výška: 70px (namiesto 48px)
- Väčší padding: 0.875rem
- Vertikálne zarovnanie: top

### Stĺpce
- Minimálne šírky pre zoskupené stĺpce
- Max šírky pre lepšie rozloženie
- Flexbox layout pre vertikálne zobrazenie

---

## ✅ Výsledok

**Pred optimalizáciou:**
- 10 stĺpcov na mobile (príliš široké)
- Horizontálne scrollovanie
- Ťažko čitateľné

**Po optimalizácii:**
- 5 stĺpcov na mobile (kompaktné)
- Všetky informácie viditeľné
- Vertikálne zoskupené údaje
- Lepšia čitateľnosť
- Riadky sú vyššie, ale užšie

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
- ✅ Favorites table
- ✅ All Stocks table
- ✅ Portfolio table
- ✅ Header labels
- ✅ Zoskupené stĺpce
- ✅ Vertikálne zobrazenie
- ✅ Touch interactions

---

## 🔧 Technické detaily

### CSS Classes

**Desktop-only:**
- `.desktop-only` - skryté na mobile

**Mobile-only:**
- `.mobile-compact-cell` - zobrazuje sa len na mobile
- `.mobile-group-1` - Logo + Ticker + Company
- `.mobile-group-2` - Sector + Industry
- `.mobile-group-3` - Market Cap + Cap Diff
- `.mobile-group-4` - Price + % Change
- `.portfolio-mobile-group-1` - Portfolio Logo + Ticker + Company
- `.portfolio-mobile-group-2` - Portfolio Sector + Industry
- `.portfolio-mobile-group-4` - Portfolio Price + % Change

### Breakpoints
- Desktop: ≥1024px - plné zobrazenie
- Mobile/Tablet: ≤1024px - zoskupené stĺpce

---

## 📝 Poznámky

- Všetky zmeny sú v `src/components/StockTableRow.tsx` a `src/components/PortfolioSection.tsx`
- CSS pravidlá sú v `src/app/globals.css` v sekcii "MOBILE TABLE COMPACT VIEW"
- Zoskupené stĺpce používajú flexbox pre vertikálne zobrazenie
- Header labels majú `::after` pseudo-element pre zobrazenie zoskupených informácií


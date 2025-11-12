# Stock Market Heatmap Treemap - Frontend Component

## Zadanie pre v0.app

Vytvor React komponent pre stock market heatmap treemap vizualizáciu, ktorý sa napojí na existujúci backend API.

## Backend API

**Endpoint:** `GET /api/heatmap/treemap?session=live`

**Query Parameters:**
- `session`: `'pre' | 'live' | 'after'` (default: `'live'`)
- `date`: `YYYY-MM-DD` (optional, default: today)

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "sectors": [
      {
        "sector": "Technology",
        "totalMarketCap": 15000.5,
        "stocks": [
          {
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "sector": "Technology",
            "industry": "Consumer Electronics",
            "marketCap": 3500.2,
            "percentChange": 2.45,
            "currentPrice": 175.50,
            "sharesOutstanding": 20000000000
          }
        ]
      }
    ],
    "totalMarketCap": 50000.0,
    "stockCount": 615,
    "date": "2024-01-15",
    "session": "live"
  }
}
```

## Požiadavky na komponent

### 1. Treemap Vizualizácia

- **Zoskupenie:** Akcie zoskupené podľa sektora (`sector`)
- **Veľkosť bloku:** Proporcionálna k `marketCap` (väčší market cap = väčší blok)
- **Farba bloku:** 
  - Zelená pre pozitívne `percentChange` (rast)
  - Červená pre negatívne `percentChange` (pokles)
  - Intenzita farby podľa veľkosti zmeny (čím väčšia zmena, tým tmavšia farba)
  - Šedá pre `percentChange = 0`

### 2. Layout

- Použiť **treemap algoritmus** (squarified alebo row-based)
- Sektory zobrazené ako oblasti, každá obsahuje bloky pre akcie v tom sektore
- Sektory zoradené podľa `totalMarketCap` (najväčšie hore)
- Akcie v rámci sektora zoradené podľa `marketCap` (najväčšie vľavo/hore)

### 3. Interaktivita

- **Hover tooltip** zobrazujúci:
  - Ticker symbol
  - Názov spoločnosti
  - Sektor a odvetvie
  - Aktuálna cena
  - Percentuálna zmena (s + alebo -)
  - Market Cap
- **Kliknutie** na blok (voliteľné - môže otvoriť detail)

### 4. UI Elementy

- **Header** s:
  - Názvom "Market Heatmap"
  - Celkovým počtom akcií (`stockCount`)
  - Celkovým Market Cap (`totalMarketCap` B)
  - Session selector (pre/live/after)
- **Legenda** vysvetľujúca farby:
  - Zelená = pozitívna zmena
  - Červená = negatívna zmena
  - Šedá = bez zmeny
  - Veľkosť = Market Cap
- **Loading state** počas načítavania dát
- **Error state** pri chybe API

### 5. Design

- **Moderný, minimalistický dizajn**
- **Dark theme** (pozadie: #1a1a1a, text: #ffffff)
- **Responsive** - funguje na desktop aj mobile
- **Smooth animations** pri hover
- **Clean typography** - čitateľné ticker symboly a percentá

### 6. Technické požiadavky

- **React komponent** s TypeScript
- **Fetch API** pre načítanie dát z `/api/heatmap/treemap?session={session}`
- **SVG alebo Canvas** pre renderovanie treemap
- **useState, useEffect** pre state management
- **Auto-refresh** každých 60 sekúnd pre live session

## Príklad použitia

```tsx
<HeatmapTreemap 
  session="live" 
  width={1200} 
  height={800} 
/>
```

## Farba podľa percentChange

```typescript
function getColor(percentChange: number): string {
  if (percentChange > 0) {
    // Zelená - intenzita 0-100% podľa percentChange (max 10% = 100% intenzita)
    const intensity = Math.min(percentChange / 10, 1);
    const green = Math.round(100 + intensity * 155); // 100-255
    return `rgb(0, ${green}, 0)`;
  } else if (percentChange < 0) {
    // Červená - intenzita podľa abs(percentChange)
    const intensity = Math.min(Math.abs(percentChange) / 10, 1);
    const red = Math.round(100 + intensity * 155); // 100-255
    return `rgb(${red}, 0, 0)`;
  } else {
    // Šedá pre no change
    return 'rgb(128, 128, 128)';
  }
}
```

## Treemap Algoritmus

Použiť jednoduchý row-based layout:
1. Vypočítať celkovú hodnotu (sum všetkých marketCap)
2. Pre každý sektor vypočítať jeho podiel na celkovej hodnote
3. Rozložiť sektory vertikálne (každý sektor = riadok)
4. V rámci každého sektora rozložiť akcie horizontálne podľa ich marketCap

## Štruktúra komponentu

```tsx
interface HeatmapStock {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number;
  percentChange: number;
  currentPrice: number;
}

interface SectorGroup {
  sector: string;
  totalMarketCap: number;
  stocks: HeatmapStock[];
}

interface HeatmapData {
  sectors: SectorGroup[];
  totalMarketCap: number;
  stockCount: number;
  date: string;
  session: string;
}
```

## Dizajn inšpirácia

Podobné ako Finviz heatmap alebo TradingView sector heatmap:
- Sektory sú jasne oddelené
- Bloky sú čitateľné s ticker symbolmi
- Farba je jasná a kontrastná
- Tooltip poskytuje detailné informácie

## Poznámky

- Backend API vracia dáta už zoskupené podľa sektora
- Market Cap je v miliardách USD
- percentChange je v percentách (napr. 2.45 = +2.45%)
- Ak API vráti prázdny array sektorov, zobraziť "No data available"


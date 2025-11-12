# Prompt pre v0.app

Vytvor React komponent pre stock market heatmap treemap vizualizáciu.

## API Endpoint
```
GET /api/heatmap/treemap?session=live
```

**Response:**
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
            "currentPrice": 175.50
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

## Požiadavky

1. **Treemap vizualizácia:**
   - Akcie zoskupené podľa `sector`
   - Veľkosť bloku = `marketCap` (väčší market cap = väčší blok)
   - Farba = `percentChange`:
     - Zelená pre pozitívne (intenzita podľa veľkosti)
     - Červená pre negatívne (intenzita podľa veľkosti)
     - Šedá pre 0%

2. **Layout:**
   - Sektory vertikálne (každý sektor = riadok)
   - Akcie v sektore horizontálne podľa marketCap
   - Sektory zoradené podľa totalMarketCap (najväčšie hore)

3. **Interaktivita:**
   - Hover tooltip: ticker, name, sector, price, percentChange, marketCap
   - Smooth hover animations

4. **UI:**
   - Header: "Market Heatmap", stockCount, totalMarketCap
   - Session selector (pre/live/after)
   - Legenda (zelená/červená/šedá)
   - Loading & error states

5. **Design:**
   - Dark theme (#1a1a1a background, #ffffff text)
   - Modern, minimalist
   - Responsive
   - SVG rendering

6. **Technické:**
   - React + TypeScript
   - Fetch API z `/api/heatmap/treemap?session={session}`
   - useState, useEffect
   - Auto-refresh každých 60s pre live session

## Farba funkcia
```typescript
function getColor(percentChange: number): string {
  if (percentChange > 0) {
    const intensity = Math.min(percentChange / 10, 1);
    const green = Math.round(100 + intensity * 155);
    return `rgb(0, ${green}, 0)`;
  } else if (percentChange < 0) {
    const intensity = Math.min(Math.abs(percentChange) / 10, 1);
    const red = Math.round(100 + intensity * 155);
    return `rgb(${red}, 0, 0)`;
  }
  return 'rgb(128, 128, 128)';
}
```

## Príklad
```tsx
<HeatmapTreemap session="live" width={1200} height={800} />
```

Dizajn podobný Finviz heatmap - sektory jasne oddelené, čitateľné ticker symboly, kontrastné farby.


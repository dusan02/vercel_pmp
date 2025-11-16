# Heatmap Data Structure - Pre Finviz-style Layout

## 📊 Štruktúra dát z API

### Endpoint
```
GET /api/heatmap/treemap
```

### Response Format

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
    "date": "2025-11-13"
  }
}
```

## 🔍 Potrebné údaje pre každú firmu

```typescript
interface StockData {
  ticker: string;           // "AAPL"
  marketCap: number;        // 3500.2 (v miliardách)
  sector: string;           // "Technology"
  industry: string;         // "Consumer Electronics"
  changePercent: number;    // 2.45 (percentuálna zmena)
}
```

## 📋 Unikátne sektory (12)

1. Basic Materials
2. Communication Services
3. Consumer Cyclical
4. Consumer Defensive
5. Energy
6. Financial Services
7. Healthcare
8. Industrials
9. Other
10. Real Estate
11. Technology
12. Utilities

## 🏭 Industries podľa sektorov

### Technology (7 industries)
- Communication Equipment
- Consumer Electronics
- Internet Content & Information
- Semiconductor Equipment
- Semiconductors
- Software
- Software—Application

### Financial Services (6 industries)
- Asset Management
- Banks
- Capital Markets
- Credit Services
- Insurance
- Insurance—Diversified

### Consumer Cyclical (9 industries)
- Apparel Retail
- Auto Manufacturers
- Discount Stores
- Footwear & Accessories
- Home Improvement Retail
- Internet Retail
- Lodging
- Restaurants
- Travel Services

### Healthcare (5 industries)
- Biotechnology
- Diagnostics & Research
- Drug Manufacturers
- Healthcare Plans
- Medical Devices

### Industrials (6 industries)
- Aerospace & Defense
- Electrical Equipment & Parts
- Farm & Heavy Construction Machinery
- Integrated Freight & Logistics
- Railroads
- Specialty Industrial Machinery

### Consumer Defensive (6 industries)
- Beverages - Alcoholic
- Beverages—Non-Alcoholic
- Discount Stores
- Household & Personal Products
- Packaged Foods
- Tobacco

### Energy (3 industries)
- Oil & Gas E&P
- Oil & Gas Equipment & Services
- Oil & Gas Integrated

### Real Estate (3 industries)
- REIT - Specialty
- REIT—Industrial
- REIT—Specialty

### Other (1 industry)
- Uncategorized

### Communication Services (2 industries)
- Entertainment
- Telecom Services

### Basic Materials (4 industries)
- Chemicals
- Copper
- Other Industrial Metals & Mining
- Specialty Chemicals

### Utilities (3 industries)
- Utilities - Regulated Electric
- Utilities—Regulated Electric
- Utilities—Renewable

## 📦 Ukážka dát (10 spoločností)

Pozri `HEATMAP_DATA_SAMPLE.json` pre kompletnú ukážku s reálnymi dátami.

## 🎯 Pre Finviz-style layout potrebuješ:

1. **Zoskupiť podľa sektora** → každý sektor = jeden kontajner
2. **V rámci sektora zoskupiť podľa industry** → každý industry = jeden blok
3. **V rámci industry zoradiť podľa marketCap** → najväčšie hore/vľavo
4. **Použiť squarify() pre každý industry blok** → optimálne pomery strán
5. **Packovať industry bloky v sektore** → ako "mini-mapky" vedľa seba


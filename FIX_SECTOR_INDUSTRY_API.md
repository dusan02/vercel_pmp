# API Endpoint pre opravu Sector/Industry

## Nový univerzálny endpoint: `/api/fix-sector-industry`

Tento endpoint umožňuje opraviť sector a industry pre akýkoľvek ticker na produkcii.

### Použitie

#### 1. Oprava jedného tickera (GET)

```bash
curl "https://premarketprice.com/api/fix-sector-industry?ticker=AAPL&sector=Technology&industry=Consumer%20Electronics"
```

#### 2. Oprava jedného tickera (POST)

```bash
curl -X POST https://premarketprice.com/api/fix-sector-industry \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "sector": "Technology",
    "industry": "Consumer Electronics"
  }'
```

#### 3. Hromadná oprava viacerých tickerov (POST)

```bash
curl -X POST https://premarketprice.com/api/fix-sector-industry \
  -H "Content-Type: application/json" \
  -d '{
    "fixes": [
      {
        "ticker": "AAPL",
        "sector": "Technology",
        "industry": "Consumer Electronics"
      },
      {
        "ticker": "MSFT",
        "sector": "Technology",
        "industry": "Software"
      }
    ]
  }'
```

### Príklady použitia

#### Oprava konkrétneho tickera

```bash
# Opraviť NU
curl "https://premarketprice.com/api/fix-sector-industry?ticker=NU&sector=Financial%20Services&industry=Credit%20Services"

# Opraviť ING
curl "https://premarketprice.com/api/fix-sector-industry?ticker=ING&sector=Financial%20Services&industry=Banks"
```

#### Hromadná oprava pomocou JSON súboru

Vytvorte súbor `fixes.json`:
```json
{
  "fixes": [
    {
      "ticker": "NU",
      "sector": "Financial Services",
      "industry": "Credit Services"
    },
    {
      "ticker": "ING",
      "sector": "Financial Services",
      "industry": "Banks"
    },
    {
      "ticker": "B",
      "sector": "Industrials",
      "industry": "Specialty Industrial Machinery"
    }
  ]
}
```

Potom spustite:
```bash
curl -X POST https://premarketprice.com/api/fix-sector-industry \
  -H "Content-Type: application/json" \
  -d @fixes.json
```

### Response formát

**Úspešná odpoveď:**
```json
{
  "ticker": "AAPL",
  "success": true,
  "before": {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "sector": "Other",
    "industry": "NULL"
  },
  "after": {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "sector": "Technology",
    "industry": "Consumer Electronics"
  }
}
```

**Chyba:**
```json
{
  "ticker": "INVALID",
  "success": false,
  "error": "Ticker not found in database"
}
```

### Existujúce skripty

#### 1. `/api/fix-other-sectors` (GET)
Opraví preddefinované tickery: NU, ING, B, SE, NGG, LNG, HEI, E, HLN

```bash
curl https://premarketprice.com/api/fix-other-sectors
```

#### 2. Skript: `scripts/fix-all-sector-industry.ts`
Komplexný skript, ktorý kontroluje všetky tickery a opravuje ich pomocou Polygon API.

```bash
cd /var/www/premarketprice/pmp_prod
npx tsx scripts/fix-all-sector-industry.ts
```

#### 3. Skript: `scripts/fix-other-sector-tickers.ts`
Opraví konkrétne tickery (NU, ING, B, SE, NGG, LNG, HEI, E, HLN).

```bash
cd /var/www/premarketprice/pmp_prod
npx tsx scripts/fix-other-sector-tickers.ts
```

### Validné sektory

- Basic Materials
- Communication Services
- Consumer Cyclical
- Consumer Defensive
- Energy
- Financial Services
- Healthcare
- Industrials
- Other
- Real Estate
- Technology
- Utilities

### Poznámky

- Ticker symbol sa automaticky konvertuje na uppercase
- Industry sa automaticky normalizuje podľa sector
- Endpoint automaticky aktualizuje `updatedAt` timestamp
- Pre hromadné opravy sa používa POST s `fixes` array

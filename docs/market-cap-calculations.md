# Market Cap a Percent Change Výpočty

Tento dokument popisuje, ako sa vypočítavajú market cap hodnoty a percentuálne zmeny v aplikácii.

## 📊 Market Cap Výpočty

### 1. Základný vzorec
```
Market Cap (B) = (Cena × Počet akcií) ÷ 1,000,000,000
```

### 2. Metódy výpočtu

#### Metóda A (preferovaná) - Výpočet z aktuálnych dát
```typescript
marketCap = computeMarketCap(currentPrice, sharesOutstanding)
marketCapDiff = computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding)
```

**Kde:**
- `currentPrice` - Aktuálna cena akcie
- `referencePrice` - Referenčná cena (previousClose alebo regularClose)
- `sharesOutstanding` - Počet akcií v obehu

#### Metóda B (fallback) - Použitie denormalizovaných dát
```typescript
marketCap = tickerInfo.lastMarketCap
marketCapDiff = tickerInfo.lastMarketCapDiff
```

### 3. Priority dátových zdrojov

1. **Cache** (najrýchlejší) - Ak sú čerstvé dáta v Redis cache
2. **SessionPrice** - Ak sú novšie ako Ticker.lastPriceUpdated
3. **Ticker** - Fallback na denormalizované dáta z databázy

## 📈 Percent Change Výpočty

### 1. Session-aware výpočet
```typescript
percentChange = computePercentChange(currentPrice, previousClose, session, regularClose)
```

### 2. Logika podľa session

#### Pre-market (pred otvorením trhu)
```
% Change = (Current Price - Previous Close) ÷ Previous Close × 100
```

#### Live (počas obchodovania)
```
% Change = (Current Price - Previous Close) ÷ Previous Close × 100
```

#### After-hours (po zatvorení trhu)
```
% Change = (Current Price - Regular Close) ÷ Regular Close × 100
```

#### Closed (víkend/sviatok)
```
% Change = (Current Price - Last Trading Day Close) ÷ Last Trading Day Close × 100
```

### 3. Referenčné ceny

#### Previous Close (D-1)
- Zatváracia cena z predchádzajšieho dňa
- Používa sa pre pre-market a live session

#### Regular Close (D)
- Zatváracia cena z aktuálneho dňa
- Používa sa pre after-hours a closed session

## 🔍 Validácia a Filtrovanie

### 1. Market Cap Validácia
```typescript
validateMarketCap(marketCap, ticker): boolean
```

**Kritériá:**
- ✅ Market cap > 0 (filteruje nulové hodnoty)
- ✅ Market cap < $10 trillion (filteruje extrémne hodnoty)
- ❌ Logovanie a filtrovanie neplatných dát

### 2. Percent Change Validácia
```typescript
validatePercentChange(percentChange, ticker): boolean
```

**Kritériá:**
- ✅ |Percent Change| ≤ 100% (filteruje extrémne zmeny)
- ❌ Logovanie varovaní o možných stock splits
- ❌ Filtrovanie zavádzajúcich dát

### 3. Price Validácia
```typescript
validatePriceChange(currentPrice, prevClose): void
```

**Kritériá:**
- ✅ Cena > 0.01 (filteruje podozrivo nízke ceny)
- ⚠️ Varovanie pri |% Change| > 40% (možný split)

## 📋 Príklady Výpočtov

### Príklad 1: Normálny ticker
```
Ticker: AAPL
Current Price: $175.50
Previous Close: $172.00
Shares Outstanding: 15,600,000,000

Market Cap = ($175.50 × 15.6B) ÷ 1B = $2,737.8B
% Change = ($175.50 - $172.00) ÷ $172.00 × 100 = +2.03%
Market Cap Diff = ($175.50 - $172.00) × 15.6B ÷ 1B = +54.6B
```

### Príklad 2: After-hours
```
Ticker: MSFT
Current Price: $382.50 (after-hours)
Regular Close: $381.87 (dnešný close)
Previous Close: $380.20 (včerajší close)

% Change = ($382.50 - $381.87) ÷ $381.87 × 100 = +0.16%
Market Cap Diff = ($382.50 - $381.87) × 7.4B ÷ 1B = +4.6B
```

## 🚨 Problémové Scenáre

### 1. Chýbajúce Previous Close
**Problém:** `previousClose = 0`
**Riešenie:** On-demand fetch z Polygon API
**Fallback:** Preskočiť ticker (neukazovať zavádzajúce 0%)

### 2. Extrémne Percent Changes
**Problém:** `|% Change| > 100%`
**Príčiny:** Stock split, data error, chýbajúce previous close
**Riešenie:** Filtrovanie z heatmapy

### 3. Nulový Market Cap
**Problém:** `marketCap = 0`
**Príčiny:** Chýbajúce shares, chybné dáta
**Riešenie:** Filtrovanie z heatmapy

## 📊 Dátové Toky

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Polygon     │───▶│   SessionPrice  │───▶│   Ticker DB    │
│   API         │    │   (ceny)       │    │   (denorm)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Heatmap API                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Cache     │  │   Session   │  │   Ticker    │ │
│  │   Hit       │  │   Path      │  │   Path      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Heatmap UI   │
                    │   (zobrazenie)  │
                    └─────────────────┘
```

## 🔧 Debug Nástroje

### 1. Logovanie
```typescript
logCalculationData(ticker, currentPrice, prevClose, shares, marketCap, marketCapDiff, percentChange)
```

### 2. Cache Status
```typescript
getCacheStatus() // Vráti info o cache hit/miss ratio
```

### 3. Validácia
```typescript
validatePriceChange() // Varovania o extrémnych zmenách
validateMarketCap() // Filtrovanie neplatných market cap
validatePercentChange() // Filtrovanie extrémnych % changes
```

## 📝 Poznámky

- Všetky výpočty používajú `Decimal.js` pre presnosť
- Market cap je v miliardách USD (B)
- Percent changes sú zaokrúhlené na 2 desatinné miesta
- Validácia filtruje problematické dáta pred zobrazením
- Cache má 24-hodinový TTL pre optimálnu výkon

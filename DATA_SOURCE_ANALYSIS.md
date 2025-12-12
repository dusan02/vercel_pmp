# Analýza Zdrojov Dát pre Tabuľky a Heatmapu

## 📊 Prehľad

### Tabuľky (All Stocks Section)
- **API Endpoint:** `/api/stocks?getAll=true`
- **Service:** `getStocksList()` z `stockService.ts`
- **Zdroj dát:** SQLite databáza (Prisma)
- **Query:** 
  - `Ticker.findMany()` - všetky tickery
  - `SessionPrice.findMany()` - posledné ceny
  - `DailyRef.findMany()` - previous closes
- **Cache:** Redis (ak je nakonfigurovaný)
- **Limit:** 10000 tickerov (default)

### Heatmapa
- **API Endpoint:** `/api/heatmap`
- **Service:** Priamy DB query v `route.ts`
- **Zdroj dát:** SQLite databáza (Prisma)
- **Query:**
  - `Ticker.findMany()` - len tickery s `sector` a `industry`
  - `SessionPrice.findMany()` - posledné ceny (7 dní)
  - `DailyRef.findMany()` - previous closes (7 dní)
- **Cache:** Redis (30s TTL)
- **Limit:** 3000 tickerov (MAX_TICKERS)

## 🔍 Rozdiely

### 1. **Filtrovanie Tickerov**
- **Tabuľky:** Všetky tickery z databázy
- **Heatmapa:** Len tickery s `sector IS NOT NULL AND industry IS NOT NULL`

### 2. **Časové Okno**
- **Tabuľky:** Používa najnovšie dáta (bez časového obmedzenia)
- **Heatmapa:** Používa dáta z posledných 7 dní (`DATE_RANGE.DAYS_BACK = 7`)

### 3. **Limit**
- **Tabuľky:** 10000 tickerov
- **Heatmapa:** 3000 tickerov

### 4. **Cache Strategy**
- **Tabuľky:** Redis cache (ak je nakonfigurovaný), ale menej agresívny
- **Heatmapa:** Redis cache s 30s TTL + ETag support

### 5. **Data Processing**
- **Tabuľky:** Používa `getStocksList()` - štandardizovaný service
- **Heatmapa:** Custom query priamo v route - optimalizovaný pre heatmap

## ⚠️ Potenciálne Problémy

### 1. **Nekonzistentné Dáta**
Ak sa dáta aktualizujú v rôznych časoch:
- Tabuľky môžu zobrazovať novšie dáta ako heatmapa
- Heatmapa môže zobrazovať staršie dáta kvôli 7-dňovému oknu

### 2. **Rôzne Filtrovanie**
- Heatmapa zobrazuje len tickery s sector/industry
- Tabuľky zobrazujú všetky tickery
- Môže to spôsobiť, že niektoré tickery sú v tabuľkách, ale nie v heatmape

### 3. **Rôzne Cache TTL**
- Heatmapa má 30s cache
- Tabuľky môžu mať dlhší cache
- Môže to spôsobiť, že dáta nie sú synchronizované

## ✅ Odporúčania

### 1. **Zjednotiť Zdroj Dát**
- Použiť rovnaký service (`getStocksList()`) pre oba
- Alebo vytvoriť špecializovaný service pre heatmapu

### 2. **Zjednotiť Cache Strategy**
- Rovnaký TTL pre oba endpointy
- Rovnaký cache key pattern

### 3. **Zjednotiť Filtrovanie**
- Ak heatmapa potrebuje len tickery s sector/industry, aplikovať rovnaký filter aj v tabuľkách
- Alebo zobraziť všetky tickery v oboch

### 4. **Zjednotiť Časové Okno**
- Použiť rovnaké časové okno pre oba endpointy
- Alebo explicitne dokumentovať rozdiely

## 🔧 Možné Riešenia

### Riešenie 1: Zjednotiť cez Service
```typescript
// V stockService.ts
export async function getStocksListForHeatmap(options: {
  limit?: number;
  requireSectorIndustry?: boolean;
}) {
  // Rovnaká logika ako getStocksList, ale s filtrom pre sector/industry
}
```

### Riešenie 2: Heatmapa používa getStocksList
```typescript
// V /api/heatmap/route.ts
const { getStocksList } = await import('@/lib/server/stockService');
const { data } = await getStocksList({
  limit: 3000,
  // Filter pre sector/industry v service
});
```

### Riešenie 3: Zdieľaný Cache Key
```typescript
// Rovnaký cache key pre oba endpointy
const CACHE_KEY = 'stocks:all';
// Rovnaký TTL
const CACHE_TTL = 30;
```

## 📝 Zhrnutie

**Odpoveď:** NIE, tabuľky a heatmapa nepoužívajú úplne rovnaký zdroj dát:
- Oba používajú SQLite databázu
- Oba používajú SessionPrice a DailyRef
- ALE majú rôzne filtre, limity a cache stratégie

**Dôsledok:** Dáta môžu byť nekonzistentné medzi tabuľkami a heatmapou.

**Riešenie:** Zjednotiť zdroj dát cez spoločný service alebo explicitne dokumentovať rozdiely.


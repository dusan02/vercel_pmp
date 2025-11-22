# Analýza: Prečo heatmapa zobrazuje staršie dáta ako All stocks

## 🔍 Zistenia

### 1. Dátové zdroje

**All stocks (`/`):**
- **Endpoint:** `/api/stocks?tickers=...&t=${Date.now()}`
- **Zdroj dát:** Polygon API (priamo) + Redis cache
- **Cache TTL:** 120 sekúnd (2 minúty)
- **Cache key:** `stock:${project}:${ticker}`
- **Fetch strategy:** `cache: 'no-store'` + timestamp v URL
- **Aktualizácia:** Okamžitá (ak cache miss, volá Polygon API)

**Heatmap (`/heatmap`):**
- **Endpoint:** `/api/heatmap`
- **Zdroj dát:** DB (SessionPrice, DailyRef, Ticker) + Redis cache
- **Cache TTL:** 30 sekúnd
- **Cache key:** `heatmap:all-companies`
- **Fetch strategy:** `cache: 'no-store'` + ETag (304 Not Modified)
- **Aktualizácia:** Závisí od workeru (každých 60s, ale batch processing)

### 2. Worker aktualizácia SessionPrice

**Worker (`polygonWorker.ts`):**
- **Frekvencia:** Každých 60 sekúnd (`setInterval(ingestLoop, 60000)`)
- **Batch size:** 70 tickerov
- **Delay medzi batchmi:** 60 sekúnd
- **Pre 3000 tickerov:** 
  - Počet batchov: 3000 / 70 = ~43 batchov
  - Celkový čas: 43 × 60s = **~43 minút na celý cyklus**

**Problém:**
- Worker aktualizuje SessionPrice postupne (batch po batch)
- Posledný ticker v batchi môže mať dáta staršie až 43 minút
- Heatmap číta z SessionPrice, ktoré môže byť staršie ako Polygon API cache

### 3. Cache porovnanie

| Aspekt | All stocks (`/api/stocks`) | Heatmap (`/api/heatmap`) |
|--------|---------------------------|--------------------------|
| **Zdroj dát** | Polygon API (priamo) | DB (SessionPrice) |
| **Cache TTL** | 120s | 30s |
| **ETag** | ❌ Nie | ✅ Áno |
| **304 Not Modified** | ❌ Nie | ✅ Áno |
| **Aktualizácia** | Okamžitá (ak cache miss) | Závisí od workeru (60s + batch delay) |
| **Max stálosť dát** | 2 minúty | 43+ minút (v najhoršom prípade) |

### 4. Problém s ETag

**ETag v heatmape:**
- Generuje sa z cache verzie (`heatmap:version`)
- Verzia sa incrementuje len pri zmene dát v DB
- **Problém:** Ak worker ešte neaktualizoval SessionPrice, ETag zostáva rovnaký
- FE dostane 304 Not Modified aj keď sú dáta staršie

## 🎯 Riešenia

### Riešenie 1: Znížiť batch delay v workeri (RÝCHLE)

**Zmena:**
```typescript
// V polygonWorker.ts, riadok 641
// Zmeniť z 60s na 10-15s
await new Promise(resolve => setTimeout(resolve, 10000)); // 10s namiesto 60s
```

**Výhody:**
- Celý cyklus 3000 tickerov: 43 × 10s = ~7 minút (namiesto 43 minút)
- Rýchlejšia aktualizácia SessionPrice
- Minimálne zmeny v kóde

**Nevýhody:**
- Môže zvýšiť rate limiting (ale Polygon API má limit 5 req/s, čo je 300 req/min)
- 70 tickerov × 1 req = 70 req/batch, 43 batchov = 3010 req/cyklus
- Pri 10s delay: 3010 req / 7 min = ~430 req/min (stále OK)

### Riešenie 2: Heatmap používa rovnaký endpoint ako All stocks (ODPORÚČANÉ)

**Zmena:**
```typescript
// V ResponsiveMarketHeatmap.tsx
// Namiesto /api/heatmap používať /api/stocks s optimizáciou
const url = new URL('/api/stocks', window.location.origin);
url.searchParams.set('tickers', allTickers.join(','));
url.searchParams.set('project', project);
url.searchParams.set('limit', '3000');
url.searchParams.set('t', Date.now().toString());
```

**Výhody:**
- Heatmap používa rovnaké aktuálne dáta ako All stocks
- Žiadne oneskorenie z workeru
- Jednotný dátový zdroj

**Nevýhody:**
- Môže byť pomalšie (3000 tickerov × 200ms delay = 10 minút)
- Potrebuje optimalizáciu (batch processing, paralelizácia)

### Riešenie 3: Hybridný prístup - SessionPrice + fallback na Polygon

**Zmena:**
```typescript
// V /api/heatmap/route.ts
// 1. Skús SessionPrice (rýchle)
// 2. Ak sú dáta staršie ako 5 minút, doplň z Polygon API
```

**Výhody:**
- Rýchle pre väčšinu tickerov (SessionPrice)
- Aktuálne pre staršie tickery (Polygon API)

**Nevýhody:**
- Komplexnejšia logika
- Môže byť pomalšie (mix DB + API)

### Riešenie 4: Znížiť cache TTL a zrušiť ETag pre heatmapu

**Zmena:**
```typescript
// V /api/heatmap/route.ts
const CACHE_TTL = 10; // 10 sekúnd namiesto 30
// Odstrániť ETag logiku alebo ju použiť len ak sú dáta < 1 min staré
```

**Výhody:**
- Jednoduchšie
- Častejšia aktualizácia

**Nevýhody:**
- Stále závisí od workeru
- Nevyrieši základný problém (staré SessionPrice dáta)

## 🚀 Odporúčané riešenie

**Kombinácia Riešenia 1 + Riešenie 4:**

1. **Znížiť batch delay v workeri na 10-15s** (z 60s)
   - Celý cyklus: ~7 minút namiesto 43 minút
   - Rýchlejšia aktualizácia SessionPrice

2. **Znížiť cache TTL pre heatmapu na 10s** (z 30s)
   - Častejšia kontrola aktualizácií

3. **Pridať timestamp check v ETag logike**
   - ETag sa incrementuje len ak sú SessionPrice dáta < 5 min staré
   - Ak sú staršie, vrátiť 200 (nie 304) aj keď ETag match

## 📊 Očakávané výsledky

**Pred:**
- Heatmap: dáta môžu byť staršie až 43+ minút
- All stocks: dáta max 2 minúty staré

**Po:**
- Heatmap: dáta max ~7-10 minút staré (v najhoršom prípade)
- All stocks: dáta max 2 minúty staré (bez zmeny)

**Ďalšie optimalizácie:**
- Worker môže prioritizovať top tickery (napr. top 500 podľa market cap)
- Top tickery sa aktualizujú každých 10s
- Ostatné tickery každých 60s


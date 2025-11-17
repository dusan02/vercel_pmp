# Analýza načítavania Heatmap dát

## Prehľad

Tento dokument analyzuje proces načítavania dát pre heatmapu (`/heatmap`), vrátane všetkých krokov, optimalizácií a potenciálnych problémov.

---

## 1. Architektúra načítavania

### 1.1 Komponenty zapojené do procesu

```
heatmap/page.tsx (Client Component)
  └─> ResponsiveMarketHeatmap.tsx (Client Component)
       ├─> fetchHeatmapData() - načítanie dát z API
       └─> MarketHeatmap.tsx - renderovanie treemap vizualizácie
```

### 1.2 API Endpoint Flow

```
Client Request: GET /api/heatmap
  │
  ├─> 1. Redis Cache Check (CACHE_KEY: 'heatmap:all-companies', TTL: 120s)
  │    ├─> Cache Hit: ✅ Return cached data
  │    └─> Cache Miss: ⬇️ Continue to step 2
  │
  ├─> 2. Database Query (Prisma)
  │    └─> SELECT symbol FROM ticker WHERE sector IS NOT NULL AND industry IS NOT NULL
  │        └─> Limit: 3000 tickers
  │
  ├─> 3. Internal API Call: GET /api/stocks
  │    ├─> Query params: tickers=<comma-separated-list>, project=pmp, limit=3000
  │    └─> Returns: StockData[] with currentPrice, percentChange, marketCap, etc.
  │
  ├─> 4. Data Filtering & Transformation
  │    ├─> Filter: sector && industry && marketCap > 0
  │    ├─> Filter: Remove 'GOOG' (keep only 'GOOGL')
  │    └─> Sort: By marketCap DESC
  │
  └─> 5. Cache & Return
      ├─> Save to Redis cache (TTL: 120s)
      └─> Return JSON response
```

---

## 2. Detailný proces načítavania

### 2.1 Client-Side (ResponsiveMarketHeatmap.tsx)

#### Počiatočné načítanie:
```typescript
// 1. Component mount
useState<CompanyNode[]>([]) // Prázdne dáta
useState(true) // loading = true

// 2. useEffect spustí loadData()
useEffect(() => {
  loadData(); // Prvé načítanie
  
  if (autoRefresh) {
    const interval = setInterval(loadData, refreshInterval); // 60000ms = 1 min
    return () => clearInterval(interval);
  }
}, [loadData, autoRefresh, refreshInterval]);
```

#### Funkcia loadData():
```typescript
const loadData = async () => {
  setLoading(true);
  setError(null);
  try {
    const companies = await fetchHeatmapData(apiEndpoint, timeframe);
    setData(companies);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

#### Loading States:
1. **Počiatočné načítanie** (`loading && data.length === 0`):
   - Zobrazí spinner + "Loading heatmap data..."
   
2. **Chyba** (`error && data.length === 0`):
   - Zobrazí error message + "Retry" button
   
3. **Žiadne dáta** (`data.length === 0`):
   - Zobrazí "No data available"

4. **Úspešné načítanie**:
   - Renderuje `MarketHeatmap` komponent s dátami

### 2.2 API Endpoint (/api/heatmap/route.ts)

#### Cache Strategy:
- **Cache Key**: `'heatmap:all-companies'`
- **TTL**: 120 sekúnd (2 minúty)
- **Dôvod**: Heatmap dáta sa menia často, ale nie každú sekundu

#### Data Flow:
1. **Cache Check**:
   ```typescript
   const cachedData = await getCachedData(CACHE_KEY);
   if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
     return NextResponse.json({ success: true, data: cachedData, cached: true });
   }
   ```

2. **Database Query**:
   ```typescript
   const tickers = await prisma.ticker.findMany({
     where: {
       sector: { not: null },
       industry: { not: null },
     },
     select: { symbol: true },
     take: 3000,
   });
   ```

3. **Internal API Call**:
   ```typescript
   const stocksUrl = new URL('/api/stocks', origin);
   stocksUrl.searchParams.set('tickers', tickerList); // Comma-separated
   stocksUrl.searchParams.set('project', 'pmp');
   stocksUrl.searchParams.set('limit', '3000');
   
   const stocksRes = await fetch(stocksUrl.toString(), {
     cache: 'no-store',
   });
   ```

4. **Data Filtering**:
   ```typescript
   const results = stocks
     .filter((s) => {
       if (s.ticker === 'GOOG') return false; // Remove GOOG
       return s.sector && s.industry && s.marketCap && s.marketCap > 0;
     })
     .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
   ```

5. **Cache & Return**:
   ```typescript
   await setCachedData(CACHE_KEY, results, CACHE_TTL);
   return NextResponse.json({ success: true, data: results, cached: false });
   ```

---

## 3. Transformácia dát

### 3.1 StockData → CompanyNode

```typescript
function transformStockDataToCompanyNode(stock: StockData): CompanyNode | null {
  if (!stock.ticker || !stock.sector || !stock.industry) {
    return null; // Skip invalid data
  }
  
  return {
    symbol: stock.ticker,
    name: stock.companyName || stock.ticker,
    sector: stock.sector,
    industry: stock.industry,
    marketCap: stock.marketCap || 0,
    changePercent: stock.percentChange || 0,
    marketCapDiff: stock.marketCapDiff,
    currentPrice: stock.currentPrice,
  };
}
```

### 3.2 Filtrovanie v fetchHeatmapData()

```typescript
const companies = stocks
  .map(transformStockDataToCompanyNode)
  .filter((node): node is CompanyNode => node !== null);
```

---

## 4. Optimalizácie

### 4.1 Redis Cache
- **TTL**: 120 sekúnd
- **Výhoda**: Rýchle odpovede pre opakované requesty
- **Nevýhoda**: Dáta môžu byť až 2 minúty staré

### 4.2 Batch Processing
- Všetky tickery sa načítajú v jednom requeste
- Limit: 3000 tickerov
- Interné volanie `/api/stocks` s batch parametrami

### 4.3 Auto-Refresh
- **Interval**: 60000ms (1 minúta)
- **Zapnuté**: `autoRefresh={true}` (default)
- **Výhoda**: Automatické aktualizovanie dát
- **Nevýhoda**: Môže spôsobiť zbytočné requesty

### 4.4 Data Filtering
- Filtrovanie na serveri pred odoslaním
- Odstránenie neplatných záznamov (bez sector/industry/marketCap)
- Odstránenie duplikátov (GOOG vs GOOGL)

---

## 5. Potenciálne problémy a riešenia

### 5.1 Problém: Pomalé načítavanie pri cache miss

**Príčina**:
- Database query pre 3000+ tickerov
- Interné volanie `/api/stocks` s veľkým batchom
- Polygon API rate limiting

**Riešenie**:
- ✅ Redis cache (120s TTL)
- ⚠️ Možné zlepšenie: Zvýšiť TTL na 5 minút (ak je to OK)
- ⚠️ Možné zlepšenie: Background job pre načítavanie dát

### 5.2 Problém: Veľký payload

**Príčina**:
- 3000+ firiem v jednom response
- Každá firma má ~10 polí

**Riešenie**:
- ✅ Filtrovanie na serveri (len potrebné polia)
- ⚠️ Možné zlepšenie: Kompresia response (gzip)
- ⚠️ Možné zlepšenie: Pagination (ale to by zmenilo UX)

### 5.3 Problém: Error handling

**Aktuálny stav**:
- ✅ Try-catch v `fetchHeatmapData()`
- ✅ Error state v `ResponsiveMarketHeatmap`
- ✅ Retry button pri chybe

**Možné zlepšenie**:
- ⚠️ Retry s exponential backoff
- ⚠️ Fallback na staršie dáta z cache

### 5.4 Problém: Memory usage

**Príčina**:
- 3000+ CompanyNode objektov v pamäti
- D3 treemap layout výpočty

**Riešenie**:
- ✅ Memoization v React (useMemo)
- ✅ D3 layout sa počíta len pri zmene dát/rozmerov
- ⚠️ Možné zlepšenie: Virtual scrolling (ale to by zmenilo treemap)

---

## 6. Performance metriky

### 6.1 Typické časy načítavania

| Scenár | Čas | Poznámka |
|--------|-----|----------|
| Cache Hit | ~50-100ms | Redis lookup |
| Cache Miss (prvý request) | ~2-5s | DB query + API call + processing |
| Cache Miss (následné) | ~1-3s | Len API call (cache už existuje) |
| Auto-refresh | ~50-100ms | Ak je cache valid |

### 6.2 Veľkosť dát

- **Typický payload**: ~500KB - 1MB (JSON)
- **Počet firiem**: ~600-800 (po filtrovaní)
- **Cache size**: ~500KB - 1MB v Redis

---

## 7. Odporúčania pre optimalizáciu

### 7.1 Krátkodobé (Easy wins)

1. **Zvýšiť cache TTL** (ak je to OK):
   ```typescript
   const CACHE_TTL = 300; // 5 minút namiesto 2
   ```

2. **Pridať response compression**:
   ```typescript
   // V next.config.ts
   compress: true
   ```

3. **Pridať loading skeleton**:
   - Namiesto jednoduchého spinnera
   - Zobraziť štruktúru heatmapy už počas načítavania

### 7.2 Strednodobé (Medium effort)

1. **Background job pre načítavanie dát**:
   - Cron job každú minútu
   - Uloží dáta do cache
   - Client dostane okamžite cache

2. **Incremental updates**:
   - WebSocket pre real-time updates
   - Aktualizovať len zmenené firmy

3. **Progressive loading**:
   - Najprv top 100 firiem
   - Potom načítať zvyšok

### 7.3 Dlhodobé (Complex)

1. **Server-Side Rendering (SSR)**:
   - Pre-renderovať heatmapu na serveri
   - Rýchlejšie First Contentful Paint

2. **Edge Caching**:
   - CDN cache pre `/api/heatmap`
   - Ešte rýchlejšie odpovede

3. **Data Streaming**:
   - Streamovať dáta počas načítavania
   - Zobraziť heatmapu postupne

---

## 8. Debugging a monitoring

### 8.1 Console Logs

Aktuálne logy:
- `✅ Heatmap cache hit - returning X companies`
- `🔄 Heatmap cache miss - fetching from /api/stocks...`
- `✅ Heatmap data fetched from /api/stocks and cached: X companies`
- `📊 Heatmap API: Prijatých X firiem z API, po transformácii Y firiem`
- `📊 Heatmap: Načítaných X firiem`

### 8.2 Odporúčané metriky

1. **API Response Time**:
   - Cache hit time
   - Cache miss time
   - Total time

2. **Data Quality**:
   - Počet firiem pred/po filtrovaní
   - Počet chýbajúcich polí (sector/industry)

3. **Client Performance**:
   - Time to first render
   - Time to interactive
   - Memory usage

---

## 9. Záver

Aktuálna implementácia je **dobre optimalizovaná** s:
- ✅ Redis cache (120s TTL)
- ✅ Batch processing
- ✅ Server-side filtering
- ✅ Error handling
- ✅ Auto-refresh

**Hlavné body na zlepšenie**:
1. Zvýšiť cache TTL (ak je to OK)
2. Pridať response compression
3. Background job pre načítavanie dát
4. Progressive loading pre veľké datasety

**Odhadovaný čas načítavania**:
- Cache hit: **~50-100ms** ✅
- Cache miss: **~2-5s** ⚠️ (možné zlepšenie)

---

## 10. Súbory zapojené do procesu

1. **`src/app/heatmap/page.tsx`**
   - Client component pre heatmap stránku
   - Renderuje `ResponsiveMarketHeatmap`

2. **`src/components/ResponsiveMarketHeatmap.tsx`**
   - Wrapper komponent
   - Načítava dáta z API
   - Spravuje loading/error states
   - Auto-refresh logika

3. **`src/components/MarketHeatmap.tsx`**
   - Hlavný komponent pre treemap vizualizáciu
   - D3.js treemap rendering
   - Interaktívne funkcie (hover, click)

4. **`src/app/api/heatmap/route.ts`**
   - API endpoint pre heatmap dáta
   - Redis cache management
   - Interné volanie `/api/stocks`
   - Data filtering & transformation

5. **`src/lib/redis.ts`**
   - Redis client wrapper
   - `getCachedData()`, `setCachedData()`

6. **`src/lib/types.ts`**
   - TypeScript types (`StockData`, `CompanyNode`)

---

*Analýza vytvorená: 2024*
*Posledná aktualizácia: Po implementácii refaktoringu veľkosti písma*


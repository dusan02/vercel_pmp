# Prehľad cachovacích mechanizmov v aplikácii

## 📋 Zhrnutie

Aplikácia používa **viacero úrovní cachovania** na rôznych miestach. Niektoré môžu spôsobovať problémy so starými dátami.

---

## 🔴 1. **localStorage (Frontend - Browser)**

### Čo sa ukladá:
- ✅ **User Preferences** (`pmp-user-preferences`)
  - Favorites (obľúbené tickery)
  - Section visibility (Portfolio, Favorites, Earnings, All Stocks, Heatmap)
  - Theme, auto-refresh settings
  - **TTL:** Trvalé (až do vymazania)
  
- ✅ **Portfolio Holdings** (`pmp_portfolio_holdings`)
  - Množstvo akcií pre každý ticker
  - **TTL:** Trvalé (až do vymazania)

- ✅ **Cookie Consent** (`pmp-cookie-consent`)
  - Súhlas s cookies
  - **TTL:** Trvalé

- ✅ **Heatmap Cache** (`heatmap-cache`) - **NOVÉ (práve pridané)**
  - Dáta heatmapy (CompanyNode[])
  - Timestamp, ETag
  - **TTL:** 5 minút (automaticky expiruje)
  - **Kde:** `src/hooks/useHeatmapData.ts`

### Potenciálne problémy:
- ⚠️ **Staré dáta v localStorage** môžu zostať aj po zmene dát na serveri
- ⚠️ **Heatmap cache** môže byť starý (max 5 min), ale automaticky sa obnoví
- ⚠️ **Portfolio/Favorites** - ak sa zmení ticker symbol alebo názov, localStorage môže obsahovať staré hodnoty

### Ako vymazať:
```javascript
// V DevTools Console:
localStorage.clear(); // Vymaže všetko
// Alebo konkrétne:
localStorage.removeItem('pmp-user-preferences');
localStorage.removeItem('pmp_portfolio_holdings');
localStorage.removeItem('heatmap-cache');
```

---

## 🟡 2. **Redis Cache (Backend)**

### Čo sa ukladá:
- ✅ **Stock Data** (`stock:{project}:{ticker}`)
  - Dáta pre jednotlivé tickery
  - **TTL:** 120 sekúnd (2 minúty)
  - **Kde:** `src/app/api/stocks/route.ts`

- ✅ **Heatmap Data** (`heatmap-data`)
  - Kompletné dáta heatmapy
  - **TTL:** 30 sekúnd
  - **Kde:** `src/app/api/heatmap/route.ts`

- ✅ **Heatmap Version** (`heatmap:version`)
  - Verzia pre ETag
  - **TTL:** 10 sekúnd
  - **Kde:** `src/app/api/heatmap/route.ts`

- ✅ **Logo Images** (`logo:img:{symbol}:{size}`)
  - Binárne dáta loga
  - **TTL:** 7 dní
  - **Kde:** `src/app/api/logo/[symbol]/route.ts`

- ✅ **Logo URLs** (`logo:url:{symbol}`)
  - URL loga
  - **TTL:** 7 dní
  - **Kde:** `src/app/api/logo/[symbol]/route.ts`

- ✅ **Last Prices** (`last:{session}:{ticker}`)
  - Posledné ceny pre session (pre/live/after)
  - **TTL:** 300s (live) / 3600s (pre/after)
  - **Kde:** `src/lib/redis/operations.ts`

### Potenciálne problémy:
- ⚠️ **Redis cache môže byť starý** - ak worker neaktualizuje dáta, cache môže obsahovať staré hodnoty
- ⚠️ **TTL je krátky** (30-120s), ale ak worker nebeží, cache sa neobnoví
- ⚠️ **In-memory fallback** - ak Redis nie je dostupný, používa sa in-memory cache (stráca sa pri reštarte)

### Ako vymazať:
```bash
# V termináli alebo cez API:
curl http://localhost:3000/api/admin/cache/invalidate
# Alebo konkrétne kľúče:
curl http://localhost:3000/api/admin/cache/keys
```

---

## 🟢 3. **Browser HTTP Cache**

### Čo sa ukladá:
- ✅ **API Responses** (ak majú Cache-Control headers)
  - Heatmap: `Cache-Control: public, max-age=10, stale-while-revalidate=30`
  - **TTL:** 10 sekúnd (max-age), 30 sekúnd (stale-while-revalidate)
  
- ✅ **Static Assets** (Next.js)
  - Obrázky, CSS, JS súbory
  - **TTL:** Podľa Next.js nastavenia

- ✅ **Logo Images** (ak majú ETag)
  - **TTL:** Podľa ETag a Cache-Control

### Potenciálne problémy:
- ⚠️ **Browser cache môže držať staré dáta** aj po zmene na serveri
- ⚠️ **ETag 304 Not Modified** - browser môže vrátiť staré dáta, ak ETag sedí

### Ako vymazať:
- **Hard Refresh:** `Ctrl + Shift + R` (Windows) / `Cmd + Shift + R` (Mac)
- **DevTools:** Network tab → "Disable cache"
- **Programaticky:** `cache: 'no-store'` v fetch (už používané)

---

## 🔵 4. **Next.js Cache**

### Čo sa ukladá:
- ✅ **Server Components** (SSR)
  - Pre-rendered HTML
  - **TTL:** Podľa `revalidate` nastavenia
  
- ✅ **API Routes** (ak majú cache)
  - **TTL:** Podľa nastavenia

- ✅ **Static Files** (`.next` directory)
  - Kompilované komponenty
  - **TTL:** Až do reštartu servera

### Potenciálne problémy:
- ⚠️ **`.next` cache** môže obsahovať staré kompilované súbory
- ⚠️ **SSR cache** môže vrátiť staré dáta, ak `revalidate` je príliš dlhý

### Ako vymazať:
```bash
# Vymazať .next directory:
rm -rf .next
# Alebo:
npm run build  # Rebuild
```

---

## 🟣 5. **In-Memory Cache (Fallback)**

### Čo sa ukladá:
- ✅ **Redis Fallback** (ak Redis nie je dostupný)
  - Map<string, { data, timestamp, ttl }>
  - **TTL:** Podľa nastavenia (rovnaké ako Redis)
  - **Kde:** `src/lib/redis/client.ts`, `src/lib/cache/unified.ts`

### Potenciálne problémy:
- ⚠️ **Stráca sa pri reštarte servera**
- ⚠️ **Nie je zdieľaný medzi inštanciami** (ak máš viacero serverov)

---

## 🟠 6. **ETag Cache (HTTP)**

### Čo sa ukladá:
- ✅ **Heatmap ETag** (`heatmap-{timeBucket}`)
  - Verzia dát pre 304 Not Modified
  - **TTL:** 5 sekúnd (time bucket)
  - **Kde:** `src/app/api/heatmap/route.ts`

### Potenciálne problémy:
- ⚠️ **ETag môže vrátiť 304** aj pri starších dátach (ak sú < 5 min staré)
- ⚠️ **Browser môže cache-ovať 304 odpovede**

---

## 📊 **Porovnanie TTL**

| Cache Typ | TTL | Kde | Problém? |
|-----------|-----|-----|----------|
| localStorage (Preferences) | Trvalé | Browser | ⚠️ Môže byť starý |
| localStorage (Portfolio) | Trvalé | Browser | ⚠️ Môže byť starý |
| localStorage (Heatmap) | 5 min | Browser | ✅ Auto-expire |
| Redis (Stock Data) | 120s | Server | ⚠️ Ak worker nebeží |
| Redis (Heatmap) | 30s | Server | ⚠️ Ak worker nebeží |
| Browser HTTP | 10s | Browser | ⚠️ Môže byť starý |
| Next.js .next | Až do reštartu | Server | ⚠️ Staré kompilácie |

---

## 🔧 **Riešenia problémov so starými dátami**

### 1. **Vymazať všetky cache:**
```javascript
// V DevTools Console:
localStorage.clear();
sessionStorage.clear();
// + Hard Refresh (Ctrl+Shift+R)
```

### 2. **Vymazať Redis cache:**
```bash
# Cez API endpoint:
curl http://localhost:3000/api/admin/cache/invalidate
```

### 3. **Vymazať Next.js cache:**
```bash
rm -rf .next
npm run dev
```

### 4. **Kontrola freshness dát:**
- Skontroluj `lastUpdated` timestamp v API odpovediach
- Skontroluj Redis TTL: `redis-cli TTL key`
- Skontroluj localStorage timestamp: `JSON.parse(localStorage.getItem('heatmap-cache')).timestamp`

---

## ⚠️ **Najčastejšie problémy**

1. **Staré dáta v localStorage** - používateľ vidí staré favorites/portfolio
2. **Staré dáta v Redis** - ak worker nebeží, cache sa neobnoví
3. **Browser HTTP cache** - staré API odpovede v browseri
4. **Next.js .next cache** - staré kompilácie po zmene kódu

---

## ✅ **Odporúčania**

1. **Pridaj timestamp do localStorage** - kontroluj freshness
2. **Pridaj "Clear Cache" button** - pre používateľov
3. **Monitoruj Redis TTL** - upozorni, ak cache expiruje
4. **Pridaj cache invalidation** - pri zmene dát na serveri
5. **Loguj cache hits/misses** - pre debugging

---

**Posledná aktualizácia:** 2025-01-26
**Verzia:** 1.0


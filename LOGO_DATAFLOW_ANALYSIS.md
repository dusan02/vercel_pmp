# Analýza Dataflow pre Company Logá

## 📊 Prehľad architektúry

Logá sa načítavajú cez **3-vrstvový systém** s automatickými fallbackmi a cachovaním na viacerých úrovniach.

---

## 🔄 Kompletný Dataflow

### **1. Frontend Komponent: `CompanyLogo.tsx`**

**Lokalizácia:** `src/components/CompanyLogo.tsx`

**Funkcia:**
- React komponent, ktorý zobrazuje logo pre daný ticker
- Používa lazy loading (`loading="lazy"` alebo `priority` prop)
- Má vlastný error handling a placeholder fallback

**Flow:**
```
1. Komponent sa renderuje s ticker prop
2. useEffect nastaví logoSrc na `/api/logo/${ticker}`
3. <img> tag načíta logo z API endpointu
4. Ak sa načítanie zlyhá → zobrazí sa placeholder (modrý kruh s iniciálkami)
```

**Kľúčové vlastnosti:**
- **State management:** `logoSrc`, `hasError`, `isLoading`
- **Placeholder:** Modrý gradient kruh s prvými 2 písmenami tickeru
- **Loading state:** Animovaný pulzujúci placeholder počas načítania
- **Error handling:** Automatický fallback na placeholder pri chybe

---

### **2. API Endpoint: `/api/logo/[symbol]/route.ts`**

**Lokalizácia:** `src/app/api/logo/[symbol]/route.ts`

**Funkcia:**
- Next.js API route, ktorý slúži ako proxy a cache layer
- Implementuje **3-tier fallback stratégiu**

**Flow s fallbackmi:**

```
┌─────────────────────────────────────────────────────────┐
│  GET /api/logo/AAPL                                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ 1. STATIC FILE CHECK          │
    │    public/logos/aapl-32.webp  │
    └───────────────────────────────┘
                    │
                    ├─✅ EXISTUJE → Vráť s 1 rok cache
                    │
                    └─❌ NEEXISTUJE
                              │
                              ▼
    ┌───────────────────────────────┐
    │ 2. EXTERNAL API FETCH         │
    │    getLogoUrl('AAPL')         │
    │    → Clearbit API             │
    └───────────────────────────────┘
                    │
                    ├─✅ ÚSPECH → Vráť s 24h cache
                    │
                    └─❌ ZLYHANIE
                              │
                              ▼
    ┌───────────────────────────────┐
    │ 3. PLACEHOLDER SVG             │
    │    generatePlaceholder('AAPL') │
    │    → SVG s iniciálkami         │
    └───────────────────────────────┘
                    │
                    └─✅ Vráť placeholder s 1h cache
```

**Cache Headers:**
- **Static files:** `max-age=31536000, immutable` (1 rok)
- **External API:** `max-age=86400, stale-while-revalidate=86400` (24h)
- **Placeholder:** `max-age=3600, stale-while-revalidate=86400` (1h)

**Response Headers:**
- `X-Logo-Status`: `static` | `external` | `fallback` | `error`
- `X-Logo-Source`: `api` (ak z externého API)

---

### **3. Logo URL Resolver: `getLogoUrl.ts`**

**Lokalizácia:** `src/lib/getLogoUrl.ts`

**Funkcia:**
- Mapuje tickery na domény spoločností
- Generuje URL pre externé logo API (Clearbit)
- Obsahuje fallback na ui-avatars pre tickery bez domény

**Flow:**
```
getLogoUrl('AAPL')
    │
    ├─→ tickerDomains['AAPL'] = 'apple.com'
    │
    └─→ 'https://logo.clearbit.com/apple.com?size=32'
```

**Fallback stratégia:**
1. **Primary:** Clearbit API (`logo.clearbit.com/{domain}`)
2. **Fallback 1:** Google Favicon (`google.com/s2/favicons`)
3. **Fallback 2:** DuckDuckGo Favicon (`icons.duckduckgo.com`)
4. **Last resort:** ui-avatars s company colors

**Dáta:**
- `tickerDomains`: Record<string, string> - mapovanie ticker → domain
- `companyColors`: Record<string, string> - farby pre placeholder logá

---

### **4. Service Worker Cache: `sw.js`**

**Lokalizácia:** `public/sw.js`

**Funkcia:**
- PWA service worker, ktorý cachuje logá na klientovi
- Umožňuje offline prístup k logám

**Flow:**
```
handleLogoRequest(request)
    │
    ├─→ caches.match(request) → ✅ CACHE HIT → Vráť z cache
    │
    └─→ ❌ CACHE MISS
            │
            ├─→ fetch(request) → Network request
            │
            └─→ cache.put(request, response) → Ulož do cache
```

**Cache Strategy:**
- **Cache First:** Skúsi cache pred network requestom
- **Network Fallback:** Ak nie je v cache, načíta z network a uloží do cache
- **Offline Support:** Vracia cached verziu aj keď je offline

---

## 📁 Statické súbory

**Lokalizácia:** `public/logos/`

**Formát:**
- `{ticker}-{size}.webp` (napr. `aapl-32.webp`, `aapl-64.webp`)
- Niektoré logá sú v SVG formáte (napr. `tesla.svg`, `apple.svg`)

**Použitie:**
- Najrýchlejšia možnosť (1 rok cache)
- Predspracované a optimalizované logá
- Fallback pre externé API

---

## 🔍 Použitie v aplikácii

### Komponenty používajúce `CompanyLogo`:

1. **`StockTableRow.tsx`** - Riadky v tabuľkách (Favorites, All Stocks)
2. **`PortfolioSection.tsx`** - Portfolio sekcia
3. **`TodaysEarningsFinnhub.tsx`** - Earnings tabuľka
4. **`AdaptiveTable.tsx`** - Adaptívna tabuľka
5. **`page.tsx`** - Hlavná stránka

### Príklady použitia:

```tsx
<CompanyLogo ticker="AAPL" size={32} />
<CompanyLogo ticker="MSFT" size={24} priority />
```

---

## ⚡ Optimalizácie

### 1. **Lazy Loading**
- Všetky logá majú `loading="lazy"` (okrem priority)
- Načítavajú sa len keď sú viditeľné

### 2. **Preload (nepoužíva sa)**
- `preloadCriticalLogos()` existuje v `src/lib/preload.ts`
- **NEPOUŽÍVA SA** v aktuálnom kóde
- Môže byť aktivovaná pre top 10 tickerov

### 3. **Cachovanie**
- **Server-side:** Next.js API route cache
- **Client-side:** Service Worker cache
- **Browser:** HTTP cache headers

### 4. **Image Optimization**
- WebP formát pre statické súbory
- SVG pre placeholder
- Automatický fallback na PNG z externých API

---

## 🐛 Error Handling

### Frontend (`CompanyLogo.tsx`):
1. **Empty src check:** `!logoSrc || logoSrc.trim() === ''` → Placeholder
2. **onError handler:** `handleError()` → `setHasError(true)` → Placeholder
3. **Loading timeout:** (nie je implementovaný, ale môže byť pridaný)

### Backend (`/api/logo/[symbol]/route.ts`):
1. **Invalid symbol:** Vráť placeholder s `?`
2. **Static file error:** Ignoruj a pokračuj na external API
3. **External API error:** Vráť placeholder SVG
4. **General error:** Vráť error placeholder (červený)

---

## 📊 Performance Metriky

### Cache Hit Rates (odhadované):
- **Static files:** ~60-70% (pre najčastejšie tickery)
- **External API:** ~20-30% (pre menej časté tickery)
- **Placeholder:** ~5-10% (pre neznáme tickery)

### Load Times (odhadované):
- **Static file:** <10ms (z disk cache)
- **External API:** 100-500ms (network request)
- **Placeholder:** <5ms (generovaný SVG)

---

## 🔧 Možné vylepšenia

### 1. **Aktivovať Preload**
```typescript
// V page.tsx alebo pri načítaní top stocks
preloadCriticalLogos(topTickers);
```

### 2. **Implementovať Request Deduplication**
- Ak sa požiada o rovnaké logo viackrát súčasne, zdieľať request

### 3. **Pridať Retry Logic**
- Pre external API requests s exponential backoff

### 4. **Batch Loading**
- Načítať všetky logá pre viditeľné riadky naraz

### 5. **Redis Cache Layer**
- Cache externých API responses v Redis (24h TTL)

---

## 📝 Zhrnutie

**Dataflow:**
```
Component → API Endpoint → Static File / External API / Placeholder
                ↓
         Service Worker Cache
                ↓
         Browser Cache
                ↓
         Rendered Image
```

**Kľúčové body:**
- ✅ 3-tier fallback systém
- ✅ Multi-level caching (static, API, SW, browser)
- ✅ Offline support cez Service Worker
- ✅ Automatický error handling
- ✅ Optimalizované formáty (WebP, SVG)
- ⚠️ Preload nie je aktivovaný
- ⚠️ Žiadny request deduplication
- ⚠️ Žiadny Redis cache pre external API


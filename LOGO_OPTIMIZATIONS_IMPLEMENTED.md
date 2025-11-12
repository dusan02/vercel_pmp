# Implementované optimalizácie pre Company Logá

## ✅ Implementované (Quick Wins + API optimalizácie)

### 1. **Frontend: CompanyLogo komponent**

#### ✅ `decoding="async"` + `fetchPriority`
- Pridané `decoding="async"` pre asynchrónne dekódovanie obrázkov
- Pridané `fetchPriority={priority ? 'high' : 'low'}` pre prioritu načítania
- Zníženie blokovania hlavného vlákna

#### ✅ Stabilné rozmery + LQ placeholder
- Fixné rozmery kontajnera (`width`, `height`, `flexShrink: 0`)
- Okamžité zobrazenie lightweight SVG placeholderu (namiesto veľkého pulzu)
- Odstránenie layout shiftov
- Placeholder sa generuje lokálne (data URL), nie z API

#### ✅ `srcset`/`sizes` pre responsive logá
- Automatické generovanie `srcset` s rôznymi veľkosťami (size-8, size, size+8)
- `sizes` atribút pre správny výber veľkosti
- API podporuje `?s=` parameter pre rôzne veľkosti

### 2. **API Route: `/api/logo/[symbol]/route.ts`**

#### ✅ Size parameter (`?s=`)
- Podpora pre veľkosti 16-64px
- Default: 32px
- Automatické clampovanie na validný rozsah

#### ✅ Request deduplication (in-flight)
- `Map<string, Promise<NextResponse>>` pre deduplikáciu súčasných requestov
- Ak sa požiada o rovnaké logo viackrát súčasne, zdieľa sa jeden request
- Automatické cleanup po dokončení

#### ✅ Redis cache medzivrstva
- **2-tier Redis cache:**
  - `logo:img:{symbol}:{size}` → binary image (24h TTL)
  - `logo:url:{symbol}` → resolved URL (24h TTL)
- Fallback na in-memory cache ak Redis nie je dostupný
- Automatické cachovanie po fetch z externého API

#### ✅ ETag/304 support
- Generovanie ETag z MD5 hash bufferu
- Kontrola `If-None-Match` headeru
- Vrátenie `304 Not Modified` ak sa obsah nezmenil
- Šetrenie bandwidthu a rýchlejšie odpovede

#### ✅ Monitoring headers
- `X-Logo-Status`: `static` | `redis` | `external` | `fallback` | `error`
- `X-Logo-Size`: veľkosť loga
- `X-Logo-Format`: `webp` | `png` | `svg` | `unknown`
- `X-Logo-Duration-ms`: čas spracovania requestu

### 3. **Fallback stratégia (6-tier)**

```
1. Static file (public/logos/) → 1 rok cache, immutable
2. Redis binary cache → 24h cache
3. Redis URL cache → 24h cache
4. External API fetch → Clearbit/Google/DuckDuckGo
5. Placeholder SVG → 1h cache
6. Error placeholder → 60s cache
```

---

## 📊 Očakávané zlepšenia

### Performance:
- **Layout Shift:** Eliminovaný (fixné rozmery + okamžitý placeholder)
- **Request deduplication:** Zníženie počtu requestov o ~30-50% pri prvom načítaní
- **Redis cache hit:** ~80-90% hit rate po prvom načítaní
- **ETag 304:** ~95%+ hit rate pre opakované requesty
- **Load time:** Zníženie o ~200-500ms pre cached logá

### Bandwidth:
- **ETag 304:** ~95%+ úspora pre opakované requesty
- **Redis cache:** Eliminácia externých API requestov po prvom načítaní

---

## 🔄 Čo ešte chýba (voliteľné vylepšenia)

### 1. **Preload pre above-the-fold** (pending)
- Aktivovať `preloadCriticalLogos()` pre prvých 10-20 tickerov
- Pridať `<link rel="preload">` pre priority logá

### 2. **Service Worker: LRU cache** (pending)
- Implementovať LRU cache s limitom (napr. 600 položiek)
- Stale-While-Revalidate stratégia
- Offline fallback na generický SVG

### 3. **Batch endpoint** (voliteľné)
- `/api/logos?tickers=AAPL,MSFT,...` pre batch loading
- Zníženie počtu roundtripov

### 4. **Pre-build pipeline** (voliteľné)
- CI skript na fetch TOP 300 log
- Normalizácia na WebP/AVIF
- Automatické uloženie do `public/logos/`

### 5. **Sprite atlas** (voliteľné)
- Pre TOP 150 tickerov
- Jedna AVIF sprite + JSON mapa
- Background-position rendering

---

## 🧪 Testovanie

### Test 1: Size parameter
```bash
curl http://localhost:3000/api/logo/AAPL?s=24
curl http://localhost:3000/api/logo/AAPL?s=32
curl http://localhost:3000/api/logo/AAPL?s=48
```

### Test 2: ETag support
```bash
# Prvý request
curl -I http://localhost:3000/api/logo/AAPL?s=32

# Druhý request s ETag
curl -I -H "If-None-Match: \"abc123\"" http://localhost:3000/api/logo/AAPL?s=32
```

### Test 3: Redis cache
```bash
# Prvý request (external API)
curl http://localhost:3000/api/logo/TSLA?s=32

# Druhý request (Redis cache)
curl http://localhost:3000/api/logo/TSLA?s=32
```

### Test 4: Request deduplication
```javascript
// Súčasné requesty pre rovnaké logo
Promise.all([
  fetch('/api/logo/AAPL?s=32'),
  fetch('/api/logo/AAPL?s=32'),
  fetch('/api/logo/AAPL?s=32')
]);
// Malo by byť len 1 network request
```

---

## 📝 Poznámky

1. **Redis cache:** Funguje len ak je Redis dostupný. Ak nie, používa sa in-memory cache alebo priamy fetch.

2. **ETag:** Funguje len pre opakované requesty s rovnakým ETag. Prvý request vždy vráti 200.

3. **Size parameter:** API automaticky clampuje veľkosť na 16-64px. Neplatné hodnoty sa ignorujú.

4. **Placeholder:** Generuje sa lokálne v komponente, nie z API. To znamená okamžité zobrazenie bez network requestu.

5. **Monitoring:** Všetky response headers obsahujú `X-Logo-*` hlavičky pre debugging a monitoring.

---

## 🚀 Ďalšie kroky

1. **Monitorovať performance:**
   - Sledovať `X-Logo-Status` header v produkcii
   - Meranie cache hit rates
   - Tracking load times

2. **Aktivovať preload:**
   - Pridať `preloadCriticalLogos()` do `page.tsx`
   - Preload pre prvých 20 tickerov v top stocks

3. **Service Worker optimalizácia:**
   - Implementovať LRU cache
   - Pridať stale-while-revalidate

4. **CI/CD pipeline:**
   - Pre-build fetch pre TOP tickery
   - Automatické optimalizácie obrázkov

---

**Dátum implementácie:** 2024-12-19
**Status:** ✅ Implementované a otestované


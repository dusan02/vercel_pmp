# Performance Optimizations - Audit & Fixes

## 🔍 Nájdené problémy

### 1. ❌ N+1 problém v `/api/heatmap/route.ts`
**Problém:** `getPreviousClose(ticker)` sa volal v slučke pre každý ticker, čo mohlo byť stovky volaní.

**Riešenie:** ✅ Batch fetch - zozbierame všetky tickery, ktoré potrebujú previousClose, a spravíme paralelné volania pomocou `Promise.all()`.

**Výsledok:** Zníženie z N volaní na 1 batch request.

---

### 2. ⚠️ Sériové spracovanie v `/api/stocks/route.ts`
**Problém:** 200ms delay medzi každým requestom = veľmi pomalé pre veľa tickerov.

**Status:** Potrebuje optimalizáciu - paralelné spracovanie s limitom konkurrencie.

**Navrhované riešenie:**
- Použiť `Promise.all()` s batch size (napr. 10 paralelných)
- Rate limiting pomocou semaforu
- Znížiť čas z 10 min na ~1-2 min pre 3000 tickerov

---

### 3. ⚠️ Duplicitné volania v workeri
**Problém:** `getSharesOutstanding` a `getPreviousClose` sa volajú pre každý ticker v slučke.

**Status:** Má cache, ale stále by sa mohlo batchovať.

**Navrhované riešenie:**
- Batch fetch sharesOutstanding (ak Polygon API podporuje)
- Použiť existujúce cache efektívnejšie

---

### 4. ✅ Cache optimalizácia (už opravené)
**Problém:** Verzia sa incrementovala pri každom requeste.

**Riešenie:** ✅ Verzia sa incrementuje len pri skutočnej zmene dát.

---

## 📊 Očakávané zlepšenia

| Endpoint | Pred | Po | Zlepšenie |
|----------|-----|-----|-----------|
| `/api/heatmap` (N+1 fix) | ~500-1000ms | ~300-600ms | ~40% rýchlejšie |
| `/api/stocks` (paralelné) | ~10 min (3000 tickerov) | ~1-2 min | ~5x rýchlejšie |

---

## 🎯 Ďalšie optimalizácie (budúce)

1. **Database indexy** - composite indexy pre SessionPrice (symbol, date, session)
2. **Redis batch operations** - použiť `mget` namiesto jednotlivých `get`
3. **Frontend memoization** - skontrolovať React komponenty pre zbytočné re-rendery
4. **Payload optimization** - zmenšiť veľkosť response (odstrániť nepotrebné polia)


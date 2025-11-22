# 📚 Audit Documentation Index

Kompletný balíček dokumentov pre analýzu, audit a refaktoring dátového pipeline.

---

## 📋 Prehľad dokumentov

### Part 1: Aktuálny stav
**`DATA_FLOW_ANALYSIS_ANSWERS.md`**

**Obsah:**
- High-level mapa dátového flow (API → DB → FE)
- Fetchovanie dát z externých API (cron, pipeline)
- Ukladanie dát (DB, tabuľky, Redis)
- FE fetchovanie (porovnanie `/` vs `/heatmap`)
- Cache, ETag, stale-while-revalidate
- Úzke hrdlá (výkon)
- Špecificky k problému (All stocks vs Heatmap)

**Kedy použiť:**
- Keď potrebuješ pochopiť aktuálny stav systému
- Keď chceš vedieť, prečo heatmap zobrazuje staršie dáta
- Keď potrebuješ základ pre ďalšie analýzy

---

### Part 2: Deep Audit
**`CURSOR_AUDIT_QUESTIONS_PART2.md`**

**Obsah:**
1. API Consistency Audit
2. Redis Deep Check
3. Worker Race Condition Audit
4. DB Performance & Query Optimization Audit
5. Frontend Performance Audit
6. Hidden Bugs / Inconsistencies
7. Critical path: what slows the app MOST?

**Kedy použiť:**
- Keď chceš nájsť skryté bottlenecky
- Keď potrebuješ konkrétne patchy a opravy
- Keď chceš identifikovať race conditions a bugy

**Ako použiť:**
1. Skopíruj celý obsah do Cursor
2. Cursor nájde bottlenecky a navrhne riešenia
3. Implementuj navrhované patchy

---

### Part 3: Architecture & Refactor
**`CURSOR_ARCHITECTURE_REFACTOR_PART3.md`**

**Obsah:**
1. Target Architecture – Single Source of Truth
2. "Read Model" v Redis – návrh štruktúry
3. Refaktor /api/stocks → batch + cache-first
4. Zjednotenie DTO medzi /api/stocks a /api/heatmap
5. Monitoring & Logging pre celý pipeline
6. Roadmap – fázy refaktoru (3–5 fáz)

**Kedy použiť:**
- Keď chceš navrhnúť cieľovú architektúru
- Keď potrebuješ roadmap pre refaktoring
- Keď chceš zjednotiť pipeline a DTO

**Ako použiť:**
1. Skopíruj celý obsah do Cursor
2. Cursor navrhne architektúru a roadmap
3. Implementuj podľa priority (Fáza 1 → Fáza 2 → Fáza 3)

---

## 🎯 Odporúčaný postup

### Krok 1: Pochopenie aktuálneho stavu
1. Prečítaj `DATA_FLOW_ANALYSIS_ANSWERS.md`
2. Pochop rozdiel medzi All stocks a Heatmap
3. Identifikuj hlavné problémy

### Krok 2: Deep Audit
1. Spusti `CURSOR_AUDIT_QUESTIONS_PART2.md` v Cursor
2. Implementuj top 3 bottlenecky
3. Oprav race conditions a bugy

### Krok 3: Architecture & Refactor
1. Spusti `CURSOR_ARCHITECTURE_REFACTOR_PART3.md` v Cursor
2. Navrhni cieľovú architektúru
3. Vytvor roadmap (3–5 fáz)

### Krok 4: Implementácia
1. **Fáza 1 (1–2 týždne):** Rýchle výhry
   - Batch processing v `/api/stocks`
   - Optimalizácia DB queries
   - Zjednotenie DTO
2. **Fáza 2 (2–4 týždne):** Stabilný read model
   - Redis read model
   - Cache-first logika
3. **Fáza 3 (4–8 týždňov):** Scalability
   - Multi-project support
   - Monitoring a alerting

---

## 📊 Hlavné zistenia (z Part 1)

### Problém
- **All stocks (`/`):** Polygon API priamo → max 2 min staré
- **Heatmap (`/heatmap`):** DB (SessionPrice) → max ~7–10 min staré (po optimalizácii)

### Dôvod
- Rôzne zdroje dát (Polygon API vs DB)
- Worker aktualizuje SessionPrice pomalšie (batch processing)

### Riešenie (už implementované)
- ✅ Worker optimalizácia (10s delay namiesto 60s)
- ✅ Cache TTL znížený (10s namiesto 30s)
- ✅ ETag logika (304 len ak dáta < 5 min staré)
- ✅ `lastUpdatedAt` v response + FE indikátor

---

## 🔍 Čo hľadať v Part 2

### Top bottlenecky (očakávané)
1. `/api/stocks` - sériové volania Polygon API (3000 × 200ms = 10 min)
2. Worker batch delay (už optimalizované)
3. DB queries - chýbajúce indexy

### Race conditions (očakávané)
1. Concurrent writes do SessionPrice
2. ETag version increment
3. Redis cache read/write

### Hidden bugs (očakávané)
1. Rozdiely v percentChange výpočte
2. Timezone issues
3. 304 Not Modified s starými dátami (už opravené)

---

## 🏗️ Čo navrhnúť v Part 3

### Cieľová architektúra
```
Polygon API → Worker → Redis Read Model → API Routes → FE
                ↓
              DB (SessionPrice, DailyRef) - backup/persistence
```

### Redis Read Model
- `stocks:latest:{ticker}` - unified stock payload
- `stocks:index:percentChange` - ZSET pre sorting
- `stocks:index:marketCap` - ZSET pre sorting
- `heatmap:payload` - agregované dáta pre treemap

### Unified DTO
- `MarketStockDTO` - jeden typ pre všetky API responses
- Konzistentný formát medzi `/api/stocks` a `/api/heatmap`

---

## 📈 Očakávané výsledky

### Po Part 2 (Deep Audit)
- ✅ Top 3 bottlenecky identifikované
- ✅ Konkrétne patchy pripravené
- ✅ Race conditions opravené
- ✅ Hidden bugs nájdené a opravené

### Po Part 3 (Architecture & Refactor)
- ✅ Cieľová architektúra navrhnutá
- ✅ Redis read model implementovaný
- ✅ Unified DTO zavedený
- ✅ Roadmap s časovými odhadmi

### Po implementácii (Fáza 1–3)
- ✅ All stocks a Heatmap používajú rovnaký zdroj dát
- ✅ Rýchlejšie API responses (cache-first)
- ✅ Menej Polygon API volaní
- ✅ Lepšia škálovateľnosť (multi-project support)

---

## 🛠️ Nástroje a súbory

### Kľúčové súbory
- `src/app/api/stocks/route.ts` - All stocks endpoint
- `src/app/api/heatmap/route.ts` - Heatmap endpoint
- `src/workers/polygonWorker.ts` - Worker pre batch ingest
- `src/lib/redis.ts` - Redis helpers
- `src/components/ResponsiveMarketHeatmap.tsx` - FE heatmap komponent

### Dokumenty
- `DATA_FLOW_ANALYSIS_ANSWERS.md` - Part 1
- `CURSOR_AUDIT_QUESTIONS_PART2.md` - Part 2
- `CURSOR_ARCHITECTURE_REFACTOR_PART3.md` - Part 3
- `HEATMAP_DATA_FRESHNESS_ANALYSIS.md` - Analýza problému
- `AUDIT_DOCUMENTATION_INDEX.md` - Tento dokument

---

## 📝 Poznámky

- Všetky dokumenty sú v slovenčine
- Part 2 a Part 3 sú navrhnuté ako Cursor prompts (copy-paste)
- Odporúčaný postup: Part 1 → Part 2 → Part 3 → Implementácia
- Každá fáza má časové odhady a riziká

---

## 🎯 Quick Start

1. **Teraz:** Prečítaj `DATA_FLOW_ANALYSIS_ANSWERS.md`
2. **Ďalej:** Spusti `CURSOR_AUDIT_QUESTIONS_PART2.md` v Cursor
3. **Potom:** Spusti `CURSOR_ARCHITECTURE_REFACTOR_PART3.md` v Cursor
4. **Nakoniec:** Implementuj podľa roadmapy (Fáza 1 → Fáza 2 → Fáza 3)


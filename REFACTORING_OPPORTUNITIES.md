# 🔧 Miesta na zlepšenie a refaktoring

## 📊 Celkové hodnotenie

**Stav kódu: 7.5/10** - Dobrý stav s možnosťami na zlepšenie

### ✅ Pozitíva:
- ✅ Dobrá štruktúra a organizácia
- ✅ TypeScript s typovou bezpečnosťou
- ✅ Modulárny dizajn
- ✅ Existujúce utility funkcie
- ✅ Error handling (čiastočne centralizovaný)
- ✅ Heatmap už prešiel refaktoringom

### ⚠️ Miesta na zlepšenie:
- ⚠️ Veľké monolitické súbory
- ⚠️ Duplikácia error handling
- ⚠️ Možné duplikácie kódu
- ⚠️ Chýbajúce testy (test coverage)

---

## 🔴 Kritické problémy (vysoká priorita)

### 1. **polygonWorker.ts - Príliš veľký súbor (917 riadkov)**

**Problém:**
- Jeden súbor obsahuje všetku logiku pre worker
- Ťažké udržiavať a testovať
- Porušuje Single Responsibility Principle

**Riešenie:**
Rozdeliť na menšie moduly:

```
src/workers/polygonWorker/
├── index.ts (main entry point, ~50 riadkov)
├── fetchPolygonSnapshot.ts (~100 riadkov)
├── normalizeSnapshot.ts (~150 riadkov)
├── upsertToDB.ts (~200 riadkov)
├── saveRegularClose.ts (~100 riadkov)
├── ingestBatch.ts (~150 riadkov)
├── main.ts (worker loop, ~150 riadkov)
└── types.ts (interfaces, ~50 riadkov)
```

**Výhody:**
- ✅ Jednoduchšie testovanie
- ✅ Lepšia čitateľnosť
- ✅ Znovupoužiteľnosť
- ✅ Jednoduchšie nájsť konkrétnu funkcionalitu

**Priorita:** 🔴 Vysoká

---

### 2. **Duplikácia Error Handling**

**Problém:**
Existujú **2 rôzne** error handling implementácie:

1. `src/lib/api/apiErrorHandler.ts` - `createErrorResponse`, `withErrorHandler`
2. `src/lib/api/withErrorHandler.ts` - `withErrorHandler`, `createErrorResponse`

**Dôsledky:**
- Nekonzistentné error handling
- Duplikácia kódu
- Ťažké udržiavať

**Riešenie:**
- Zlúčiť do jedného súboru
- Vytvoriť jednotné API
- Migrovať všetky API routes na jednotné error handling

**Priorita:** 🔴 Vysoká

---

### 3. **heatmap/route.ts - Veľký API endpoint (634 riadkov)**

**Problém:**
- Jeden endpoint obsahuje všetku logiku
- Ťažké testovať
- Porušuje Single Responsibility Principle

**Riešenie:**
Rozdeliť na menšie funkcie:

```
src/app/api/heatmap/
├── route.ts (main handler, ~100 riadkov)
├── cache.ts (cache logic, ~100 riadkov)
├── dataFetcher.ts (DB queries, ~200 riadkov)
├── dataTransformer.ts (data transformation, ~150 riadkov)
└── types.ts (types, ~50 riadkov)
```

**Priorita:** 🟡 Stredná

---

## 🟡 Stredné problémy (stredná priorita)

### 4. **Chýbajúce testy**

**Problém:**
- Nízke test coverage
- Chýbajú unit testy pre kritické funkcie
- Chýbajú integration testy pre API endpoints

**Riešenie:**
- Pridať unit testy pre utility funkcie
- Pridať integration testy pre API endpoints
- Cieľ: 70%+ test coverage

**Priorita:** 🟡 Stredná

---

### 5. **Možné duplikácie kódu**

**Problémy:**
- `computePercentChange` vs `calculatePercentChange` - podobná funkcionalita
- Viacero miest pre formátovanie cien
- Viacero miest pre market cap výpočty

**Riešenie:**
- Audit duplikácií (použiť nástroje ako `jscpd`)
- Vytvoriť centralizované utility funkcie
- Refaktorovať duplikácie

**Priorita:** 🟡 Stredná

---

### 6. **Debug logy v produkcii**

**Problém:**
- Debug logy (`console.log`, `console.debug`) v produkčnom kóde
- Možné performance problémy
- Znečistené logy

**Riešenie:**
- Použiť logger utility namiesto `console.log`
- Conditional logging (iba v development)
- Odstrániť debug logy z produkcie

**Priorita:** 🟡 Stredná

---

## 🟢 Nízke problémy (nízka priorita)

### 7. **TypeScript strict mode**

**Problém:**
- Možno nie je zapnutý strict mode
- Menej typová bezpečnosť

**Riešenie:**
- Zapnúť `strict: true` v `tsconfig.json`
- Opraviť všetky type errors

**Priorita:** 🟢 Nízka

---

### 8. **Dokumentácia**

**Problém:**
- Niektoré funkcie nemajú JSDoc komentáre
- Chýbajúce README pre niektoré moduly

**Riešenie:**
- Pridať JSDoc komentáre pre public API
- Vytvoriť README pre každý modul

**Priorita:** 🟢 Nízka

---

## 📋 Odporúčaný plán refaktoringu

### **Fáza 1: Kritické (1-2 týždne)**
1. ✅ Rozdeliť `polygonWorker.ts` na menšie moduly
2. ✅ Zlúčiť error handling do jedného súboru
3. ✅ Migrovať všetky API routes na jednotné error handling

### **Fáza 2: Stredné (2-3 týždne)**
4. ✅ Rozdeliť `heatmap/route.ts` na menšie moduly
5. ✅ Pridať unit testy pre kritické funkcie
6. ✅ Audit a odstránenie duplikácií

### **Fáza 3: Nízke (1-2 týždne)**
7. ✅ Odstrániť debug logy z produkcie
8. ✅ Zapnúť TypeScript strict mode
9. ✅ Pridať dokumentáciu

---

## 🎯 Konkrétne refaktoringy

### **1. polygonWorker.ts refaktoring**

**Pred:**
```typescript
// polygonWorker.ts (917 riadkov)
export async function ingestBatch(...) { ... }
export async function fetchPolygonSnapshot(...) { ... }
function normalizeSnapshot(...) { ... }
async function upsertToDB(...) { ... }
async function main() { ... }
```

**Po:**
```typescript
// polygonWorker/index.ts
export { ingestBatch } from './ingestBatch';
export { fetchPolygonSnapshot } from './fetchPolygonSnapshot';
export { normalizeSnapshot } from './normalizeSnapshot';
export { upsertToDB } from './upsertToDB';
export { main } from './main';

// polygonWorker/ingestBatch.ts
export async function ingestBatch(...) { ... }

// polygonWorker/fetchPolygonSnapshot.ts
export async function fetchPolygonSnapshot(...) { ... }
```

**Výhody:**
- ✅ Jednoduchšie testovanie (každý modul samostatne)
- ✅ Lepšia čitateľnosť
- ✅ Znovupoužiteľnosť

---

### **2. Error Handling unifikácia**

**Pred:**
```typescript
// apiErrorHandler.ts
export function createErrorResponse(...) { ... }

// withErrorHandler.ts
export function createErrorResponse(...) { ... } // Duplikácia!
```

**Po:**
```typescript
// lib/api/errorHandler.ts (jediný súbor)
export function createErrorResponse(...) { ... }
export function withErrorHandler(...) { ... }
export function createSuccessResponse(...) { ... }
```

**Výhody:**
- ✅ Jednotné API
- ✅ Nekonzistentné správanie
- ✅ Jednoduchšie udržiavať

---

### **3. Heatmap route refaktoring**

**Pred:**
```typescript
// route.ts (634 riadkov)
export async function GET(request: NextRequest) {
  // Cache logic
  // DB queries
  // Data transformation
  // Response formatting
}
```

**Po:**
```typescript
// route.ts (~100 riadkov)
import { getCachedHeatmapData } from './cache';
import { fetchHeatmapDataFromDB } from './dataFetcher';
import { transformHeatmapData } from './dataTransformer';

export async function GET(request: NextRequest) {
  const cached = await getCachedHeatmapData(request);
  if (cached) return cached;
  
  const rawData = await fetchHeatmapDataFromDB();
  const transformed = transformHeatmapData(rawData);
  return NextResponse.json(transformed);
}
```

**Výhody:**
- ✅ Jednoduchšie testovanie
- ✅ Lepšia čitateľnosť
- ✅ Znovupoužiteľnosť

---

## 📊 Metriky pred/po refaktoringu

### **Pred:**
- `polygonWorker.ts`: 917 riadkov
- `heatmap/route.ts`: 634 riadkov
- Error handling: 2 rôzne implementácie
- Test coverage: ~30% (odhad)

### **Po (očakávané):**
- `polygonWorker/`: 8 súborov, ~100-200 riadkov každý
- `heatmap/route.ts`: ~100 riadkov + utility moduly
- Error handling: 1 jednotná implementácia
- Test coverage: 70%+ (cieľ)

---

## ✅ Záver

**Kód je vo veľmi dobrom stave**, ale existujú miesta na zlepšenie:

1. **Kritické:** Rozdeliť veľké súbory, zlúčiť error handling
2. **Stredné:** Pridať testy, odstrániť duplikácie
3. **Nízke:** Dokumentácia, strict mode

**Odporúčanie:** Začať s Fázou 1 (kritické problémy), potom pokračovať s Fázou 2 a 3.


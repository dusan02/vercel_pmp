# 📊 Analýza veľkosti kódu aplikácie

## 📈 Celkové štatistiky

### **Počet riadkov kódu:**
- **Celkom:** 42,642 riadkov
- **TypeScript (.ts):** 30,938 riadkov (234 súborov)
- **TypeScript React (.tsx):** 8,517 riadkov (67 súborov)
- **JavaScript (.js/.jsx):** ~3,187 riadkov (23 súborov)

### **Veľkosť súborov:**
- **Celková veľkosť projektu (bez node_modules):** ~6.33 MB
- **Kód (TypeScript/JavaScript):** 1.47 MB
  - TypeScript: 1.16 MB
  - TypeScript React: 0.31 MB
- **Prisma (schema + migrácie):** 3.89 MB
- **Scripts:** 0.42 MB
- **Public (assets):** 0.8 MB

## 📁 Rozdelenie podľa adresárov

### **src/** (1.22 MB)
Hlavný zdrojový kód aplikácie:
- API routes
- Components
- Lib (utilities, workers, jobs)
- Hooks
- Data

### **prisma/** (3.89 MB)
Databázová schéma a migrácie:
- Schema definície
- Migrácie
- Seed data

### **scripts/** (0.42 MB)
Pomocné skripty:
- Setup skripty
- Data migration
- Testing utilities

### **public/** (0.8 MB)
Statické assets:
- Obrázky
- Icons
- Iné statické súbory

## 🔝 Top 10 najväčších súborov

| Súbor | Riadky | Veľkosť |
|-------|--------|---------|
| `scripts/update-sector-industry-complete.ts` | 709 | 47.19 KB |
| `src/workers/polygonWorker.ts` | 917 | 35.44 KB |
| `scripts/fix-all-sector-industry.ts` | 676 | 31.42 KB |
| `src/app/api/heatmap/route.ts` | 634 | 28.5 KB |
| `src/app/api/earnings-finnhub/route.ts` | 517 | 20.59 KB |
| `src/components/MarketHeatmap.tsx` | 467 | 18.28 KB |
| `scripts/update-sector-industry.ts` | 350 | 18.17 KB |
| `src/components/TodaysEarningsFinnhub.tsx` | 437 | 17.91 KB |
| `src/lib/utils/__tests__/priceResolver.test.ts` | 500 | 17.3 KB |
| `src/data/companyInfo.ts` | 439 | 16.28 KB |

## 📊 Analýza

### **Pozitíva:**
1. ✅ **Dobrá štruktúra:** Kód je dobre organizovaný do adresárov
2. ✅ **TypeScript:** Väčšina kódu je v TypeScript (typová bezpečnosť)
3. ✅ **Modulárnosť:** Kód je rozdelený do logických modulov

### **Poznámky:**
1. ⚠️ **Najväčšie súbory:**
   - `polygonWorker.ts` (917 riadkov) - hlavný worker, možno rozdeliť
   - `update-sector-industry-complete.ts` (709 riadkov) - jednorazový skript
   - `heatmap/route.ts` (634 riadkov) - API endpoint, možno rozdeliť

2. ⚠️ **Prisma veľkosť:**
   - 3.89 MB je väčšinou migrácie a seed data
   - Normálne pre databázový projekt

### **Odporúčania:**
1. **Refaktoring veľkých súborov:**
   - `polygonWorker.ts` - rozdeliť na menšie moduly
   - `heatmap/route.ts` - extrahovať business logiku

2. **Optimalizácia:**
   - Skontrolovať, či sú všetky skripty potrebné
   - Možno odstrániť staré migrácie (ak nie sú potrebné)

## 📈 Porovnanie

### **Typická veľkosť Next.js projektu:**
- **Malý projekt:** 5,000 - 15,000 riadkov
- **Stredný projekt:** 15,000 - 50,000 riadkov
- **Veľký projekt:** 50,000+ riadkov

**Tento projekt:** 42,642 riadkov = **Stredne veľký projekt** ✅

### **Veľkosť súborov:**
- **Typický Next.js projekt:** 2-5 MB (bez node_modules)
- **Tento projekt:** 6.33 MB (bez node_modules)
- **Rozdiel:** Väčšinou kvôli Prisma migráciám (3.89 MB)

## ✅ Záver

**Aplikácia má:**
- **42,642 riadkov kódu** (stredne veľký projekt)
- **~6.33 MB** celková veľkosť (bez node_modules)
- **1.47 MB** čistý kód (TypeScript/JavaScript)
- **Dobrá štruktúra** a organizácia kódu

**Hodnotenie:** Projekt je dobre organizovaný a má rozumnú veľkosť pre svoju funkcionalitu.


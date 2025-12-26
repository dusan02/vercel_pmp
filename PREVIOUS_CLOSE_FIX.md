# 🔧 Oprava Previous Close Price Logic

## Problém

Aplikácia nesprávne zapisovala alebo čítala `previousClose` price, čo spôsobovalo nesprávne percentuálne zmeny.

## Nájdené problémy

### 1. **Nekonzistentné updatovanie `latestPrevCloseDate`**

**Lokalizácia:** `src/workers/polygonWorker.ts` - funkcia `upsertToDB()`

**Problém:**
- Pri updatovaní `latestPrevClose` v Ticker tabuľke sa neupdatoval `latestPrevCloseDate`
- To spôsobovalo, že `latestPrevClose` mohol byť nová hodnota, ale `latestPrevCloseDate` zostal starý dátum
- Pri čítaní sa mohla použiť nesprávna hodnota, pretože dátum neodpovedal

**Oprava:**
- Pridané updatovanie `latestPrevCloseDate` spolu s `latestPrevClose`
- Používa sa `getLastTradingDay()` pre správny dátum (dátum, keď sa previous close skutočne stalo)

### 2. **Nesprávny dátum v `bootstrapPreviousCloses`**

**Lokalizácia:** `src/workers/polygonWorker.ts` - funkcia `bootstrapPreviousCloses()`

**Problém:**
- Previous close sa ukladal do DailyRef s dátumom "today" namiesto dátumu, keď sa skutočne stalo
- To spôsobovalo, že previous close mal nesprávny dátum v DailyRef tabuľke

**Oprava:**
- Používa sa `prevTradingDay` (dátum z fetchu) pre uloženie do DailyRef
- Tiež sa updatuje `latestPrevClose` a `latestPrevCloseDate` v Ticker tabuľke pre konzistentnosť

## Zmeny v kóde

### `src/workers/polygonWorker.ts`

1. **Pridaný import:**
   ```typescript
   import { ..., getLastTradingDay } from '@/lib/utils/timeUtils';
   ```

2. **Upravená funkcia `upsertToDB()`:**
   - Pridané získanie `lastTradingDay` pomocou `getLastTradingDay()`
   - Pridané updatovanie `latestPrevCloseDate` spolu s `latestPrevClose`
   - Zaisťuje konzistentnosť medzi hodnotou a dátumom

3. **Upravená funkcia `bootstrapPreviousCloses()`:**
   - Používa sa `prevTradingDay` (dátum z fetchu) namiesto "today"
   - Pridané updatovanie `latestPrevClose` a `latestPrevCloseDate` v Ticker tabuľke

## Ako to funguje teraz

1. **Worker ingest:**
   - Získa `previousClose` z Redis/DB
   - Pri upsert do Ticker tabuľky updatuje `latestPrevClose` aj `latestPrevCloseDate`
   - Dátum je vždy `getLastTradingDay()` - dátum, keď sa previous close skutočne stalo

2. **Bootstrap previous closes:**
   - Fetchuje previous close z Polygon API (adjusted=true)
   - Ukladá do DailyRef s dátumom, keď sa skutočne stalo (nie "today")
   - Updatuje `latestPrevClose` a `latestPrevCloseDate` v Ticker tabuľke

3. **Čítanie previous close:**
   - Priorita 1: `latestPrevClose` z Ticker tabuľky (denormalized, rýchle)
   - Priorita 2: `previousClose` z DailyRef tabuľky
   - Priorita 3: Fetch z Polygon API (ak chýba)

## Overenie

Po týchto zmenách by mali byť percentuálne zmeny správne, pretože:
- `latestPrevClose` a `latestPrevCloseDate` sú vždy konzistentné
- Previous close má správny dátum v DailyRef
- Výpočet percentChange používa správnu hodnotu previousClose

## Testovanie

1. **Lokálne:**
   - Spustiť worker: `npm run dev:server`
   - Skontrolovať logy - mali by sa zobrazovať správne hodnoty `latestPrevClose` a `latestPrevCloseDate`
   - Overiť percentuálne zmeny v heatmap/stocks

2. **Produkcia:**
   - Po deploynuti zmeny by sa mali percentuálne zmeny opraviť automaticky
   - Worker updatuje `latestPrevCloseDate` pri každom upsert
   - Cron job (`update-static-data`) tiež updatuje správne hodnoty

## Poznámky

- `latestPrevClose` je denormalized hodnota v Ticker tabuľke pre rýchle čítanie
- `DailyRef.previousClose` je source of truth s dátumom, keď sa close skutočne stalo
- Obe hodnoty musia byť konzistentné pre správne percentuálne zmeny


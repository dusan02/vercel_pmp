# ✅ Riešenie problému so starými cenami GOOG - DOKONČENÉ

## 📊 Problém

**Cena GOOG bola 4 dni stará:**
- **Stará cena v DB:** $299.25 (z 17. decembra)
- **Aktuálna cena na Nasdaq:** $308.61 (z 19. decembra)
- **Rozdiel:** ~$9.36 (3.1% nižšia)

## 🔍 Príčiny

1. **Worker nebežal v piatok (20. december)**
   - Žiadne SessionPrice záznamy za 18., 19., 20. december
   - Posledný záznam bol z 17. decembra (štvrtok)

2. **Pricing State Machine blokovala ingest počas víkendu**
   - `canIngest: false` pre víkend/holiday
   - `ingestBatch()` vracala errors ak `canIngest = false`

3. **resolveEffectivePrice() vracala null počas víkendu**
   - Ak je víkend a nie je frozen price, vrátila `null`
   - To spôsobovalo "No price data" error

## 🔧 Implementované riešenia

### 1. Pridaný parameter `force` do `ingestBatch()`

**Súbor:** `pmp_prod/src/workers/polygonWorker.ts`

```typescript
export async function ingestBatch(
  tickers: string[],
  apiKey: string,
  force: boolean = false  // ← Nový parameter
): Promise<IngestResult[]> {
  // ...
  if (!pricingStateAtStart.canIngest && !force) {
    // Blokuje ingest iba ak nie je force
  }
}
```

### 2. Upravený `resolveEffectivePrice()` pre force ingest

**Súbor:** `pmp_prod/src/lib/utils/priceResolver.ts`

- Pridaný parameter `force: boolean = false`
- Ak je `force=true` a víkend, akceptuje `day.c` alebo `min.c` z Polygon API
- Markuje ceny ako `stale: true` (správne, pretože sú z predchádzajúceho trading dňa)

### 3. Upravený `normalizeSnapshot()` pre force ingest

**Súbor:** `pmp_prod/src/workers/polygonWorker.ts`

- Pridaný parameter `force: boolean = false`
- Predáva `force` do `resolveEffectivePrice()`

### 4. Vytvorený skript pre force ingest

**Súbor:** `pmp_prod/scripts/force-ingest-goog.ts`

- Používa `force=true` pre obídenie pricing state machine
- Špecificky pre GOOG a GOOGL

## ✅ Výsledok

**Ceny sa úspešne aktualizovali:**
- **GOOG:** $308.61 (z $299.25) ✅
- **GOOGL:** $307.16 (z $298.04) ✅
- **V aplikácii:** $308.61 ✅
- **Vek dát:** 0 dní, 0 hodín ✅

## 📋 Ďalšie kroky (odporúčané)

1. **Skontrolovať, prečo worker nebežal v piatok**
   - Možno problém s automatickým spustením
   - Možno worker zlyhával

2. **Pridať monitoring** pre detekciu, kedy worker nebeží
   - Alert ak worker neaktualizuje dáta > 24h

3. **Upraviť logiku** aby worker bežal aj počas trading hours, aj keď je víkend (pre catch-up)
   - Alebo automaticky spúšťať force ingest ak sú dáta staršie ako 24h

## 🔍 Technické detaily

### Zmeny v kóde:

1. **`pmp_prod/src/workers/polygonWorker.ts`:**
   - `ingestBatch()` - pridaný parameter `force`
   - `normalizeSnapshot()` - pridaný parameter `force`

2. **`pmp_prod/src/lib/utils/priceResolver.ts`:**
   - `resolveEffectivePrice()` - pridaný parameter `force`
   - Logika pre víkend s `force=true` - akceptuje `day.c` alebo `min.c`

3. **`pmp_prod/scripts/force-ingest-goog.ts`:**
   - Nový skript pre force ingest GOOG/GOOGL

### Použitie:

```bash
# Force ingest pre GOOG a GOOGL
npx tsx scripts/force-ingest-goog.ts
```

## 📊 Porovnanie pred/po

| Metrika | Pred | Po |
|---------|------|-----|
| **GOOG cena** | $299.25 | $308.61 |
| **GOOGL cena** | $298.04 | $307.16 |
| **Vek dát** | 4 dni | 0 dní |
| **Rozdiel od Nasdaq** | -3.1% | 0% ✅ |

## ✅ Status: DOKONČENÉ

Problém so starými cenami GOOG je vyriešený. Ceny sú teraz aktuálne a zhodujú sa s Nasdaq.


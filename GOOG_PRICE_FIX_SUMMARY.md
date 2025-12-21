# 🔧 Súhrn problému a riešenie pre staré ceny GOOG

## 📊 Zistený problém

### Hlavný problém:
**Cena GOOG je 4 dni stará** (z 17. decembra), zatiaľ čo aktuálna cena na Nasdaq je ~$308-309.

### Príčiny:

1. **Worker nebežal v piatok (20. december)**
   - Žiadne SessionPrice záznamy za 18., 19., 20. december
   - Posledný záznam je z 17. decembra (štvrtok)

2. **Pricing State Machine blokuje ingest počas víkendu**
   - `canIngest: false` pre víkend/holiday
   - `ingestBatch()` vracia errors ak `canIngest = false`

3. **resolveEffectivePrice() vracia null počas víkendu**
   - Ak je víkend a nie je frozen price, vráti `null`
   - To spôsobí "No price data" error

4. **Konflikt medzi main() a ingestBatch()**
   - `main()` má logiku pre ingest aj počas closed sessions
   - Ale `ingestBatch()` kontroluje `canIngest` na začiatku a blokuje ingest

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

**Výhody:**
- Umožňuje manuálne ingestovanie aj počas víkendu
- Zachováva ochranu pred nechcenými aktualizáciami v normálnom režime

### 2. Vytvorený skript pre force ingest

**Súbor:** `pmp_prod/scripts/force-ingest-goog.ts`

- Používa `force=true` pre obídenie pricing state machine
- Špecificky pre GOOG a GOOGL

## ⚠️ Aktuálny problém

**Force ingest stále zlyháva** s "No price data" error.

**Dôvod:**
- `resolveEffectivePrice()` vracia `null` pre víkend, ak nie je frozen price
- Worker nebežal v piatok, takže neexistujú after-hours ceny
- Polygon API možno vracia snapshot, ale `resolveEffectivePrice()` ho ignoruje

**Riešenie:**
Musíme upraviť `resolveEffectivePrice()` aby akceptovala ceny z Polygon API aj počas víkendu, ak je to force ingest.

## 📋 Ďalšie kroky

1. **Upraviť `resolveEffectivePrice()`** aby akceptovala ceny z Polygon API aj počas víkendu (ak je force ingest)
2. **Skontrolovať, prečo worker nebežal v piatok** - možno problém s automatickým spustením
3. **Pridať monitoring** pre detekciu, kedy worker nebeží
4. **Upraviť logiku** aby worker bežal aj počas trading hours, aj keď je víkend (pre catch-up)

## 🔍 Debug informácie

### Aktuálny stav (21. december 2025, sobota):
- **Session:** closed
- **Pricing State:** weekend_frozen
- **Can Ingest:** false (bez force)
- **Can Overwrite:** false
- **Use Frozen Price:** true

### Databázové dáta:
- **GOOG.lastPrice:** $299.25
- **GOOG.lastPriceUpdated:** 2025-12-17T13:18:07.000Z (4 dni stará)
- **GOOG.latestPrevClose:** $307.73
- **SessionPrice:** Iba 1 záznam z 17. decembra

### Očakávané hodnoty:
- **Nasdaq closing (19.12):** $308.61
- **Nasdaq after-hours (19.12):** $309.20
- **Rozdiel:** ~$9.36 (3.1% nižšia)


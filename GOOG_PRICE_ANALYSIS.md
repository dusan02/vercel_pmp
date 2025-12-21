# 🔍 Dôkladná analýza problému s cenou GOOG

## 📊 Zistené fakty

### Aktuálny stav (21. december 2025, sobota):
- **Cena v aplikácii:** $299.25
- **Cena na Nasdaq:** $308.61 (closing), $309.20 (after-hours)
- **Rozdiel:** ~$9.36 (3.1% nižšia)
- **Posledná aktualizácia v DB:** 2025-12-17T13:18:07.000Z (štvrtok)
- **Vek dát:** 4 dni, 2 hodiny

### Časové informácie:
- **Aktuálny čas (ET):** 2025-12-21T15:45:33.151Z
- **Session:** closed
- **Pricing State:** weekend_frozen
- **Can Ingest:** false ❌
- **Can Overwrite:** false ❌
- **Use Frozen Price:** true

### Databázové dáta:
- **Ticker.lastPrice:** $299.2505
- **Ticker.lastChangePct:** -2.76%
- **Ticker.lastPriceUpdated:** 2025-12-17T13:18:07.000Z
- **Ticker.latestPrevClose:** $307.73
- **SessionPrice záznamy:** Iba 1 záznam z 17. decembra (live session)
- **DailyRef:** Iba záznam z 17. decembra (bez regularClose)

## 🔍 Analýza príčin

### 1. Worker nebežal v piatok (20. december)

**Dôkaz:**
- Žiadne SessionPrice záznamy za 18., 19., 20. december
- Posledný záznam je z 17. decembra (štvrtok)

**Možné príčiny:**
- Worker nebol spustený
- Worker zlyhával
- Worker bežal, ale ingestBatch() vracal errors kvôli pricing state

### 2. Pricing State Machine blokuje ingest

**Problém:**
```typescript
// polygonWorker.ts, riadok 421
if (!pricingStateAtStart.canIngest) {
  return tickers.map(symbol => ({
    success: false,
    error: `Ingest disabled by pricing state: ${pricingStateAtStart.state}`
  }));
}
```

**Dôsledok:**
- Keď je víkend/holiday, `canIngest = false`
- Worker preskakuje ingest, aj keď by mal načítať aspoň previous closes
- Ceny sa neaktualizujú ani počas trading hours, ak worker nebežal

### 3. Worker main() má logiku, ale ingestBatch() ju ignoruje

**Konflikt:**
- `main()` v `ingestLoop()` má logiku pre ingest aj počas closed sessions (riadok 894-903)
- Ale `ingestBatch()` kontroluje `canIngest` na začiatku a vracia errors (riadok 421-431)
- To znamená, že aj keď `main()` chce ingestovať, `ingestBatch()` to blokuje

### 4. GOOG vs GOOGL problém

**Alphabet má dva tickery:**
- **GOOG** - Class C shares
- **GOOGL** - Class A shares

**Obe majú staré ceny:**
- GOOG: $299.25 (4 dni stará)
- GOOGL: $298.04 (4 dni stará)

## 💡 Riešenie

### Problém 1: Worker nebežal v piatok

**Riešenie:**
1. Spustiť worker manuálne pre načítanie aktuálnych cien
2. Skontrolovať, prečo worker nebežal automaticky

### Problém 2: Pricing State blokuje ingest

**Problém:**
`ingestBatch()` kontroluje `canIngest` na začiatku a vracia errors, čo blokuje aj manuálne ingestovanie.

**Riešenie:**
Upraviť `ingestBatch()` aby:
1. Ak je `canIngest = false`, ale je to víkend/holiday, aspoň načíta previous closes
2. Alebo pridať parameter `force: boolean` pre manuálne ingestovanie

### Problém 3: Konflikt medzi main() a ingestBatch()

**Riešenie:**
Upraviť `ingestBatch()` aby rešpektovala logiku z `main()`:
- Ak je víkend/holiday, aspoň bootstrap previous closes
- Ak je closed (ale nie víkend), ingestovať dostupné ceny

## 🔧 Okamžité opatrenia

1. **Spustiť force ingest** pre GOOG/GOOGL
2. **Skontrolovať worker status** - či beží automaticky
3. **Upraviť ingestBatch()** aby neblokovala ingest úplne

## 📊 Porovnanie cien

| Zdroj | Cena | Dátum | Rozdiel |
|-------|------|-------|---------|
| **Nasdaq (closing)** | $308.61 | 19.12.2025 | - |
| **Nasdaq (after-hours)** | $309.20 | 19.12.2025 | - |
| **Aplikácia (DB)** | $299.25 | 17.12.2025 | **-$9.36 (-3.1%)** |
| **Očakávaná** | ~$308-309 | 19-20.12.2025 | - |

**Záver:** Cena v aplikácii je **3.1% nižšia** ako aktuálna cena na Nasdaq.


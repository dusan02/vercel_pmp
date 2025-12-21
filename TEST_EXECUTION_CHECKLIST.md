# 🧪 Test Execution Checklist

## ✅ Krok 1: Spusti testy lokálne (deterministicky)

Spusť **presne v tomto poradí**:

```bash
# 1) Len unit testy (najprv čistá logika)
npm test -- priceResolver pricingStateMachine

# 2) Integračné testy workeru
npm test -- polygonWorker.integration

# 3) Všetko dokopy
npm test

# 4) Coverage
npm run test:coverage
```

### Očakávania

- ❌ **žiadne flaky testy**
- ❌ žiadna závislosť od aktuálneho dátumu/času (DST-safe helper to má odstrániť)
- ✅ integračné testy bežia izolovane (in-memory DB + mock Redis)

**Ak čo i len jeden test padne sporadicky, je to blocker!**

---

## 🔒 Krok 2: Coverage hranice (zamknuté)

**Nastavené v `jest.config.js`:**

```javascript
coverageThreshold: {
  global: {
    branches: 85,
    functions: 90,
    lines: 90,
    statements: 90,
  },
  // Core pricing logic must be near 100%
  './src/lib/utils/priceResolver.ts': {
    branches: 95,
    functions: 100,
    lines: 95,
    statements: 95,
  },
  './src/lib/utils/pricingStateMachine.ts': {
    branches: 95,
    functions: 100,
    lines: 95,
    statements: 95,
  },
  './src/lib/utils/dateET.ts': {
    branches: 90,
    functions: 100,
    lines: 90,
    statements: 90,
  },
}
```

**Ak coverage klesne pod tieto hodnoty, build zlyhá.**

---

## 🧨 Krok 3: Anti-regression testy (pridané)

### 1️⃣ DST switch day handling ✅

**Testy:**

- DST switch v marci (EST -> EDT)
- DST switch v novembri (EDT -> EST)
- Session boundaries počas DST switch

**Cieľ:** Overiť, že DST-safe helper funguje správne.

---

### 2️⃣ Mixed timestamp formats (ms + ns) ✅

**Testy:**

- Snapshot s `updated` v ns a `lastTrade.t` v ms
- Porovnanie ns a ms timestampov (nesmie porovnávať neprekonvertované)

**Cieľ:** Overiť, že `nsToMs()` správne konvertuje.

---

### 3️⃣ Fallback reference label ✅

**Testy:**

- After-hours bez `regularClose` → fallback na `previousClose`
- Preferencia `regularClose` keď obe sú dostupné
- Null reference keď obe chýbajú

**Cieľ:** Overiť, že `reference.used` je správne nastavené pre UI.

---

## ⚙️ Krok 4: CI Configuration (pridané)

**GitHub Actions workflow:** `.github/workflows/test.yml`

**Funkcie:**

- ✅ Testy v 3 timezónach (UTC, America/New_York, Europe/Prague)
- ✅ Coverage check pre kritické súbory
- ✅ Fail build ak coverage klesne
- ✅ Upload coverage do Codecov

**Spustenie:**

- Automaticky pri push/PR
- Manuálne: `workflow_dispatch`

---

## 📋 Test Coverage Summary

### Unit Testy

- ✅ `priceResolver.test.ts`: 16 testov (vrátane 3 anti-regression)
- ✅ `pricingStateMachine.test.ts`: 13 testov
- **Celkom: 29 unit testov**

### Integračné Testy

- ✅ `polygonWorker.integration.test.ts`: 3 kritické testy
- **Celkom: 3 integračné testy**

### Anti-Regression Testy

- ✅ DST switch handling (3 testy)
- ✅ Mixed timestamp formats (2 testy)
- ✅ Fallback reference label (3 testy)
- **Celkom: 8 anti-regression testov**

---

## 🚀 Spustenie testov

### Lokálne

```bash
# Všetky testy
npm test

# Len unit testy
npm test -- priceResolver pricingStateMachine

# Len integračné testy
npm test -- polygonWorker.integration

# S coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### V CI

Testy sa spustia automaticky pri:

- Push do `main` alebo `develop`
- Pull request do `main` alebo `develop`

---

## ✅ Checklist pred merge

- [ ] Všetky testy prechádzajú lokálne
- [ ] Coverage threshold je splnený
- [ ] Žiadne flaky testy
- [ ] CI testy prechádzajú
- [ ] Anti-regression testy prechádzajú
- [ ] DST switch testy prechádzajú

---

## 🎯 Výsledok

**Všetky kritické invarianty sú pokryté testami:**

- ✅ Price <= 0 never upserted
- ✅ Frozen prices never overwritten
- ✅ State-aware timestamp validation
- ✅ Adjusted consistency
- ✅ Session boundary handling
- ✅ Nanosecond timestamp handling
- ✅ DST-safe date operations
- ✅ DST switch handling
- ✅ Mixed timestamp format handling
- ✅ Fallback reference label

**Systém je teraz chránený proti regresiám!**

---

## 📝 Poznámky

### Flaky Testy

Ak test padá sporadicky:

1. Skontroluj časové závislosti
2. Skontroluj mocky (môžu byť nekonzistentné)
3. Skontroluj DST handling

### Coverage

Ak coverage klesne:

1. Pridaj testy pre chýbajúce scenáre
2. Skontroluj, či sú všetky branchy pokryté
3. Skontroluj, či sú všetky funkcie testované

### CI Failures

Ak CI zlyhá:

1. Skontroluj lokálne testy (mali by zlyhávať rovnako)
2. Skontroluj timezone handling
3. Skontroluj coverage thresholds

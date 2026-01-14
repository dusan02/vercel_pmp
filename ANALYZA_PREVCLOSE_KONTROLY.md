# Analýza automatických kontrol previousClose a návrh vylepšení

## 📊 Existujúce automatické kontroly

### 1. **Daily Integrity Check** (`/api/cron/daily-integrity`)
**Kedy beží:** Nie je v vercel.json (možno manuálne alebo externý scheduler)

**Čo kontroluje:**
- ✅ `missing_prev_close` - chýbajúca previousClose
- ✅ `stale_prev_close_date` - zastaralý dátum previousClose
- ✅ `change_pct_mismatch` - nesúlad vypočítaného % change so stored hodnotou
- ✅ `invalid_change_pct` - neplatný % change

**Čo NEPOROVNÁVA:**
- ❌ **NEPOROVNÁVA skutočnú hodnotu previousClose s Polygon API!**
- ❌ Ak je previousClose prítomný, ale nesprávny (ako v prípade MSFT), integrity check to nezistí

**Auto-fix:**
- ✅ Opravuje len `missing_prev_close` (max 150 tickerov)
- ❌ **NEOPRAVUJE nesprávne hodnoty previousClose** (kde je hodnota prítomná, ale zlá)

### 2. **Update Static Data** (`/api/cron/update-static-data`)
**Kedy beží:** Denně o 06:00 UTC (01:00 ET) - `vercel.json`

**Čo robí:**
- ✅ Resetuje VŠETKY previousClose hodnoty v DB
- ✅ Bootstraps previousClose z Polygon pre všetky tickery
- ✅ Aktualizuje sharesOutstanding

**Problémy:**
- ⚠️ Resetuje všetko, aj keď väčšina hodnôt je správna
- ⚠️ Spúšťa sa len raz denne - ak sa hodnota zmení počas dňa, zostane nesprávna až do ďalšieho dňa
- ⚠️ Môže byť príliš agresívne (resetuje aj správne hodnoty)

### 3. **Polygon Worker** (`saveRegularClose`)
**Kedy beží:** Po ukončení trading session

**Čo robí:**
- ✅ Aktualizuje `regularClose` pre daný deň
- ✅ Aktualizuje `previousClose` pre zajtra (z dnešného regularClose)
- ✅ Aktualizuje `Ticker.latestPrevClose`

**Problémy:**
- ⚠️ Aktualizuje len pre tickery, ktoré majú regularClose
- ⚠️ Neoveruje, či existujúce previousClose hodnoty sú správne

## 🔍 Identifikovaný problém

**Prípad MSFT:**
- DB mal: `$477.18` (nesprávne)
- Polygon API má: `$470.67` (správne)
- Rozdiel: `$6.51` (1.38%)

**Prečo to integrity check nezistil:**
1. Integrity check kontroluje len `missing_prev_close` a `stale_prev_close_date`
2. MSFT mal previousClose prítomný a dátum bol správny
3. Integrity check NEPOROVNÁVA hodnotu s Polygon API
4. `change_pct_mismatch` môže signalizovať problém, ale neoveruje zdroj (previousClose)

## 💡 Návrh vylepšení

### 1. **Pridať kontrolu nesprávnych previousClose hodnôt do Integrity Check**

**Nový integrity issue code:** `incorrect_prev_close`

**Logika:**
- Pre tickery s `latestPrevClose > 0` a `lastPrice > 0`
- Porovnať `latestPrevClose` s Polygon API (`/prev` endpoint)
- Ak rozdiel > 0.01 (1 cent), označiť ako problém
- V `fix` móde automaticky opraviť (s rate limiting)

**Výhody:**
- Zistí problémy, ktoré sú teraz skryté
- Môže automaticky opraviť
- Integrácia do existujúceho integrity check systému

### 2. **Vytvoriť samostatný cron job na kontrolu previousClose**

**Nový endpoint:** `/api/cron/verify-prevclose`

**Čo robí:**
- Kontroluje všetky tickery s previousClose
- Porovnáva s Polygon API
- Opravuje nesprávne hodnoty (s rate limiting)
- Spúšťa sa 2-3x denne (napr. 08:00, 14:00, 20:00 ET)

**Výhody:**
- Rýchlejšia detekcia problémov
- Menej agresívne ako full reset
- Môže bežať častejšie

### 3. **Vylepšiť Update Static Data**

**Zmeny:**
- Namiesto full resetu, najprv skontrolovať, ktoré hodnoty sú nesprávne
- Resetovať len nesprávne hodnoty
- Alebo úplne odstrániť reset a len aktualizovať nesprávne hodnoty

**Výhody:**
- Menej agresívne
- Rýchlejšie (menej API volaní)
- Zachová správne hodnoty

### 4. **Batch fix skript pre manuálnu opravu**

**Skript:** `scripts/batch-fix-prevclose.ts` (už vytvorený)

**Použitie:**
- Manuálna oprava všetkých problémov naraz
- Môže bežať ako fallback, ak automatické kontroly zlyhajú

## 🎯 Odporúčaný plán implementácie

### Fáza 1: Okamžité riešenie (hotovo ✅)
- ✅ Batch fix skript (`batch-fix-prevclose.ts`)
- ✅ Manuálna oprava MSFT

### Fáza 2: Vylepšenie Integrity Check (priorita: VYSOKÁ)
- Pridať kontrolu `incorrect_prev_close`
- Pridať auto-fix pre nesprávne hodnoty
- Integrácia do existujúceho integrity check systému

### Fáza 3: Nový cron job (priorita: STREDNÁ)
- Vytvoriť `/api/cron/verify-prevclose`
- Spúšťať 2-3x denne
- Menej agresívne ako full reset

### Fáza 4: Optimalizácia Update Static Data (priorita: NÍZKA)
- Zmeniť z full resetu na selektívnu opravu
- Alebo úplne odstrániť reset

## 📝 Detaily implementácie

### Integrity Check vylepšenie

```typescript
// Nový integrity issue
'incorrect_prev_close'

// Kontrola (v dailyIntegrityCheck.ts)
if (price > 0 && prevClose > 0) {
  // Fetch from Polygon API
  const correctPrevClose = await fetchPreviousCloseFromPolygon(symbol);
  if (correctPrevClose && Math.abs(prevClose - correctPrevClose) > 0.01) {
    addIssue(byCode, 'incorrect_prev_close', symbol, maxSamplesPerIssue);
    incorrectPrevCloseSymbols.push(symbol);
  }
}

// Auto-fix
if (fix && incorrectPrevCloseSymbols.length > 0) {
  // Fix with rate limiting (max 100 tickers)
  const toFix = incorrectPrevCloseSymbols.slice(0, 100);
  // ... fix logic
}
```

### Nový cron job

```typescript
// /api/cron/verify-prevclose/route.ts
// - Kontroluje všetky tickery s previousClose
// - Porovnáva s Polygon API
// - Opravuje nesprávne hodnoty
// - Rate limiting: max 200 tickerov per run
```

## ⚠️ Dôležité poznámky

1. **Rate Limiting:** Polygon API má limit 5 req/sec (free tier) alebo 200 req/min (paid)
2. **Caching:** Použiť cache pre Polygon API responses (24h TTL)
3. **Monitoring:** Logovať všetky opravy pre audit trail
4. **Error Handling:** Graceful degradation ak Polygon API zlyhá

## 🔄 Monitoring a alerting

- Logovať počet opravených tickerov
- Alert ak > 10% tickerov má nesprávne previousClose
- Dashboard pre integrity check výsledky

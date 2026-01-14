# Implementácia vylepšení previousClose kontrol

## ✅ Čo bolo implementované

### 1. **Vylepšený Daily Integrity Check**
**Súbor:** `src/lib/jobs/dailyIntegrityCheck.ts`

**Nové funkcie:**
- ✅ Nový integrity issue code: `incorrect_prev_close`
- ✅ Kontrola nesprávnych previousClose hodnôt (porovnanie s Polygon API)
- ✅ Auto-fix pre nesprávne hodnoty (s rate limiting)
- ✅ Nová opcia `verifyPrevCloseValues` (default: false, aby sa predišlo nadmerným API volaniam)

**Použitie:**
```typescript
// V integrity check s verifikáciou previousClose
const summary = await runDailyIntegrityCheck({
  fix: true,
  verifyPrevCloseValues: true, // Povoliť kontrolu previousClose hodnôt
  fixIncorrectPrevCloseMaxTickers: 100 // Max počet tickerov na opravu
});
```

**Poznámka:** `verifyPrevCloseValues` je default `false`, pretože:
- Môže byť pomalé (API volania pre každý ticker)
- Môže spôsobiť rate limiting
- Odporúča sa zapnúť len pri špeciálnych kontrolách

### 2. **Nový Cron Job: Verify PreviousClose**
**Súbor:** `src/app/api/cron/verify-prevclose/route.ts`

**Čo robí:**
- Kontroluje všetky tickery s previousClose
- Porovnáva DB hodnoty s Polygon API
- Opravuje nesprávne hodnoty (s rate limiting)
- Menej agresívne ako full reset

**Použitie:**
```bash
# POST request (s autorizáciou)
POST /api/cron/verify-prevclose
Authorization: Bearer ${CRON_SECRET_KEY}

# Query params:
?limit=200          # Max počet tickerov na kontrolu (default: 200)
&dryRun=true        # Len zobrazí problémy, bez opravy (default: false)
```

**GET endpoint (pre testovanie):**
```bash
# Test s 10 tickermi (dry run)
GET /api/cron/verify-prevclose?limit=10&dryRun=true

# Test s opravou
GET /api/cron/verify-prevclose?limit=10&dryRun=false
```

**Response:**
```json
{
  "success": true,
  "message": "PreviousClose verification completed",
  "result": {
    "checked": 200,
    "needsFix": 5,
    "fixed": 5,
    "errors": 0,
    "issues": [
      {
        "ticker": "MSFT",
        "dbValue": 477.18,
        "correctValue": 470.67,
        "diff": 6.51
      }
    ]
  },
  "summary": {
    "duration": "45.23s",
    "dryRun": false
  }
}
```

### 3. **Batch Fix Skript**
**Súbor:** `scripts/batch-fix-prevclose.ts` (už existoval, teraz je vylepšený)

**Použitie:**
```bash
cd /var/www/premarketprice

# Dry run - len zobrazí problémy
npx tsx scripts/batch-fix-prevclose.ts --dry-run

# Skutočná oprava
npx tsx scripts/batch-fix-prevclose.ts

# Limitovaný počet tickerov
npx tsx scripts/batch-fix-prevclose.ts --limit=100
```

## 📅 Odporúčaná konfigurácia cron jobov

### Vercel Cron Jobs (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/cron/verify-prevclose",
      "schedule": "0 8,14,20 * * *"  // 08:00, 14:00, 20:00 UTC (03:00, 09:00, 15:00 ET)
    },
    {
      "path": "/api/cron/update-static-data",
      "schedule": "0 6 * * *"  // 06:00 UTC (01:00 ET) - full reset
    },
    {
      "path": "/api/cron/daily-integrity",
      "schedule": "0 7 * * *"  // 07:00 UTC (02:00 ET) - integrity check
    }
  ]
}
```

**Poznámka:** 
- `verify-prevclose` beží 3x denne - rýchla detekcia problémov
- `update-static-data` beží raz denne - full reset (môže byť v budúcnosti optimalizované)
- `daily-integrity` beží raz denne - všeobecná kontrola (s `verifyPrevCloseValues=false` pre rýchlosť)

### Alternatíva: Použiť verify-prevclose namiesto full resetu

Ak chcete menej agresívny prístup, môžete:
1. Zmeniť `update-static-data` aby nerestoval všetko
2. Použiť `verify-prevclose` ako hlavný mechanizmus kontroly
3. `update-static-data` len pre chýbajúce hodnoty

## 🔧 Ako používať

### Manuálna kontrola a oprava

```bash
# 1. Skontrolovať konkrétny ticker
cd /var/www/premarketprice
npx tsx scripts/fix-closing-price.ts MSFT

# 2. Batch kontrola (dry run)
npx tsx scripts/batch-fix-prevclose.ts --dry-run

# 3. Batch oprava
npx tsx scripts/batch-fix-prevclose.ts
```

### Automatická kontrola cez API

```bash
# Test verify-prevclose (dry run)
curl -X GET "http://localhost:3000/api/cron/verify-prevclose?limit=10&dryRun=true"

# Produkcia (s autorizáciou)
curl -X POST "https://premarketprice.com/api/cron/verify-prevclose?limit=200" \
  -H "Authorization: Bearer ${CRON_SECRET_KEY}"
```

### Integrity Check s verifikáciou previousClose

```typescript
// V kóde alebo skripte
import { runDailyIntegrityCheck } from '@/lib/jobs/dailyIntegrityCheck';

const summary = await runDailyIntegrityCheck({
  fix: true,
  verifyPrevCloseValues: true, // Povoliť kontrolu
  fixIncorrectPrevCloseMaxTickers: 100
});
```

## ⚠️ Dôležité poznámky

### Rate Limiting
- Polygon API má limit: 5 req/sec (free) alebo 200 req/min (paid)
- Všetky skripty používajú konzervatívne rate limiting (3 concurrent requests)
- Medzi batchmi je 200ms delay

### Performance
- `verifyPrevCloseValues=true` môže byť pomalé (API volanie pre každý ticker)
- Odporúča sa používať len pri špeciálnych kontrolách
- Pre denné integrity check používať `verifyPrevCloseValues=false`
- `verify-prevclose` cron job je optimalizovaný (limit 200 tickerov)

### Monitoring
- Všetky opravy sú logované
- Response obsahuje zoznam opravených tickerov
- Integrity check summary obsahuje štatistiky

## 🎯 Ďalšie kroky (voliteľné)

### Fáza 4: Optimalizácia Update Static Data
- Zmeniť z full resetu na selektívnu opravu
- Alebo úplne odstrániť reset a používať len verify-prevclose

**Implementácia:**
1. V `update-static-data/route.ts` zmeniť logiku:
   - Namiesto full resetu, najprv skontrolovať, ktoré hodnoty sú nesprávne
   - Resetovať len nesprávne hodnoty
   - Alebo úplne odstrániť reset a len aktualizovať chýbajúce hodnoty

## 📊 Porovnanie riešení

| Riešenie | Agresivita | Rýchlosť | Použitie |
|----------|------------|----------|----------|
| `update-static-data` | Vysoká (reset všetko) | Pomalá | Raz denne |
| `verify-prevclose` | Nízka (len opravy) | Rýchla | 2-3x denne |
| `daily-integrity` (s verify) | Stredná | Pomalá | Raz denne (špeciálne) |
| `batch-fix-prevclose` | Nízka | Stredná | Manuálne |

## ✅ Testovanie

### Lokálne testovanie

```bash
# 1. Test integrity check s verifikáciou
npx tsx scripts/daily-integrity-check.ts --fix

# 2. Test verify-prevclose endpoint
curl -X GET "http://localhost:3000/api/cron/verify-prevclose?limit=5&dryRun=true"

# 3. Test batch fix
npx tsx scripts/batch-fix-prevclose.ts --dry-run --limit=10
```

### Produkcia

```bash
# 1. Test verify-prevclose (dry run)
curl -X POST "https://premarketprice.com/api/cron/verify-prevclose?limit=50&dryRun=true" \
  -H "Authorization: Bearer ${CRON_SECRET_KEY}"

# 2. Skutočná oprava (malý limit pre test)
curl -X POST "https://premarketprice.com/api/cron/verify-prevclose?limit=10" \
  -H "Authorization: Bearer ${CRON_SECRET_KEY}"

# 3. Batch fix (ak je potrebný)
cd /var/www/premarketprice
npx tsx scripts/batch-fix-prevclose.ts --limit=100
```

## 🎉 Výsledok

Teraz máte:
- ✅ Automatickú kontrolu nesprávnych previousClose hodnôt
- ✅ Automatickú opravu problémov (s rate limiting)
- ✅ Menej agresívny prístup (len opravy, nie full reset)
- ✅ Flexibilné riešenie (manuálne aj automatické)
- ✅ Monitoring a logging

Problém s MSFT (a podobné problémy) by sa teraz mali automaticky zistiť a opraviť!

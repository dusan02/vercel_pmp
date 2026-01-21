# Analýza možností na ďalší refaktoring

## Zistené problémy a duplicitný kód

### 1. 🔴 VYSOKÁ PRIORITA: Duplicitné Polygon API funkcie

**Problém:**
- `check-premarket-movements/route.ts` má vlastné `fetchPolygonSnapshot()` a `fetchPolygonPreviousClose()` funkcie
- Tieto funkcie už existujú v `src/lib/utils/polygonApiHelpers.ts`
- **Duplicitný kód:** ~60 riadkov

**Riešenie:**
- Odstrániť duplicitné funkcie z `check-premarket-movements/route.ts`
- Použiť import z `polygonApiHelpers.ts`
- **Úspora:** ~60 riadkov

---

### 2. 🔴 VYSOKÁ PRIORITA: Duplicitná autorizačná logika

**Problém:**
- Autorizačná logika sa opakuje v 6+ cron joboch:
  - `update-static-data/route.ts`
  - `verify-prevclose/route.ts`
  - `check-premarket-movements/route.ts`
  - `verify-sector-industry/route.ts`
  - `daily-integrity/route.ts`
  - `earnings-calendar/route.ts`

**Kód:**
```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Riešenie:**
- Vytvoriť `src/lib/utils/cronAuth.ts` s funkciou `verifyCronAuth(request)`
- Použiť middleware alebo helper funkciu
- **Úspora:** ~6-12 riadkov × 6 súborov = 36-72 riadkov

---

### 3. 🟡 STREDNÁ PRIORITA: Lokálne update funkcie

**Problém:**
- `updateSharesOutstanding()` a `updatePreviousClose()` sú lokálne funkcie v `update-static-data/route.ts`
- Tieto funkcie by mohli byť použité aj v iných cron joboch alebo skriptoch
- **Kód:** ~72 riadkov

**Riešenie:**
- Extrahovať do `src/lib/utils/tickerUpdates.ts`
- Vytvoriť znovupoužiteľné funkcie:
  - `updateTickerSharesOutstanding(ticker: string): Promise<boolean>`
  - `updateTickerPreviousClose(ticker: string): Promise<boolean>`
- **Úspora:** ~72 riadkov (presun do utility)

---

### 4. 🟡 STREDNÁ PRIORITA: Duplicitné error handling patterns

**Problém:**
- Podobné try-catch bloky s NextResponse.json v rôznych cron joboch:
```typescript
catch (error) {
  console.error('❌ Error in ...:', error);
  return NextResponse.json({
    success: false,
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'Unknown error',
    timestamp: new Date().toISOString(),
  }, { status: 500 });
}
```

**Riešenie:**
- Vytvoriť `src/lib/utils/cronErrorHandler.ts` s funkciou:
  - `handleCronError(error: unknown, jobName: string): NextResponse`
- **Úspora:** ~10 riadkov × 6 súborov = 60 riadkov

---

### 5. 🟢 NÍZKA PRIORITA: GET endpoint patterns

**Problém:**
- Niektoré cron joby majú GET endpointy s podobnou logikou
- `check-premarket-movements/route.ts` má GET endpoint, ktorý len volá POST
- `update-static-data/route.ts` má GET endpoint s test limitom

**Riešenie:**
- Vytvoriť helper pre GET endpointy, ktoré len volajú POST
- Alebo zjednodušiť existujúce GET endpointy
- **Úspora:** ~15-20 riadkov

---

### 6. 🟢 NÍZKA PRIORITA: Podobné response formáty

**Problém:**
- Všetky cron joby vracajú podobné JSON response formáty:
  - `success: boolean`
  - `message: string`
  - `results: {...}`
  - `timestamp: string`

**Riešenie:**
- Vytvoriť helper funkciu `createCronResponse()` pre konzistentné formáty
- **Úspora:** ~5-10 riadkov × 6 súborov = 30-60 riadkov

---

## Odhadovaná úspora

| Priorita | Problém | Odhadovaná úspora |
|----------|---------|-------------------|
| 🔴 Vysoká | Duplicitné Polygon API funkcie | ~60 riadkov |
| 🔴 Vysoká | Duplicitná autorizácia | ~36-72 riadkov |
| 🟡 Stredná | Lokálne update funkcie | ~72 riadkov |
| 🟡 Stredná | Error handling patterns | ~60 riadkov |
| 🟢 Nízka | GET endpoint patterns | ~15-20 riadkov |
| 🟢 Nízka | Response formáty | ~30-60 riadkov |
| **CELKOM** | | **~273-344 riadkov** |

---

## Odporúčaný postup

### Fáza 1: Vysoká priorita (okamžite)
1. ✅ Odstrániť duplicitné Polygon API funkcie z `check-premarket-movements/route.ts`
2. ✅ Vytvoriť `cronAuth.ts` utility pre autorizáciu

### Fáza 2: Stredná priorita (v blízkej budúcnosti)
3. ✅ Extrahovať `updateSharesOutstanding` a `updatePreviousClose` do `tickerUpdates.ts`
4. ✅ Vytvoriť `cronErrorHandler.ts` pre konzistentné error handling

### Fáza 3: Nízka priorita (voliteľné)
5. ⚪ Zjednodušiť GET endpoint patterns
6. ⚪ Vytvoriť helper pre response formáty

---

## Výhody refaktoringu

1. **Eliminácia duplicitného kódu** - menej kódu na údržbu
2. **Konzistentnosť** - rovnaké patterns v celom codebase
3. **Znovupoužiteľnosť** - utility funkcie môžu byť použité všade
4. **Testovateľnosť** - utility funkcie sa dajú testovať samostatne
5. **Čitateľnosť** - hlavné súbory sú kratšie a zamerané na business logiku

---

## Poznámky

- Všetky navrhované zmeny sú **backward compatible**
- Žiadne breaking changes
- Utility moduly môžu byť postupne adoptované v rôznych cron joboch
- Refaktoring môže byť robený postupne, nie naraz

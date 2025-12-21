# 🔍 Price & Percent Change Calculation Issues

## 📋 Summary

Kontrola logiky výpočtu cien a percentuálnych zmien odhalila **nekonzistentnosť** v používaní dvoch rôznych funkcií:

1. ✅ **`calculatePercentChange()`** (`priceResolver.ts`) - **SPRÁVNA**
   - Session-aware (berie do úvahy pre/live/after/closed)
   - Používa `regularClose` pre after-hours sessions
   - Používa `previousClose` pre pre-market a live sessions

2. ⚠️ **`computePercentChange()`** (`marketCapUtils.ts`) - **NESPRÁVNA pre after-hours**
   - **NIE JE** session-aware
   - **VŽDY** používa len `previousClose`
   - **NEPOUŽÍVA** `regularClose` pre after-hours sessions

## 🔍 Test Results

```
Test Case: After-hours session (with regularClose)
Current Price: $150
Previous Close: $145
Regular Close: $148

calculatePercentChange: 1.35% (vs regularClose $148) ✅ SPRÁVNE
computePercentChange: 3.45% (vs previousClose $145) ❌ NESPRÁVNE
```

**Rozdiel:** 2.1% - významný rozdiel pre after-hours sessions!

## 📍 Miesta, kde sa používa `computePercentChange()` (nesprávne)

1. **`/api/heatmap`** (riadok 459, 503)
   - Počíta percentuálne zmeny pre heatmap
   - **Problém:** Po after-hours používa previousClose namiesto regularClose

2. **`/api/stocks/bulk`** (riadok 85)
   - Bulk fetching akcií
   - **Problém:** Po after-hours používa previousClose namiesto regularClose

3. **`/api/earnings-finnhub`** (riadok 396)
   - Earnings calendar s cenami
   - **Problém:** Po after-hours používa previousClose namiesto regularClose

4. **`/api/earnings/yahoo`** (riadok 181)
   - Yahoo earnings data
   - **Problém:** Po after-hours používa previousClose namiesto regularClose

5. **`/api/prices`** (riadok 116)
   - Price endpoint
   - **Problém:** Po after-hours používa previousClose namiesto regularClose

## ✅ Miesta, kde sa používa `calculatePercentChange()` (správne)

1. **`polygonWorker.ts`** (riadok 180)
   - Normalizácia snapshot dát
   - ✅ **SPRÁVNE** - používa session-aware logiku

2. **`stockService.ts`** (riadok 119)
   - Načítavanie dát pre stocks list
   - ✅ **SPRÁVNE** - používa session-aware logiku

## ✅ Riešenie (IMPLEMENTOVANÉ)

**Zvolené riešenie:** Upravená `computePercentChange()` aby brala voliteľné parametre `session` a `regularClose`.

**Výhody:**
- ✅ Zachovaná spätná kompatibilita
- ✅ Menej zmien v kóde
- ✅ Centralizovaná logika
- ✅ Session-aware logika pre after-hours sessions

## 🔧 Implementácia

### 1. Upravená `computePercentChange()` funkcia

```typescript
// marketCapUtils.ts
export function computePercentChange(
  currentPrice: number, 
  prevClose: number,
  session?: 'pre' | 'live' | 'after' | 'closed',
  regularClose?: number | null
): number {
  // If session-aware parameters are provided, use calculatePercentChange logic
  if (session !== undefined) {
    try {
      const { calculatePercentChange } = require('./priceResolver');
      const result = calculatePercentChange(currentPrice, session, prevClose, regularClose || null);
      return Math.round(result.changePct * 100) / 100;
    } catch (error) {
      console.error('Error in session-aware percent change calculation:', error);
      // Fallback to simple calculation
    }
  }
  
  // Simple calculation (backward compatibility)
  // ... (pôvodná logika)
}
```

### 2. Aktualizované endpointy

✅ **`/api/heatmap`** - pridaná session detekcia a regularClose map
✅ **`/api/stocks/bulk`** - pridaná session detekcia a regularClose map
✅ **`/api/earnings-finnhub`** - pridaná session detekcia a regularClose map
✅ **`/api/earnings/yahoo`** - pridaná session detekcia a regularClose map
⚠️ **`/api/prices`** - deprecated endpoint, nie je potrebné aktualizovať

### 3. Test výsledky

```
After-hours session (with regularClose):
- calculatePercentChange: 1.35% (vs regularClose $148) ✅
- computePercentChange (NEW): 1.35% (vs regularClose $148) ✅
- computePercentChange (OLD): 3.45% (vs previousClose $145) ❌
```

**Všetky testy prechádzajú!** ✅

## 📊 Impact

**Vysoký** - po after-hours (16:00-04:00 ET) sa zobrazujú nesprávne percentuálne zmeny vo viacerých endpointoch.

**Príklad:**
- Akcia: $150 (after-hours)
- Previous Close: $145 (včera)
- Regular Close: $148 (dnes)

**Aktuálne (nesprávne):** +3.45% (vs $145)
**Správne:** +1.35% (vs $148)

**Rozdiel:** 2.1% - významný pre používateľov!


# ✅ Oprava výpočtu percentuálnych zmien - Súhrn

## 📋 Problém

Nekonzistentnosť v výpočte percentuálnych zmien:
- `calculatePercentChange()` - správna, session-aware logika
- `computePercentChange()` - nesprávna, vždy používala len `previousClose`

**Dôsledok:** Po after-hours (16:00-04:00 ET) sa zobrazovali nesprávne percentuálne zmeny vo viacerých endpointoch.

## ✅ Riešenie

1. **Upravená `computePercentChange()`** - pridané voliteľné parametre `session` a `regularClose`
2. **Aktualizované endpointy** - všetky používajú session-aware logiku
3. **Zachovaná spätná kompatibilita** - staré volania stále fungujú

## 📝 Zmeny

### 1. `src/lib/utils/marketCapUtils.ts`
- ✅ Pridané voliteľné parametre `session` a `regularClose`
- ✅ Ak sú poskytnuté, používa `calculatePercentChange()` interné
- ✅ Zachovaná spätná kompatibilita

### 2. `src/app/api/heatmap/route.ts`
- ✅ Pridaná session detekcia (`detectSession`, `nowET`)
- ✅ Pridaná regularClose mapa z DailyRef
- ✅ Aktualizované volania `computePercentChange()` s session a regularClose

### 3. `src/app/api/stocks/bulk/route.ts`
- ✅ Pridaná session detekcia
- ✅ Pridaná regularClose mapa z DailyRef
- ✅ Aktualizované volanie `computePercentChange()` s session a regularClose

### 4. `src/app/api/earnings-finnhub/route.ts`
- ✅ Pridaná session detekcia
- ✅ Pridaná regularClose mapa z DailyRef (batch fetch)
- ✅ Aktualizované volanie `computePercentChange()` v `enrichEarningsData()`

### 5. `src/app/api/earnings/yahoo/route.ts`
- ✅ Pridaná session detekcia
- ✅ Pridaná regularClose mapa z DailyRef (batch fetch)
- ✅ Aktualizované volanie `computePercentChange()` v `convertToEarningsData()`

## 🧪 Testy

Všetky testy prechádzajú:
- ✅ Pre-market: správne používa previousClose
- ✅ Live: správne používa previousClose
- ✅ After-hours (s regularClose): správne používa regularClose
- ✅ After-hours (bez regularClose): fallback na previousClose

## 📊 Impact

**Vysoký** - po after-hours sa teraz zobrazujú správne percentuálne zmeny vo všetkých endpointoch.

**Príklad:**
- Akcia: $150 (after-hours)
- Previous Close: $145 (včera)
- Regular Close: $148 (dnes)

**Pred opravou:** +3.45% (vs $145) ❌
**Po oprave:** +1.35% (vs $148) ✅

**Rozdiel:** 2.1% - významný pre používateľov!

## 🔄 Backward Compatibility

✅ Staré volania `computePercentChange(price, prevClose)` stále fungujú
✅ Nové volania `computePercentChange(price, prevClose, session, regularClose)` používajú session-aware logiku

## 📅 Dátum implementácie

2025-12-21


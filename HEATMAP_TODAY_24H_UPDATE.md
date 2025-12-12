# Heatmap.today - 24h Okno Update

**Dátum:** 2025-01-26  
**Cieľ:** Zjednotiť dáta medzi tabuľkami a heatmapou na 24h okno pre heatmap.today

---

## ✅ Vykonané Zmeny

### 1. **Heatmap API (`/api/heatmap/route.ts`)**

#### Zmena časového okna:
- **Pred:** 7 dní (`DAYS_BACK: 7`)
- **Po:** 24 hodín (`DAYS_BACK: 1`)
- **Query:** `date: { gte: dayAgo, lt: tomorrow }` kde `dayAgo = now - 24 hours`

#### Konzistentné výpočty:
- ✅ Používa `computePercentChange()` z `marketCapUtils.ts`
- ✅ Používa `computeMarketCapDiff()` z `marketCapUtils.ts`
- ✅ Vždy počíta z aktuálnych hodnôt (currentPrice, previousClose)
- ✅ Rovnaké výpočty ako v `stockService.ts`

---

### 2. **Stock Service (`stockService.ts`)**

#### Konzistentné výpočty:
- ✅ **percentChange:** Vždy počíta cez `computePercentChange(currentPrice, previousClose)`
- ✅ **marketCapDiff:** Vždy počíta cez `computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)`
- ✅ **marketCap:** Vždy počíta cez `computeMarketCap(currentPrice, sharesOutstanding)`
- ✅ Fallback na DB hodnoty len ak nemáme obe ceny

#### Zmeny v logike:
```typescript
// Pred:
percentChange: s.lastChangePct || 0,  // Z DB
marketCapDiff: (s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) 
  ? s.lastMarketCapDiff 
  : computeMarketCapDiff(...)  // Len ak nie je v DB

// Po:
percentChange: (currentPrice > 0 && previousClose > 0)
  ? computePercentChange(currentPrice, previousClose)  // VŽDY počítať
  : (s.lastChangePct || 0)  // Fallback

marketCapDiff: (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0)
  ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)  // VŽDY počítať
  : ((s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) ? s.lastMarketCapDiff : 0)  // Fallback
```

---

## 📊 Konzistentnosť Dát

### Pred:
- ❌ Heatmapa: 7-dňové okno
- ❌ Tabuľky: Najnovšie dáta (bez časového obmedzenia)
- ❌ Rôzne výpočty: Heatmapa počíta, tabuľky berú z DB
- ❌ Nekonzistentné hodnoty medzi tabuľkami a heatmapou

### Po:
- ✅ Heatmapa: 24h okno
- ✅ Tabuľky: Najnovšie dáta (z posledných 24h v DB)
- ✅ Rovnaké výpočty: Oba používajú `computePercentChange()` a `computeMarketCapDiff()`
- ✅ Konzistentné hodnoty: Tabuľky a heatmapa zobrazujú rovnaké % change a cap diff

---

## 🔍 Detailné Zmeny

### `/api/heatmap/route.ts`

1. **Časové okno:**
   ```typescript
   // Pred
   const weekAgo = new Date(today);
   weekAgo.setDate(weekAgo.getDate() - 7);
   
   // Po
   const dayAgo = new Date(now);
   dayAgo.setHours(dayAgo.getHours() - 24);
   ```

2. **Query filtre:**
   ```typescript
   // SessionPrice
   date: { gte: dayAgo, lt: tomorrow }  // 24h okno
   
   // DailyRef
   date: { gte: dayAgo, lte: today }  // 24h okno
   ```

3. **Výpočty:**
   - ✅ `changePercent = computePercentChange(currentPrice, previousClose)`
   - ✅ `marketCapDiff = computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)`
   - ✅ Rovnaké ako v `stockService.ts`

---

### `stockService.ts`

1. **Import:**
   ```typescript
   import { computePercentChange } from '@/lib/utils/marketCapUtils';
   ```

2. **Výpočty:**
   ```typescript
   // percentChange - VŽDY počítať z aktuálnych hodnôt
   const percentChange = (currentPrice > 0 && previousClose > 0)
     ? computePercentChange(currentPrice, previousClose)
     : (s.lastChangePct || 0);
   
   // marketCapDiff - VŽDY počítať z aktuálnych hodnôt
   const marketCapDiff = (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0)
     ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)
     : ((s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) ? s.lastMarketCapDiff : 0);
   
   // marketCap - VŽDY počítať z aktuálnych hodnôt
   const marketCap = (currentPrice > 0 && sharesOutstanding > 0)
     ? computeMarketCap(currentPrice, sharesOutstanding)
     : (s.lastMarketCap || 0);
   ```

---

## 🎯 Výsledok

### Konzistentné Dáta:
- ✅ **% Change:** Rovnaké hodnoty v tabuľkách aj heatmape
- ✅ **Cap Diff:** Rovnaké hodnoty v tabuľkách aj heatmape
- ✅ **Časové okno:** 24h pre oba (heatmapa explicitne, tabuľky implicitne z DB)

### Výpočty:
- ✅ Oba používajú `computePercentChange()` a `computeMarketCapDiff()`
- ✅ Oba počítať z aktuálnych hodnôt (currentPrice, previousClose)
- ✅ Fallback na DB hodnoty len ak nemáme obe ceny

---

## 📝 Poznámky

1. **24h okno:** Heatmapa teraz používa 24h okno namiesto 7 dní, čo je v súlade s názvom domény `heatmap.today`

2. **Konzistentné výpočty:** Oba endpointy používajú rovnaké funkcie z `marketCapUtils.ts`, čo zabezpečuje identické výsledky

3. **Fallback logika:** Ak nemáme obe ceny (currentPrice a previousClose), používame DB hodnoty ako fallback

4. **Performance:** 24h okno je rýchlejšie ako 7 dní, pretože načítava menej dát z databázy

---

**Status:** ✅ Dokončené  
**Testy:** Všetky testy prešli (109 passed)


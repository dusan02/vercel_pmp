# Semantika previousClose - Definícia Modelu

## Model A (Používaný v kóde)

**Definícia:**
- `prevCloseKey(date)` = **previousClose pre tento trading day**
- Teda `prevCloseKey(D)` = close(D-1)

**Príklad:**
- Dnes je trading day **2024-01-15**
- Včera (last trading day) bol **2024-01-14**
- `prevCloseKey(2024-01-15)` = close(2024-01-14)

**DailyRef:**
- `DailyRef(date=D).previousClose` = close(D-1)
- `DailyRef(date=D).regularClose` = close(D)

**Redis:**
- `Redis prevClose(date=D)` = close(D-1)

**Ticker:**
- `Ticker.latestPrevClose` = close(lastTradingDay)
- `Ticker.latestPrevCloseDate` = lastTradingDay (kedy sa close stalo)

---

## Použitie v kóde

### Worker číta prevClose:
```typescript
const lastTradingDay = getLastTradingDay(todayDate);
const tradingDateStr = getDateET(lastTradingDay);
const prevCloseMap = await getPrevClose(tradingDateStr, tickers);
// tradingDateStr = D-1, prevClose(D-1) = close(D-2) ❌ ZLE!
```

**PROBLÉM:** Worker chce prevClose pre dnes (D), ale číta z D-1!

**Riešenie:** Worker má čítať z `todayTradingDateStr`:
```typescript
const todayTradingDateStr = getDateET(todayDate); // D
const prevCloseMap = await getPrevClose(todayTradingDateStr, tickers);
// prevClose(D) = close(D-1) ✅
```

---

## Aktuálny stav v kóde

### saveRegularClose():
- ✅ DailyRef(D+1).previousClose = close(D) - Model A
- ❌ Redis prevClose(D) = close(D) - Model B (nekonzistentné!)

### verify-prevclose:
- ✅ DailyRef(lastTradingDay).previousClose = close(lastTradingDay-1) - Model A
- ✅ Redis prevClose(tradingDateStr) = close(lastTradingDay-1) - Model A

### bootstrapPreviousCloses:
- ✅ DailyRef(prevTradingDay).previousClose = close(prevTradingDay-1) - Model A
- ❌ Redis prevClose(date) - date je parameter, nie trading day!

---

## Potrebné opravy

1. **saveRegularClose()**: Redis má ukladať pod D+1, nie D
2. **Worker ingestBatch**: Čítať z `todayTradingDateStr`, nie `tradingDateStr`
3. **bootstrapPreviousCloses**: Redis má ukladať pod správny trading day

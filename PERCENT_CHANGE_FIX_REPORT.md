# Percent Change Fix Report - PLTR and Other Tickers

**Dátum:** 2025-12-30  
**Problém:** PLTR má v heatmape správny percent change (-0.87%), ale v tabuľkách je nesprávny (-6.30%)

---

## 1. Diagnostika Problému

### 1.1 Rozdiel medzi Heatmap API a Stocks API

**Heatmap API** (`/api/heatmap/route.ts`):
- ✅ Vždy počíta percentChange z aktuálnych hodnôt pomocou `computePercentChange(currentPrice, previousClose, session, regularClose)`
- ✅ Vždy načítava `regularClose` z dnešného `DailyRef` (len pre dnešný deň)
- ✅ Nikdy nepoužíva `lastChangePct` z DB ako fallback

**Stocks API** (`/api/stocks` → `stockService.ts`):
- ❌ Načítaval `regularClose` len pre 'after' alebo 'closed' session
- ❌ Používal `s.lastChangePct` ako fallback, ak `pct.reference.price` je null
- ❌ `lastChangePct` môže byť stará hodnota z DB

---

## 2. Identifikované Problémy

### 2.1 Problém 1: `regularClose` sa nenačítava pre všetky sessiony

**Pred:**
```typescript
// Regular close is only needed after-hours / closed sessions
const regularCloseBySymbol = new Map<string, number>();
if (session === 'after' || session === 'closed') {
  // ... načítanie regularClose ...
}
```

**Problém:** V heatmap API sa `regularClose` načítava vždy, nie len pre after-hours/closed. To môže spôsobiť rozdiel v percent change výpočte.

### 2.2 Problém 2: Fallback na `s.lastChangePct`

**Pred:**
```typescript
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : (s.lastChangePct || 0); // ❌ Stará hodnota z DB
```

**Problém:** `s.lastChangePct` môže byť stará hodnota, ktorá neodráža aktuálny stav. V heatmap API sa toto nerobí - vždy sa počíta z aktuálnych hodnôt.

### 2.3 Problém 3: `regularClose` sa neoveruje, či je z dnešného dňa

**Pred:**
```typescript
dailyRefs.forEach(r => {
  if (r.regularClose && r.regularClose > 0) {
    regularCloseBySymbol.set(r.symbol, r.regularClose); // ❌ Môže byť z včerajška
  }
});
```

**Problém:** V heatmap API sa overuje, či `regularClose` je z dnešného dňa. V `stockService.ts` sa toto nerobilo.

---

## 3. Implementované Opravy

### 3.1 Oprava 1: Načítanie `regularClose` pre všetky sessiony

**Súbor:** `src/lib/server/stockService.ts`

**Pred:**
```typescript
// Regular close is only needed after-hours / closed sessions
const regularCloseBySymbol = new Map<string, number>();
if (session === 'after' || session === 'closed') {
  const dateET = getDateET(etNow);
  const dateObj = createETDate(dateET);
  const dailyRefs = await prisma.dailyRef.findMany({
    where: {
      symbol: { in: stocks.map(s => s.symbol) },
      date: dateObj
    },
    select: { symbol: true, regularClose: true }
  });
  dailyRefs.forEach(r => {
    if (r.regularClose && r.regularClose > 0) {
      regularCloseBySymbol.set(r.symbol, r.regularClose);
    }
  });
}
```

**Po:**
```typescript
// CRITICAL: Always fetch regularClose for all sessions (needed for correct % change calculation)
// Only use regularClose from TODAY (not previous day) - same logic as heatmap API
const regularCloseBySymbol = new Map<string, number>();
const dateET = getDateET(etNow);
const todayDateObj = createETDate(dateET);
const dailyRefs = await prisma.dailyRef.findMany({
  where: {
    symbol: { in: stocks.map(s => s.symbol) },
    date: todayDateObj // Only today's regularClose
  },
  select: { symbol: true, regularClose: true, date: true }
});
dailyRefs.forEach(r => {
  // CRITICAL: Only use regularClose from TODAY (not previous day)
  // This prevents using stale regularClose from yesterday which causes incorrect % changes
  if (r.regularClose && r.regularClose > 0) {
    const drDate = new Date(r.date);
    const isToday = drDate.getTime() === todayDateObj.getTime();
    if (isToday) {
      regularCloseBySymbol.set(r.symbol, r.regularClose);
    }
  }
});
```

**Zmeny:**
- ✅ Odstránená podmienka `if (session === 'after' || session === 'closed')` - načítava sa vždy
- ✅ Pridané overenie, či `regularClose` je z dnešného dňa (rovnaká logika ako v heatmap API)
- ✅ Pridaný `date: true` do select, aby sme mohli overiť dátum

---

### 3.2 Oprava 2: Odstránenie fallbacku na `s.lastChangePct`

**Súbor:** `src/lib/server/stockService.ts`

**Pred:**
```typescript
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : (s.lastChangePct || 0); // ❌ Stará hodnota
```

**Po:**
```typescript
// CRITICAL: Always use calculated percentChange if we have valid reference price
// Don't fallback to s.lastChangePct (it may be stale) - same as heatmap API
// This ensures consistency between heatmap and tables
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

**Zmeny:**
- ✅ Odstránený fallback na `s.lastChangePct`
- ✅ Vráti `0` namiesto starej hodnoty (rovnaká logika ako v heatmap API)

---

## 4. Porovnanie Logiky

### 4.1 Heatmap API (Správne)

```typescript
// Vždy načítava regularClose z dnešného DailyRef
const todayDateStr = getDateET(etNow);
const todayDateObj = createETDate(todayDateStr);
// ... načítanie dailyRefs ...
for (const dr of dailyRefs) {
  if (dr.regularClose && dr.regularClose > 0) {
    const drDate = new Date(dr.date);
    const isToday = drDate.getTime() === todayDateObj.getTime();
    if (isToday) {
      regularCloseMap.set(dr.symbol, dr.regularClose);
    }
  }
}

// Vždy počíta percentChange z aktuálnych hodnôt
const regularClose = regularCloseMap.get(ticker) || null;
changePercent = computePercentChange(currentPrice, previousClose, session, regularClose);
```

### 4.2 Stocks API (Pred opravou - Nesprávne)

```typescript
// Načítaval regularClose len pre after-hours/closed
if (session === 'after' || session === 'closed') {
  // ... načítanie regularClose ...
}

// Používal lastChangePct ako fallback
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : (s.lastChangePct || 0); // ❌ Stará hodnota
```

### 4.3 Stocks API (Po oprave - Správne)

```typescript
// Vždy načítava regularClose z dnešného DailyRef (rovnaká logika ako heatmap)
const todayDateObj = createETDate(getDateET(etNow));
const dailyRefs = await prisma.dailyRef.findMany({
  where: {
    symbol: { in: stocks.map(s => s.symbol) },
    date: todayDateObj // Only today's regularClose
  },
  select: { symbol: true, regularClose: true, date: true }
});
dailyRefs.forEach(r => {
  if (r.regularClose && r.regularClose > 0) {
    const drDate = new Date(r.date);
    const isToday = drDate.getTime() === todayDateObj.getTime();
    if (isToday) {
      regularCloseBySymbol.set(r.symbol, r.regularClose);
    }
  }
});

// Vždy počíta percentChange z aktuálnych hodnôt (rovnaká logika ako heatmap)
const regularClose = regularCloseBySymbol.get(s.symbol) || 0;
const pct = calculatePercentChange(
  currentPrice,
  session,
  previousClose > 0 ? previousClose : null,
  regularClose > 0 ? regularClose : null
);
const percentChange = (currentPrice > 0 && (pct.reference.price ?? 0) > 0)
  ? pct.changePct
  : 0; // Return 0 instead of stale lastChangePct
```

---

## 5. Výsledok

### 5.1 Konzistentnosť

- ✅ Heatmap API a Stocks API používajú rovnakú logiku
- ✅ `regularClose` sa načítava vždy (nie len pre after-hours/closed)
- ✅ `regularClose` sa overuje, či je z dnešného dňa
- ✅ Nikdy sa nepoužíva `lastChangePct` ako fallback

### 5.2 Očakávané Zmeny

- ✅ PLTR by mal mať rovnaký percent change v heatmape aj tabuľkách
- ✅ Všetky tickery by mali mať konzistentné percent change hodnoty
- ✅ Žiadne staré hodnoty z DB sa nepoužijú ako fallback

---

## 6. Testovanie

### 6.1 Testovanie PLTR

**Pred opravou:**
- Heatmap: -0.87% ✅
- Tables: -6.30% ❌

**Po oprave (očakávané):**
- Heatmap: -0.87% ✅
- Tables: -0.87% ✅

### 6.2 Testovanie Iných Tickerov

Treba overiť, či iné tickery majú teraz konzistentné hodnoty medzi heatmapou a tabuľkami.

---

## 7. Zoznam Zmenených Súborov

- `src/lib/server/stockService.ts` - Opravená logika načítania `regularClose` a výpočtu `percentChange`

---

## 8. Technické Detaily

### 8.1 Session-Aware Percent Change

Obe API používajú `calculatePercentChange` z `priceResolver.ts`:

```typescript
export function calculatePercentChange(
  currentPrice: number,
  session: 'pre' | 'live' | 'after' | 'closed',
  previousClose: number | null,
  regularClose: number | null
): PercentChangeResult {
  // Rules:
  // - Pre-market/Live: vs previousClose (D-1)
  // - After-hours/Closed: vs regularClose (D) if available, else previousClose (D-1)
}
```

### 8.2 Regular Close Validation

Obe API overujú, či `regularClose` je z dnešného dňa:

```typescript
const drDate = new Date(dr.date);
const isToday = drDate.getTime() === todayDateObj.getTime();
if (isToday) {
  regularCloseMap.set(dr.symbol, dr.regularClose);
}
```

---

**Report vytvorený:** 2025-12-30  
**Status:** ✅ Opravené


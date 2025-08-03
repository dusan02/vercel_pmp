# 🧪 TESTING STEPS - DIAGNÓZA PROBLÉMU

## 🚀 IMPLEMENTOVANÉ FIXES

### ✅ KROK 1: Enhanced API Key Validation
- **Súbor:** `src/app/api/prices/cached/route.ts`
- **Zmeny:** 
  - API key test s detailným logovaním
  - Early return pri neplatnom API key
  - Logovanie test response data

### ✅ KROK 2: Manual Force Update Trigger
- **Súbor:** `src/app/api/prices/cached/route.ts`
- **Zmeny:**
  - `forceUpdate=true` parameter
  - Synchronný cache update pre testovanie
  - Detailné logovanie procesu

### ✅ KROK 3: Enhanced Cache Update Logging
- **Súbor:** `src/lib/cache.ts`
- **Zmeny:**
  - Detailné logovanie každého tickera
  - Success/error counting
  - Validation pre invalid prices

### ✅ KROK 4: Enhanced Frontend Error Handling
- **Súbor:** `src/app/page.tsx`
- **Zmeny:**
  - Validácia číselných hodnôt
  - Enhanced fallback strategy
  - Better error messages

### ✅ KROK 5: Test Endpoint
- **Súbor:** `src/app/api/test-cache/route.ts`
- **Funkcie:**
  - `test-api` - test API key
  - `force-update` - manuálny cache update
  - `get-status` - cache status

## 🔍 TESTING CHECKLIST

### 1. **Test API Key (80% pravdepodobnosť)**
```bash
# V prehliadači:
http://localhost:3000/api/test-cache?action=test-api
```

**Očakávané výsledky:**
- ✅ `success: true` + `status: 200` = API key je platný
- ❌ `success: false` + `status: 401` = API key je neplatný
- ❌ `success: false` + connection error = Network problém

### 2. **Test Cache Status**
```bash
# V prehliadači:
http://localhost:3000/api/test-cache?action=get-status
```

**Očakávané výsledky:**
- ✅ `stocksCount: 260+` = Cache má reálne dáta
- ⚠️ `stocksCount: 20` = Cache má demo dáta
- ❌ `stocksCount: 0` = Cache je prázdny

### 3. **Force Cache Update**
```bash
# V prehliadači:
http://localhost:3000/api/test-cache?action=force-update
```

**Očakávané výsledky:**
- ✅ `success: true` + `stocksCount: 260+` = Update úspešný
- ❌ `success: false` + error = Update zlyhal

### 4. **Test Main API Endpoint**
```bash
# V prehliadači:
http://localhost:3000/api/prices/cached
```

**Očakávané výsledky:**
- ✅ `data.length: 260+` = Reálne dáta
- ⚠️ `data.length: 20` = Demo dáta
- ❌ `error` = API problém

### 5. **Test Force Update via Main API**
```bash
# V prehliadači:
http://localhost:3000/api/prices/cached?forceUpdate=true
```

**Očakávané výsledky:**
- ✅ Synchronný update s logmi
- ✅ `data.length: 260+` po update

## 📊 DIAGNOSTIC FLOW

### **Scenario A: API Key Invalid**
```
1. /api/test-cache?action=test-api → ❌ 401/403
2. /api/prices/cached → ❌ API key error
3. Frontend → Mock data (currentPrice: 0.00)
```

**Riešenie:** Získať nový API key z Polygon.io

### **Scenario B: Cache Update Failed**
```
1. /api/test-cache?action=test-api → ✅ 200
2. /api/test-cache?action=force-update → ❌ Error
3. /api/prices/cached → Demo data
```

**Riešenie:** Skontrolovať logy, opraviť cache update

### **Scenario C: Frontend Data Processing**
```
1. /api/test-cache?action=get-status → ✅ 260+ stocks
2. /api/prices/cached → ✅ Real data
3. Frontend → currentPrice: 0.00 (processing issue)
```

**Riešenie:** Skontrolovať frontend normalizáciu

## 🔧 QUICK FIXES

### **Fix 1: API Key Issue**
```typescript
// V route.ts - zmeniť API key
const apiKey = 'YOUR_NEW_API_KEY';
```

### **Fix 2: Cache Update Issue**
```typescript
// V cache.ts - znížiť batch size
const batchSize = 5; // Znížiť z 15 na 5
```

### **Fix 3: Frontend Issue**
```typescript
// V page.tsx - debug rendering
console.log('🔍 RENDERING:', stock.currentPrice, typeof stock.currentPrice);
```

## 📈 MONITORING

### **Vercel Logs to Watch:**
```
✅ "🚀 Starting cache update..."
✅ "✅ Added to cache: AAPL price: 173.74"
✅ "✅ Cache update completed: 260 successful, 0 failed"
❌ "❌ API call failed for AAPL: 401"
❌ "⚠️ Invalid currentPrice for AAPL: 0"
```

### **Browser Console to Watch:**
```
✅ "✅ Real data loaded: 260 stocks"
✅ "🔍 DEBUG: First stock currentPrice: 173.74"
❌ "⚠️ Invalid currentPrice for AAPL: 0 -> using fallback"
❌ "API error, using mock data"
```

## 🎯 EXPECTED OUTCOME

Po implementácii všetkých fixes by malo:

1. **API key test** → ✅ Valid
2. **Cache update** → ✅ 260+ stocks
3. **Frontend display** → ✅ Skutočné ceny namiesto 0.00
4. **Error handling** → ✅ Graceful fallbacks
5. **Logging** → ✅ Detailné debug informácie

## 🚨 EMERGENCY FALLBACK

Ak nič nefunguje:

```typescript
// V page.tsx - force mock data
const mockStocks: StockData[] = [
  { ticker: 'NVDA', currentPrice: 173.74, closePrice: 177.87, percentChange: -0.22, marketCapDiff: -9.52, marketCap: 4231 },
  // ... ďalších 7 akcií
];

// Vždy použiť mock data
setStockData(mockStocks);
```

---

**Stav:** Všetky fixes implementované
**Nasledujúci krok:** Testovanie podľa checklistu 
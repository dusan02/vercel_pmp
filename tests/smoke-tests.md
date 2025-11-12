# 🧪 Smoke Test Checklist

## Pre go-live testovanie

### 1. API Endpointy

#### `/api/stocks`
```bash
# Test pre-market
curl "http://localhost:3000/api/stocks?tickers=AAPL,MSFT&session=pre"

# Test live
curl "http://localhost:3000/api/stocks?tickers=AAPL,MSFT&session=live"

# Test after-hours
curl "http://localhost:3000/api/stocks?tickers=AAPL,MSFT&session=after"
```

**Očakávané:**
- ✅ Vracia hodnoty **bez** volania Polygon API
- ✅ Cache-Control header správny pre session
- ✅ Obsahuje `quality`, `source`, `as_of` fields

#### `/api/heatmap`
```bash
curl "http://localhost:3000/api/heatmap?session=live&limit=100"
```

**Očakávané:**
- ✅ Zoradené podľa `percentChange` (descending)
- ✅ Limit funguje
- ✅ Vracia top movers

### 2. Worker Test

#### Vypnúť worker
```bash
pm2 stop pmp-worker-snapshot
```

**Očakávané:**
- ✅ API stále funguje (číta z DB)
- ✅ Dáta sú staršie, ale validné

#### Zapnúť worker
```bash
pm2 start pmp-worker-snapshot
```

**Očakávané:**
- ✅ Do 60s sa obnoví Redis
- ✅ Nové dáta v API response
- ✅ `as_of` timestamp sa aktualizuje

### 3. WebSocket Test

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3002');

let tickCount = 0;
let lastTickTime = Date.now();

socket.on('tick', (updates) => {
  tickCount++;
  const now = Date.now();
  const fps = 1000 / (now - lastTickTime);
  lastTickTime = now;
  
  console.log(`Tick #${tickCount}, FPS: ${fps.toFixed(2)}, Updates: ${updates.length}`);
  
  // Check FPS limit (should be 2-5 fps)
  if (fps > 5) {
    console.warn('⚠️ FPS exceeds limit!');
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket');
  socket.emit('subscribeFavorites', ['AAPL', 'MSFT', 'GOOGL']);
});

setTimeout(() => {
  console.log(`Total ticks: ${tickCount}`);
  socket.disconnect();
}, 30000); // 30 seconds
```

**Očakávané:**
- ✅ Tick eventy prichádzajú
- ✅ FPS neprekračuje 5
- ✅ Updates obsahujú len TOP50 + favorites

### 4. Split Simulation

**Scénár:** Simulovať stock split (napr. AAPL 2:1 split)

**Očakávané:**
- ✅ `previous_close` je adjusted (polovičná cena)
- ✅ `percentChange` je správny vs adjusted prevClose
- ✅ `marketCapDiff` je správny

### 5. Holiday Simulation

**Scénár:** Simulovať NYSE holiday (napr. Christmas)

**Očakávané:**
- ✅ Ingest worker stojí (session = 'closed')
- ✅ API vracia posledné dáta (nie 500 error)
- ✅ Health endpoint ukazuje 'closed'

### 6. Circuit Breaker Test

**Scénár:** Simulovať Polygon API failures

```bash
# Block Polygon API temporarily
sudo iptables -A OUTPUT -d api.polygon.io -j DROP
```

**Očakávané:**
- ✅ Circuit breaker sa otvorí po 5 failures
- ✅ Worker prepne na DB-only mode
- ✅ API stále funguje (z DB/Redis)

### 7. Rate Limit Test

```bash
# Spam API requests
for i in {1..150}; do
  curl "http://localhost:3000/api/stocks?tickers=AAPL&session=live" &
done
```

**Očakávané:**
- ✅ Po 120 requests → 429 error
- ✅ Retry-After header present

### 8. Health Check

```bash
curl "http://localhost:3000/api/healthz"
```

**Očakávané:**
- ✅ Redis status
- ✅ DB status
- ✅ Last tick age
- ✅ Market session

### 9. Stale Data Logic

**Scénár:** Vypnúť worker na >6 minút

**Očakávané:**
- ✅ UI zobrazí "Stale" badge len ak `now - as_of > 360s`
- ✅ Menej agresívny indikátor (nie červený error)

### 10. Idempotent Upsert

**Scénár:** Worker pošle staršie dáta (simulovať delay)

**Očakávané:**
- ✅ DB neprepíše novšie dáta staršími
- ✅ Log: "Skipping - existing data is newer"

## Automatizované testy

```bash
# Run all smoke tests
npm run test:smoke
```

## Kritické body

- ❌ **FAIL:** API volá Polygon priamo
- ❌ **FAIL:** Worker nefunguje >5 min
- ❌ **FAIL:** WebSocket FPS >5
- ❌ **FAIL:** Circuit breaker nefunguje
- ❌ **FAIL:** Rate limit nefunguje
- ❌ **FAIL:** Stale data >360s bez indikácie


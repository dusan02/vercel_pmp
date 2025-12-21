# 📊 Vysvetlenie STALE v stĺpci %Change

## 🔍 Čo znamená STALE?

**STALE** = zastarané/neaktuálne dáta

Zobrazuje sa v stĺpci **%Change**, keď sú ceny staršie ako určitý threshold (limit).

## ⚙️ Ako sa určuje STALE?

### **Logika v `stockService.ts`:**

```typescript
const isFrozen = !!pricingState.useFrozenPrice;
const thresholdMin = session === 'live' ? 1 : 5;  // 1 min pre live, 5 min pre ostatné
const ageMs = etNow.getTime() - lastTs.getTime();
const isStale = !isFrozen && currentPrice > 0 && ageMs > thresholdMin * 60_000;
```

### **Pravidlá:**

1. **Live trading (09:30-16:00 ET):**
   - Threshold: **1 minúta**
   - Ak je cena staršia ako 1 minúta → STALE

2. **Pre-market / After-hours:**
   - Threshold: **5 minút**
   - Ak je cena staršia ako 5 minút → STALE

3. **Frozen prices (overnight/weekend):**
   - **NIKDY** nie sú STALE (aj keď sú staré)
   - Dôvod: Sú to zámerne zmrazené ceny z posledného trading dňa

## 📊 Príklady

### **Príklad 1: Live trading**
- Aktuálny čas: 10:00 ET
- Posledná aktualizácia ceny: 09:58 ET (2 minúty stará)
- **Výsledok:** STALE ✅ (staršia ako 1 minúta)

### **Príklad 2: Pre-market**
- Aktuálny čas: 08:00 ET
- Posledná aktualizácia ceny: 07:54 ET (6 minút stará)
- **Výsledok:** STALE ✅ (staršia ako 5 minút)

### **Príklad 3: Weekend (frozen)**
- Aktuálny čas: Sobota 10:00 ET
- Posledná aktualizácia ceny: Piatok 16:00 ET (18 hodín stará)
- **Výsledok:** NIE STALE ❌ (frozen price, zámerne zmrazená)

## 🔍 Prečo sa zobrazuje STALE?

### **Možné príčiny:**

1. **Worker nebeží alebo zlyháva**
   - Worker by mal aktualizovať ceny každých 60s (premium) alebo 5min (ostatné)
   - Ak worker nebeží, ceny sa neaktualizujú → STALE

2. **Polygon API problémy**
   - Rate limiting
   - API downtime
   - Network issues

3. **Weekend/Holiday**
   - Počas víkendu/holiday sa ceny neaktualizujú (frozen state)
   - Ale ak nie je frozen state správne nastavený, môže sa zobraziť STALE

4. **Worker check interval**
   - Worker kontroluje každých 60s
   - Ak je market closed alebo worker nebeží, ceny sa neaktualizujú

## 🔧 Ako to opraviť?

### **1. Skontrolovať worker status:**
```bash
# Kontrola, či worker beží
curl http://localhost:3000/api/health
```

### **2. Spustiť worker:**
```bash
# Spustiť polygon worker
MODE=snapshot ENABLE_WEBSOCKET=true npx tsx src/workers/polygonWorker.ts
```

### **3. Force ingest (ak je víkend):**
```bash
# Force ingest pre aktuálne dáta
npx tsx scripts/force-ingest.ts
```

## 📋 Aktuálny stav

Z obrázka vidím, že **všetky hodnoty majú (STALE)**:
- NVDA: -3.01% (STALE)
- AAPL: -0.54% (STALE)
- GOOG: -2.42% (STALE)
- ... atď.

**Analýza z `check-stale-status.ts`:**
- Aktuálny stav: `weekend_frozen` (je víkend)
- `Is Frozen: true` - ceny sú zmrazené
- Podľa logiky: `isStale = !isFrozen && currentPrice > 0 && ageMs > thresholdMin * 60_000`
- **Keďže `isFrozen = true`, tak `isStale` by malo byť `false`**

**Problém:**
Ak sa STALE zobrazuje aj keď `isFrozen = true`, znamená to:
1. **Bug v UI** - komponent zobrazuje STALE aj keď `isStale = false`
2. **Alebo** `isFrozen` nie je správne posielané z API do komponentu
3. **Alebo** je to zobrazené z iného dôvodu (napr. z iného API endpointu)

## ⚠️ Problém

Ak sú **všetky** hodnoty STALE, znamená to:
1. Worker nebeží alebo zlyháva
2. Alebo je víkend/holiday a frozen state nie je správne nastavený

**Riešenie:** Skontrolovať worker status a spustiť ho, ak nebeží.


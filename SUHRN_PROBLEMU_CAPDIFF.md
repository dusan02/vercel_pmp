# 📊 Súhrn problému s marketCapDiff

## 🎯 Problém
Veľké spoločnosti (NVDA, GOOG, GOOGL, MSFT, AMZN, META, atď.) majú `marketCapDiff = 0.0` v DB aj na FE, aj keď majú:
- ✅ `percentChange` (napr. -0.19% pre NVDA)
- ✅ `marketCap` (napr. 4.62T pre NVDA)
- ❌ `sharesOutstanding` (NULL alebo 0)

## 🔍 Analýza

### Aktuálny stav v DB (z diagnostiky):
```
NVDA: marketCap=4.62T, percentChange=-0.19%, capDiff=0.0, sharesOutstanding=NULL
GOOG: marketCap=3.80T, percentChange=-0.13%, capDiff=0.0, sharesOutstanding=NULL
MSFT: marketCap=3.62T, percentChange=-0.12%, capDiff=0.0, sharesOutstanding=NULL
AAPL: marketCap=4.04T, percentChange=-0.11%, capDiff=0.0, sharesOutstanding=14.7B ✅
```

### Aktuálna logika výpočtu (`stockService.ts:209-213`):
```typescript
const marketCapDiff = (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0)
  ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)
  : ((s.lastMarketCapDiff && s.lastMarketCapDiff !== 0)
    ? s.lastMarketCapDiff
    : 0);
```

**Problém:** Výpočet sa robí LEN ak `sharesOutstanding > 0`. Ak chýba, použije sa `lastMarketCapDiff` z DB (ktorý je 0).

### Aktuálna logika ukladania (`stockService.ts:220-228`):
```typescript
if (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0 && marketCapDiff !== 0) {
  prisma.ticker.update({
    where: { symbol: s.symbol },
    data: { lastMarketCapDiff: marketCapDiff }
  });
}
```

**Problém:** Ukladanie sa robí LEN ak `sharesOutstanding > 0`. Ak chýba, `marketCapDiff` sa neuloží.

## 💡 Riešenie

### Možnosť 1: Alternatívny výpočet z marketCap a percentChange
Ak máme `marketCap` a `percentChange`, môžeme dopočítať `marketCapDiff`:

```typescript
// Presný výpočet (ak máme prevClose a currentPrice)
if (sharesOutstanding === 0 && marketCap > 0 && percentChange !== 0 && previousClose > 0 && currentPrice > 0) {
  // marketCapDiff = marketCap × percentChange / 100 × (prevClose / currentPrice)
  marketCapDiff = marketCap * (percentChange / 100) * (previousClose / currentPrice);
}

// Alebo jednoduchšie (približne, ak percentChange je malé)
if (sharesOutstanding === 0 && marketCap > 0 && percentChange !== 0) {
  // marketCapDiff ≈ marketCap × percentChange / 100
  marketCapDiff = marketCap * (percentChange / 100);
}
```

### Možnosť 2: Dopočítanie sharesOutstanding z marketCap
Ak máme `marketCap` a `currentPrice`, môžeme dopočítať `sharesOutstanding`:

```typescript
if (sharesOutstanding === 0 && marketCap > 0 && currentPrice > 0) {
  sharesOutstanding = (marketCap * 1_000_000_000) / currentPrice;
  // Potom použijeme normálny výpočet
  marketCapDiff = computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding);
}
```

## 📋 Implementácia

### Krok 1: Upraviť výpočet marketCapDiff
```typescript
// VŽDY počítať marketCapDiff z aktuálnych hodnôt pre konzistentnosť
let marketCapDiff = 0;

// Metóda 1: Z price, prevClose, shares (najpresnejšia)
if (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0) {
  marketCapDiff = computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding);
}
// Metóda 2: Z marketCap a percentChange (ak chýba sharesOutstanding)
else if (marketCap > 0 && percentChange !== 0 && previousClose > 0 && currentPrice > 0) {
  // Presný výpočet
  marketCapDiff = marketCap * (percentChange / 100) * (previousClose / currentPrice);
}
// Metóda 3: Približný výpočet (ak chýba prevClose)
else if (marketCap > 0 && percentChange !== 0) {
  // Približný výpočet
  marketCapDiff = marketCap * (percentChange / 100);
}
// Fallback: Z DB
else if (s.lastMarketCapDiff && s.lastMarketCapDiff !== 0) {
  marketCapDiff = s.lastMarketCapDiff;
}
```

### Krok 2: Upraviť ukladanie do DB
```typescript
// Persist calculated marketCapDiff to DB if we have calculated value
if (marketCapDiff !== 0) {
  prisma.ticker.update({
    where: { symbol: s.symbol },
    data: { 
      lastMarketCapDiff: marketCapDiff,
      lastMarketCap: marketCap
    }
  }).catch(err => {
    console.warn(`⚠️ Failed to persist marketCapDiff for ${s.symbol}:`, err);
  });
}
```

## 🧪 Testovanie

### Spustiť diagnostické skripty:
1. **Kompletná diagnostika:**
   ```bash
   bash DIAGNOSTIKA_CAPDIFF_KOMPLETNA.txt
   ```

2. **Test veľkých spoločností:**
   ```bash
   bash TEST_VELKE_SPOLOCNOSTI.txt
   ```

3. **Test API endpointu:**
   ```bash
   bash TEST_API_ENDPOINT.txt
   ```

## ✅ Očakávaný výsledok

Po implementácii by sa `marketCapDiff` mal:
1. ✅ Počítať aj bez `sharesOutstanding` (z `marketCap` a `percentChange`)
2. ✅ Ukladať do DB pre budúce použitie
3. ✅ Prenášať na FE v API odpovedi
4. ✅ Zobrazovať správne pre všetky veľké spoločnosti

## 📊 Príklad výpočtu

Pre **NVDA**:
- `marketCap = 4.62T`
- `percentChange = -0.19%`
- `prevClose = $190.53`
- `currentPrice = $190.16`

**Výpočet:**
```
marketCapDiff = 4.62 × (-0.19 / 100) × (190.53 / 190.16)
              = 4.62 × (-0.0019) × 1.0019
              ≈ -8.78B
```

**Očakávaný výsledok:** `marketCapDiff ≈ -8.78B` (nie 0.0)


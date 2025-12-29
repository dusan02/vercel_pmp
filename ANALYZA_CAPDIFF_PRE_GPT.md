# 📊 Analýza marketCapDiff - Pre GPT

## 🔍 Problém
Veľké spoločnosti (NVDA, GOOG, GOOGL, MSFT, AMZN, META, atď.) majú `marketCapDiff = 0.0` v DB, aj keď majú `percentChange` a `marketCap`.

## 📐 Matematický vzťah

### Aktuálny výpočet (z price, prevClose, shares):
```
marketCapDiff = (currentPrice - prevClose) × sharesOutstanding ÷ 1,000,000,000
```

### Alternatívny výpočet (z marketCap a percentChange):
```
percentChange = (currentPrice - prevClose) / prevClose × 100
marketCap = currentPrice × sharesOutstanding ÷ 1,000,000,000

marketCapDiff = marketCap × percentChange / 100 × (prevClose / currentPrice)
```

**Alebo jednoduchšie (približne):**
```
marketCapDiff ≈ marketCap × percentChange / 100
```
*(Toto je presné len ak percentChange je malé, ale pre väčšinu prípadov je dostatočné)*

## 🔄 Flow analýza

### 1. **Výpočet** (`stockService.ts`)
```typescript
// Riadok 209-213
const marketCapDiff = (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0)
  ? computeMarketCapDiff(currentPrice, previousClose, sharesOutstanding)
  : ((s.lastMarketCapDiff && s.lastMarketCapDiff !== 0)
    ? s.lastMarketCapDiff
    : 0);
```

**Problém:** Výpočet sa robí LEN ak máme `sharesOutstanding > 0`. Ak chýba, použije sa fallback na `lastMarketCapDiff` z DB (ktorý je 0).

### 2. **Ukladanie do DB** (`stockService.ts`)
```typescript
// Riadok 220-228
if (currentPrice > 0 && previousClose > 0 && sharesOutstanding > 0 && marketCapDiff !== 0) {
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

**Problém:** Ukladanie sa robí LEN ak máme `sharesOutstanding > 0`. Ak chýba, `marketCapDiff` sa neuloží.

### 3. **Prenos na FE** (`/api/stocks`)
- `marketCapDiff` sa vracia v `StockData` objekte
- Ak je `marketCapDiff = 0`, FE ho zobrazí ako "0.00"

## 🐛 Identifikované problémy

### Problém 1: Chýbajúce `sharesOutstanding`
- **490 z 503 tickerov** nemá `sharesOutstanding` v DB
- Bez `sharesOutstanding` sa `marketCapDiff` nepočíta
- **Riešenie:** Načítanie z Polygon API (už implementované)

### Problém 2: Fallback na 0
- Ak `sharesOutstanding` chýba, použije sa `lastMarketCapDiff` z DB
- Ak je `lastMarketCapDiff = 0` v DB, vráti sa 0
- **Riešenie:** Alternatívny výpočet z `marketCap` a `percentChange`

### Problém 3: Ukladanie len pri `sharesOutstanding > 0`
- `marketCapDiff` sa neuloží do DB, ak chýba `sharesOutstanding`
- Pri ďalšom volaní sa použije 0 z DB
- **Riešenie:** Alternatívny výpočet a uloženie aj bez `sharesOutstanding`

## 💡 Navrhované riešenie

### Možnosť A: Alternatívny výpočet z marketCap a percentChange
```typescript
// Ak nemáme sharesOutstanding, ale máme marketCap a percentChange
if (sharesOutstanding === 0 && marketCap > 0 && percentChange !== 0) {
  // Presný výpočet: marketCapDiff = marketCap × percentChange / 100 × (prevClose / currentPrice)
  const marketCapDiff = marketCap * (percentChange / 100) * (previousClose / currentPrice);
  // Alebo jednoduchšie (približne): marketCapDiff ≈ marketCap × percentChange / 100
}
```

### Možnosť B: Dopočítanie sharesOutstanding z marketCap
```typescript
// Ak máme marketCap a currentPrice, môžeme dopočítať sharesOutstanding
if (sharesOutstanding === 0 && marketCap > 0 && currentPrice > 0) {
  sharesOutstanding = (marketCap * 1_000_000_000) / currentPrice;
  // Potom použijeme normálny výpočet
}
```

## 📋 Checklist pre opravu

- [ ] Pridať alternatívny výpočet z `marketCap` a `percentChange`
- [ ] Upraviť podmienku ukladania do DB (uložiť aj bez `sharesOutstanding`)
- [ ] Otestovať na veľkých spoločnostiach (NVDA, GOOG, MSFT, atď.)
- [ ] Overiť, či sa hodnoty správne prenášajú na FE
- [ ] Skontrolovať logy pre chyby pri ukladaní

## 🔧 Testovanie

Spustiť diagnostický skript:
```bash
cd /var/www/premarketprice && bash DIAGNOSTIKA_CAPDIFF_KOMPLETNA.txt
```


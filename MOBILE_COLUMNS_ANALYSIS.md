# 📊 Analýza optimálneho počtu stĺpcov pre mobilné zariadenia

## Aktuálne stĺpce a ich minimálne šírky

| Stĺpec | Min šírka | Dôležitosť | Typ |
|--------|-----------|------------|-----|
| Logo | 70px | Vysoká | Identifikácia |
| Ticker | 70px | **Kritická** | Identifikácia |
| Company | 120px | Vysoká | Identifikácia |
| Sector | 100px | Stredná | Kategorizácia |
| Industry | 100px | Stredná | Kategorizácia |
| Market Cap | 90px | Stredná | Finančné |
| Cap Diff | 90px | Nízka | Finančné |
| Price | 90px | **Kritická** | Finančné |
| % Change | 80px | **Kritická** | Finančné |
| Actions | 80px | Vysoká | Interakcia |

**Celková minimálna šírka:** ~890px

## Šírky mobilných obrazoviek

| Zariadenie | Šírka | Typ |
|-----------|-------|-----|
| iPhone SE | 375px | Small Mobile |
| iPhone 12/13 | 390px | Standard Mobile |
| iPhone 14 Pro Max | 430px | Large Mobile |
| Android (väčšina) | 360-414px | Standard Mobile |
| iPad Mini | 768px | Tablet |
| iPad Pro | 1024px | Large Tablet |

## UX Best Practices

Podľa odborných zdrojov:
- **2-3 stĺpce** sú optimálne pre mobile tabuľky
- Viac ako 4 stĺpce vyžaduje horizontálny scroll (zlé UX)
- Card view je lepšie ako tabuľka s viac ako 3 stĺpcami

## Výpočet optimálneho počtu stĺpcov

### Scenár 1: Len kritické stĺpce (bez horizontálneho scrollu)

**Mobile (375-430px):**
- Logo (70px) + Ticker (70px) + Price (90px) + % Change (80px) + Actions (80px) = **390px**
- ✅ **5 stĺpcov** - presne sa zmestí na väčšinu mobilov
- ⚠️ Veľmi tesné, minimálne paddingy

**Optimálnejšie riešenie:**
- Logo+Ticker (kombinované: 100px) + Price (90px) + % Change (80px) + Actions (80px) = **350px**
- ✅ **4 stĺpce** - pohodlné, s paddingmi

### Scenár 2: S horizontálnym scrollom

**Mobile:**
- Viditeľné: Logo, Ticker, Price, % Change, Actions = **5 stĺpcov**
- Scrollable: Company, Sector, Industry, Market Cap, Cap Diff
- ✅ **5 viditeľných + 5 scrollable** = 10 celkom

### Scenár 3: Card View (najlepšie UX)

**Mobile:**
- Každý riadok = 1 karta (100% šírka)
- Primárne info: Logo, Ticker, Company, Price, % Change
- Sekundárne info: Sector, Industry, Market Cap (expandable)
- ✅ **Žiadne obmedzenia počtu stĺpcov** - všetko v karte

## Odporúčania podľa šírky obrazovky

### 📱 Mobile (< 640px)

**Možnosť A: Optimalizovaná tabuľka (4-5 stĺpcov)**
```
Logo+Ticker | Price | % Change | Actions
```
- **4 stĺpce** - optimálne
- **5 stĺpcov** - maximálne (tesné)
- Horizontálny scroll pre zvyšok

**Možnosť B: Card View (odporúčané)**
- Žiadne obmedzenia
- Najlepšie UX
- Všetky informácie dostupné

### 📱 Tablet (640px - 1024px)

**Optimalizovaná tabuľka (6-7 stĺpcov)**
```
Logo | Ticker | Price | % Change | Market Cap | Actions
```
- **6 stĺpcov** - optimálne
- **7 stĺpcov** - maximálne
- Horizontálny scroll pre Sector, Industry, Cap Diff

### 💻 Desktop (> 1024px)

**Plná tabuľka (10 stĺpcov)**
- Všetky stĺpce viditeľné
- Žiadne obmedzenia

## Konkrétne odporúčanie pre vašu aplikáciu

### Mobile (< 640px): **4-5 stĺpcov**

**Viditeľné stĺpce:**
1. Logo (70px)
2. Ticker (70px) 
3. Price (90px)
4. % Change (80px)
5. Actions (80px)

**Celkom:** ~390px - presne sa zmestí

**Skryté stĺpce (scrollable):**
- Company
- Sector
- Industry
- Market Cap
- Cap Diff

### Alternatíva: Card View

**Pre mobile je card view lepšie ako tabuľka s 4-5 stĺpcami:**
- ✅ Lepšie pre dotykové ovládanie
- ✅ Všetky informácie dostupné bez scrollu
- ✅ Lepšia čitateľnosť
- ✅ Moderný vzhľad

## Záver

**Optimálny počet stĺpcov pre mobile:**
- **Minimum:** 3 stĺpce (Ticker, Price, % Change)
- **Optimálne:** 4-5 stĺpcov (Logo, Ticker, Price, % Change, Actions)
- **Maximum:** 5 stĺpcov (s horizontálnym scrollom pre zvyšok)

**Najlepšie riešenie:**
- **Card View** pre mobile (< 640px)
- **Optimalizovaná tabuľka (6-7 stĺpcov)** pre tablet
- **Plná tabuľka (10 stĺpcov)** pre desktop


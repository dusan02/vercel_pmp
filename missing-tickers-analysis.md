# 🔍 Detailná analýza chýbajúcich tickerov

## 📊 Aktuálny stav Extended+ tier

### ✅ Aktuálne tickery (60):

```
BABA, ASML, TM, AZN, NVS, LIN, NVO, HSBC, SHEL, HDB, RY, UL, SHOP, ETN, SONY, ARM, TTE, BHP, SPOT, SAN, TD, UBS, MDT, SNY, BUD, CB, TT, RIO, SMFG, BBVA, RELX, SE, TRI, PBR, NTES, BMO, RACE, AON, GSK, NWG, LYG, EQNR, CNQ, ITUB, ACN, MUFG, PDD, SAP, JCI, NGG, TCEHY, MELI, BAM, ITUB, EXPGF, GLCNF, NPSNY, GMBXF
```

### ❌ Chýbajúce tickery (42):

```
[Potrebujeme identifikovať ktoré 42 tickery chýbajú z pôvodného zoznamu 402]
```

---

## 🎯 Možnosti pre doplnenie

### Možnosť A: Pridať populárne medzinárodné spoločnosti

| Kategória | Ticker | Názov                 | Trh         |
| --------- | ------ | --------------------- | ----------- |
| Európa    | ASML   | ASML Holding          | Nizozemsko  |
| Európa    | SAP    | SAP SE                | Nemecko     |
| Európa    | NVO    | Novo Nordisk          | Dánsko      |
| Európa    | NVS    | Novartis              | Švajčiarsko |
| Európa    | AZN    | AstraZeneca           | UK          |
| Ázia      | TSM    | Taiwan Semiconductor  | Taiwan      |
| Ázia      | BABA   | Alibaba               | Čína        |
| Ázia      | TM     | Toyota                | Japonsko    |
| Kanada    | RY     | Royal Bank of Canada  | Kanada      |
| Kanada    | TD     | Toronto-Dominion Bank | Kanada      |

### Možnosť B: Pridať fintech a tech spoločnosti

| Kategória | Ticker | Názov    | Sektor           |
| --------- | ------ | -------- | ---------------- |
| Fintech   | SQ     | Square   | Platobné systémy |
| Fintech   | PYPL   | PayPal   | Digitálne platby |
| Tech      | ZM     | Zoom     | Videokonferencie |
| Tech      | SNAP   | Snap Inc | Sociálne siete   |
| Tech      | TWTR   | Twitter  | Sociálne siete   |
| Tech      | UBER   | Uber     | Ride-sharing     |
| Tech      | LYFT   | Lyft     | Ride-sharing     |

### Možnosť C: Pridať healthcare a biotech

| Kategória  | Ticker | Názov        | Sektor         |
| ---------- | ------ | ------------ | -------------- |
| Healthcare | UNH    | UnitedHealth | Poisťovňa      |
| Healthcare | ANTM   | Anthem       | Poisťovňa      |
| Healthcare | HUM    | Humana       | Poisťovňa      |
| Biotech    | BIIB   | Biogen       | Biotechnológie |
| Biotech    | REGN   | Regeneron    | Biotechnológie |
| Biotech    | VRTX   | Vertex       | Biotechnológie |

---

## 📈 Impact analýza

### Finančný impact:

- **Aktuálne API náklady:** 7,160 volaní/hod
- **S 402 tickermi:** 7,412 volaní/hod
- **Rozdiel:** +252 volaní/hod = +6,048 volaní/deň
- **Mesačný nárast:** ~181,440 volaní

### Technický impact:

- **Cache veľkosť:** +10-15% (42 tickerov)
- **Update frekvencia:** 10 min pre všetkých 102
- **Latency:** Minimálny nárast
- **Memory usage:** +5-10%

### Business impact:

- **Pokrytie trhu:** +10.5% (360 → 402)
- **Medzinárodné spoločnosti:** +15-20%
- **Sektorová diverzifikácia:** Lepšia
- **User experience:** Väčší výber

---

## 🚀 Implementačné kroky

### Krok 1: Identifikácia chýbajúcich tickerov

```bash
# Porovnať pôvodný zoznam 402 s aktuálnymi 360
# Identifikovať presne ktoré 42 tickery chýbajú
```

### Krok 2: Validácia tickerov

```bash
# Overiť či všetkých 42 tickerov je dostupných na Polygon API
# Testovať API volania pre každý ticker
```

### Krok 3: Implementácia

```typescript
// Pridať chýbajúce tickery do Extended+ tier
case 'extendedPlus':
  return [
    // Existujúce 60 tickerov...
    // + 42 nové tickery...
  ];
```

### Krok 4: Testovanie

```bash
# Spustiť testy
npm test -- src/lib/__tests__/tieredUpdateService.test.ts

# Overiť počty
node test-tiered.js
```

---

## ⚠️ Riziká a obmedzenia

### API limity:

- **Polygon API:** Neobmedzené volania (podľa tvojho vyjadrenia)
- **Rate limiting:** 5 volaní/sekundu
- **Timeout:** 30 sekúnd na volanie

### Technické riziká:

- **Cache veľkosť:** Môže presiahnuť limity
- **Memory usage:** Vyššie nároky
- **Update frekvencia:** Pomalšie pre Extended+ tier

### Business riziká:

- **Data quality:** Niektoré tickery môžu mať horšie dáta
- **Market hours:** Rôzne trhové hodiny pre medzinárodné spoločnosti
- **Currency:** Rôzne meny môžu spôsobiť problémy

---

## 🎯 Odporúčanie

### Pre okamžité riešenie:

1. **Ponechať 360 tickerov** - funkčné a testované
2. **Implementovať monitoring** pre API náklady
3. **Pripraviť plán** pre budúce rozšírenie

### Pre kompletný plán:

1. **Identifikovať presne 42 chýbajúcich tickerov**
2. **Validovať ich dostupnosť** na Polygon API
3. **Implementovať postupne** - najprv 20, potom 22
4. **Monitorovať performance** a API náklady

### Pre optimalizáciu:

1. **Vybrať najkvalitnejších 42 tickerov**
2. **Implementovať dynamické načítanie**
3. **Pridať možnosť vypnúť Extended+ tier**

---

## 📋 Akčný plán

### Fáza 1: Analýza (1-2 hodiny)

- [ ] Identifikovať presne 42 chýbajúcich tickerov
- [ ] Validovať ich dostupnosť na Polygon API
- [ ] Vytvoriť zoznam s prioritami

### Fáza 2: Implementácia (2-3 hodiny)

- [ ] Pridať tickery do Extended+ tier
- [ ] Aktualizovať testy
- [ ] Overiť funkcionalitu

### Fáza 3: Testovanie (1-2 hodiny)

- [ ] Spustiť všetky testy
- [ ] Overiť API volania
- [ ] Testovať performance

### Fáza 4: Deployment (30 min)

- [ ] Schváliť pre GIT
- [ ] Deploy na Vercel
- [ ] Monitorovať po deploymente

---

**Ktorý prístup preferuješ?**

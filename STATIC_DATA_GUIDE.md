# 📊 Statické Dáta - Príručka

## Prehľad

Aplikácia teraz rozdeľuje dáta na **statické** a **dynamické**:

### Statické dáta (neupdatujú sa často)
- **Ticker** (symbol)
- **Názov firmy** (name)
- **Sektor** (sector)
- **Odvetvie** (industry)
- **Logo URL** (generuje sa dynamicky, nie je v DB)

Tieto dáta sa **neupdatujú** pri každom worker cykle, len **raz za čas** (napr. raz za mesiac).

### Dynamické dáta (updatujú sa priebežne)
- **Ceny** (lastPrice)
- **Zmena %** (changePct)
- **Market Cap** (vypočítané)
- **Market Cap Diff** (vypočítané)
- **Shares Outstanding** (môže sa meniť)
- **Timestamp** (lastTs)

Tieto dáta sa **updatujú** priebežne cez worker (každých 60s počas trhu).

## Ako to funguje

### 1. Bootstrap statických dát

Spustiť script na naplnenie databázy so statickými dátami:

```bash
npm run db:bootstrap-static
```

Tento script:
- Načíta všetky tracked tickery (500-600)
- Uloží názvy firiem z `companyNames.ts`
- Uloží sektor a odvetvie (ak sú dostupné)
- **Nevymaže** existujúce dáta, len doplní chýbajúce

### 2. Worker neupdatuje statické dáta

Worker (`polygonWorker.ts`) teraz:
- ✅ Updatuje len `updatedAt` pre ticker
- ❌ **Neupdatuje** `name`, `sector`, `industry`
- ✅ Updatuje dynamické dáta v `SessionPrice` tabuľke

### 3. Načítavanie dát

Frontend načítava dáta cez API:
- `/api/stocks/bulk?limit=600` - načíta všetky tickery
- API načítava statické dáta z `Ticker` tabuľky
- API načítava dynamické dáta z `SessionPrice` tabuľky

## Kedy updatovať statické dáta?

Statické dáta by sa mali updatovať:
- **Raz za mesiac** - kontrola nových tickerov
- **Pri pridávaní nových tickerov** - spustiť bootstrap script
- **Ak sa zmení názov firmy** - manuálne updatovať v DB alebo spustiť bootstrap

## Príkaz na updatovanie statických dát

```bash
npm run db:bootstrap-static
```

## Overenie dát

Skontrolovať počet tickerov v databáze:

```bash
npm run bulk:count
```

Skontrolovať kompletnosť dát:

```bash
npm run bulk:check-data
```

## Výhody tohto prístupu

1. **Menej API volaní** - statické dáta sa neupdatujú často
2. **Rýchlejšie načítavanie** - statické dáta sú v DB
3. **Nižšie náklady** - menej API volaní = nižšie náklady
4. **Spoľahlivejšie** - statické dáta sú v DB, nie závislé od API

## Štruktúra dát v databáze

### Ticker tabuľka (statické dáta)
```typescript
{
  symbol: string;           // Ticker symbol (PK)
  name: string | null;      // Názov firmy (statické)
  sector: string | null;   // Sektor (statické)
  industry: string | null;  // Odvetvie (statické)
  sharesOutstanding: number | null;  // Počet akcií (môže sa meniť)
  adrRatio: number | null;   // ADR ratio (statické)
  isAdr: boolean;           // Je ADR? (statické)
  updatedAt: DateTime;      // Posledná aktualizácia
}
```

### SessionPrice tabuľka (dynamické dáta)
```typescript
{
  symbol: string;           // Ticker symbol (FK)
  date: DateTime;           // Dátum
  session: string;          // 'pre', 'live', 'after'
  lastPrice: number;        // Aktuálna cena (dynamické)
  changePct: number;        // Zmena % (dynamické)
  lastTs: DateTime;         // Timestamp (dynamické)
  source: string;           // Zdroj dát (dynamické)
  quality: string;         // Kvalita dát (dynamické)
}
```

## Poznámky

- **Logo URL** sa generuje dynamicky v `getLogoUrl()` - nie je v DB
- **Company names** sú v `src/lib/companyNames.ts`
- **Sector/Industry** mapping je v `bootstrap-static-data.ts`
- Worker **neupdatuje** statické dáta automaticky


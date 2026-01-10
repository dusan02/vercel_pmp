# Oprava sektorov pre tickery NU, ING, B, SE, NGG

## Problém
Tieto tickery sú v heatmape zobrazené dole, pretože majú sektor "Other" alebo "Unrecognized". Sú to veľké spoločnosti a musia mať správny sektor.

## Tickery na opravu

- **NU** - Nu Holdings (NuBank) - Financial Services / Credit Services
- **ING** - ING Group - Financial Services / Banks
- **B** - Barnes Group - Industrials / Specialty Industrial Machinery
- **SE** - Sea Limited - Technology / Internet Content & Information
- **NGG** - National Grid - Utilities / Utilities - Regulated Electric

## Riešenie

### Možnosť 1: SQL priamy update (najrýchlejšie)

```sql
UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Credit Services',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NU';

UPDATE "Ticker" 
SET 
  "sector" = 'Financial Services',
  "industry" = 'Banks',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'ING';

UPDATE "Ticker" 
SET 
  "sector" = 'Industrials',
  "industry" = 'Specialty Industrial Machinery',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'B';

UPDATE "Ticker" 
SET 
  "sector" = 'Technology',
  "industry" = 'Internet Content & Information',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'SE';

UPDATE "Ticker" 
SET 
  "sector" = 'Utilities',
  "industry" = 'Utilities - Regulated Electric',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'NGG';
```

### Možnosť 2: TypeScript script (na serveri)

Spustiť na produkčnom serveri:
```bash
cd /path/to/pmp_prod
npx tsx scripts/fix-other-sector-tickers.ts
```

### Možnosť 3: API endpoint (ak existuje)

Ak existuje API endpoint `/api/fix-tsm` alebo podobný, možno ho rozšíriť o tieto tickery.

## Verifikácia

Po oprave skontrolovať:
```sql
SELECT "symbol", "name", "sector", "industry" 
FROM "Ticker" 
WHERE "symbol" IN ('NU', 'ING', 'B', 'SE', 'NGG');
```

## Poznámka

Tieto tickery nie sú v lokálnej databáze, takže scripty sa musia spustiť na produkčnom serveri alebo použiť priamy SQL update.

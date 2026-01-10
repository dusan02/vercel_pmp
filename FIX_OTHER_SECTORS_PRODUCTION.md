# Oprava sektorov pre tickery na produkcii

## Problém
Tickeri LNG, SE, B, ING, HEI, E, NU, HLN, NGG sú v heatmape zobrazené dole, pretože majú sektor "Other" alebo "Unrecognized". Sú to veľké spoločnosti a musia mať správny sektor.

## Riešenie

### Možnosť 1: API Endpoint (najjednoduchšie) ✅

Spustiť HTTP GET request na produkčný server:

```bash
curl https://premarketprice.com/api/fix-other-sectors
```

Alebo otvoriť v prehliadači:
```
https://premarketprice.com/api/fix-other-sectors
```

**Výhody:**
- ✅ Najjednoduchšie - stačí jeden HTTP request
- ✅ Automaticky normalizuje industries
- ✅ Vracia JSON s výsledkami
- ✅ Bezpečné - používa existujúci Prisma client

**Očakávaná odpoveď:**
```json
{
  "success": true,
  "message": "Fixed 9 ticker(s)",
  "results": [
    {
      "symbol": "LNG",
      "success": true,
      "before": {
        "symbol": "LNG",
        "sector": "Other",
        "industry": "Uncategorized"
      },
      "after": {
        "symbol": "LNG",
        "sector": "Energy",
        "industry": "Oil & Gas Midstream"
      }
    },
    ...
  ]
}
```

### Možnosť 2: SQL Script (priamy update)

Ak API endpoint nefunguje, môžete spustiť SQL script priamo v databáze:

```bash
# Na produkčnom serveri
psql $DATABASE_URL -f FIX_ALL_OTHER_SECTOR_TICKERS.sql
```

Alebo skopírovať obsah `FIX_ALL_OTHER_SECTOR_TICKERS.sql` a spustiť v databázovom klientovi.

### Možnosť 3: TypeScript Script (na serveri)

```bash
# Na produkčnom serveri
cd /var/www/premarketprice/pmp_prod
npx tsx scripts/fix-other-sector-tickers.ts
```

## Tickery a ich správne sektory

| Ticker | Spoločnosť | Sektor | Industry |
|--------|-----------|--------|----------|
| LNG | Cheniere Energy | Energy | Oil & Gas Midstream |
| SE | Sea Limited | Technology | Internet Content & Information |
| B | Barnes Group | Industrials | Specialty Industrial Machinery |
| ING | ING Group | Financial Services | Banks |
| HEI | HEICO Corporation | Industrials | Aerospace & Defense |
| E | Eni SpA | Energy | Oil & Gas Integrated |
| NU | Nu Holdings | Financial Services | Credit Services |
| HLN | Haleon | Healthcare | Drug Manufacturers - General |
| NGG | National Grid | Utilities | Utilities - Regulated Electric |

## Verifikácia

Po oprave skontrolovať v databáze:
```sql
SELECT "symbol", "name", "sector", "industry" 
FROM "Ticker" 
WHERE "symbol" IN ('LNG', 'SE', 'B', 'ING', 'HEI', 'E', 'NU', 'HLN', 'NGG')
ORDER BY "symbol";
```

Alebo skontrolovať v heatmape - tieto tickery by sa mali zobraziť v správnych sektoroch namiesto "Other" na konci.

## Poznámka

API endpoint `/api/fix-other-sectors` je už vytvorený a pripravený na použitie. Stačí ho zavolať jedným HTTP GET requestom.

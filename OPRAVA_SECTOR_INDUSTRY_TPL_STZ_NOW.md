# Oprava nesprávnych Sector/Industry pre TPL, STZ, NOW

## Problém
Niektoré tickery majú nesprávne priradené sektor a odvetvie:
- **TPL** (Texas Pacific Land Corporation): Má nesprávne `Technology / Communication Equipment`, malo by byť `Real Estate / REIT - Specialty`
- **STZ** (Constellation Brands): Má nesprávne `Technology / Communication Equipment`, malo by byť `Consumer Defensive / Beverages - Alcoholic`
- **NOW** (ServiceNow): Má nesprávne `Real Estate / REIT - Specialty`, malo by byť `Technology / Software`

## Riešenie

### 1. Vytvorené skripty

#### `scripts/fix-tpl-stz-now.ts`
Skript na opravu týchto troch tickerov. Kontroluje aktuálne hodnoty, aplikuje opravy a overí výsledok.

#### `scripts/check-incorrect-sector-industry.ts`
Skript na kontrolu ďalších potenciálnych chýb v sektoroch a odvetviach. Hľadá:
- Tickeri s `Technology / Communication Equipment`, ktoré by mohli byť nesprávne
- Tickeri s `Real Estate / REIT - Specialty`, ktoré by mohli byť nesprávne
- Ďalšie podezrivé kombinácie

### 2. Aktualizované mapovania

#### `scripts/update-sector-industry.ts`
Pridané do hardcoded mapovania:
- `TPL`: `Real Estate / REIT - Specialty`
- `STZ`: `Consumer Defensive / Beverages - Alcoholic`
- `NOW`: `Technology / Software`

## Spustenie

### ⚠️ DÔLEŽITÉ: Príkazy sú určené pre Linux server (bash), NIE pre PowerShell!

### Na produkčnom serveri (SSH - bash)

```bash
# 1. Pripojiť sa na server
ssh root@89.185.250.213

# 2. Prejsť do správneho adresára (projekt je v /var/www/premarketprice/, NIE v pmp_prod)
cd /var/www/premarketprice
```

#### Možnosť 1: Jeden príkaz (najrýchlejšie)

Skopírujte a spustite príkaz z `FIX_TPL_STZ_NOW_SSH_BASH.txt` - je to jeden dlhý príkaz, ktorý:
1. Zobrazí aktuálne hodnoty
2. Aplikuje všetky opravy
3. Zobrazí nové hodnoty na overenie

#### Možnosť 2: Postupné príkazy

Spustite príkazy jeden po druhom z `FIX_TPL_STZ_NOW_SSH_BASH.txt` (časť "POSTUPNÉ PRÍKAZY")

#### Možnosť 3: TypeScript skript (ak sú súbory na serveri)

```bash
npx tsx scripts/fix-tpl-stz-now.ts
```

### Lokálne testovanie (PowerShell)

Ak chcete testovať lokálne v PowerShell, použite:
```powershell
.\FIX_TPL_STZ_NOW_POWERSHELL.ps1
```

**Poznámka:** PowerShell verzia je len pre lokálne testovanie. Na produkcii použite bash verziu!

Tento skript:
1. Skontroluje tickery s `Technology / Communication Equipment`
2. Skontroluje tickery s `Real Estate / REIT - Specialty`
3. Skontroluje konkrétne tickery (TPL, STZ, NOW)
4. Hľadá ďalšie podezrivé kombinácie

## ✅ Úspešné spustenie

Príkaz sa úspešne spustil! Všetky tri UPDATE príkazy vrátili "Script executed successfully".

## Overenie výsledkov

Na overenie, či sa hodnoty skutočne zmenili, spustite:

```bash
cd /var/www/premarketprice && npx prisma db execute --stdin <<< "SELECT \"symbol\", \"name\", \"sector\", \"industry\" FROM \"Ticker\" WHERE \"symbol\" IN ('TPL', 'STZ', 'NOW') ORDER BY \"symbol\";"
```

Alebo použite súbor `OVERIT_OPRAVY_TPL_STZ_NOW.txt`.

## Očakávané výsledky

Po úspešnom spustení by ste mali vidieť:

```
🔍 Checking current sector/industry for TPL, STZ, NOW...

Current values:
  TPL (Texas Pacific Land Corporation): Technology / Communication Equipment
  STZ (Constellation Brands): Technology / Communication Equipment
  NOW (ServiceNow): Real Estate / REIT - Specialty

🔧 Applying corrections...

  ✅ TPL: Real Estate / REIT - Specialty
  ✅ STZ: Consumer Defensive / Beverages - Alcoholic
  ✅ NOW: Technology / Software

📊 Verification - checking updated values...

Updated values:
  TPL (Texas Pacific Land Corporation): Real Estate / REIT - Specialty
  STZ (Constellation Brands): Consumer Defensive / Beverages - Alcoholic
  NOW (ServiceNow): Technology / Software

✅ Fix complete!
  Updated: 3
  Errors: 0
```

## Ďalšie kroky

1. ✅ **Spustiť fix skript** na opravu TPL, STZ, NOW - **DOKONČENÉ**
2. 🔍 **Spustiť kontrolu** na nájdenie ďalších potenciálnych chýb

### Kontrola ďalších chýb

Na nájdenie ďalších potenciálnych problémov spustite:

```bash
cd /var/www/premarketprice && echo "=== 1. Technology/Communication Equipment ===" && npx prisma db execute --stdin <<< "SELECT \"symbol\", \"name\", \"sector\", \"industry\" FROM \"Ticker\" WHERE \"sector\" = 'Technology' AND \"industry\" = 'Communication Equipment' ORDER BY \"symbol\" LIMIT 30;" && echo "" && echo "=== 2. Real Estate/REIT - Specialty ===" && npx prisma db execute --stdin <<< "SELECT \"symbol\", \"name\", \"sector\", \"industry\" FROM \"Ticker\" WHERE \"sector\" = 'Real Estate' AND \"industry\" = 'REIT - Specialty' ORDER BY \"symbol\" LIMIT 30;" && echo "" && echo "=== 3. NULL sector/industry ===" && npx prisma db execute --stdin <<< "SELECT \"symbol\", \"name\", \"sector\", \"industry\" FROM \"Ticker\" WHERE \"sector\" IS NULL OR \"industry\" IS NULL ORDER BY \"symbol\" LIMIT 30;" && echo "" && echo "✅ Kontrola dokončená!"
```

Alebo použite súbor `KONTROLA_DALSICH_CHYB_SQL.txt` pre postupnú kontrolu.

3. **Manuálne overiť** výsledky z kontroly
4. **Opraviť ďalšie chyby** ak sa nájdu (použiť rovnaký postup ako pre TPL, STZ, NOW)

## Poznámky

- Všetky opravy používajú validátor `sectorIndustryValidator.ts` na overenie správnosti kombinácií
- Opravy sú pridané do hardcoded mapovania, takže sa automaticky použijú pri budúcich aktualizáciách
- Skripty používajú Prisma na pripojenie k databáze, uistite sa, že máte správne nastavené `DATABASE_URL` v `.env`


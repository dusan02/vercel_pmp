# 📋 Daily Ticker Validator - Nastavenie

## Čo robí

Denný validator script (`scripts/daily-ticker-validator.ts`) sa spustí **1x denne o 02:00 UTC** a:

1. ✅ Skontroluje všetky tickery v databáze
2. ✅ Overí, či majú správny symbol, company name, sector a industry
3. ✅ Opraví všetky chyby automaticky pomocou známych mappingov
4. ✅ Validuje sector/industry kombinácie
5. ✅ Opraví TSM, RCL a ďalšie známe tickery

## 📦 Čo bolo pridané

1. **Script**: `scripts/daily-ticker-validator.ts` - denný validator
2. **API Endpoint**: `/api/fix-tsm?ticker=TSM,RCL` - manuálna oprava tickerov
3. **PM2 Config**: Pridaný `daily-ticker-validator` do `ecosystem.config.js`

## 🚀 Nasadenie na server

```bash
# 1. Prejsť do projektu
cd /var/www/premarketprice

# 2. Stiahnuť najnovšie zmeny
git pull origin main

# 3. Rebuild aplikácie
npm run build

# 4. Opraviť TSM a RCL manuálne (okamžite)
curl http://localhost:3000/api/fix-tsm?ticker=TSM,RCL

# ALEBO použiť script priamo (ak server ešte nebeží)
npx tsx scripts/daily-ticker-validator.ts

# 5. Pridať denný validator do PM2
pm2 start ecosystem.config.js --only daily-ticker-validator --env production

# 6. Skontrolovať status
pm2 status

# 7. Uložiť PM2 konfiguráciu
pm2 save

# 8. Skontrolovať logy
pm2 logs daily-ticker-validator --lines 50
```

## 🔍 Manuálne spustenie

```bash
# Spustiť validáciu manuálne
cd /var/www/premarketprice
npx tsx scripts/daily-ticker-validator.ts
```

## 📊 Čo script kontroluje

1. **Symbol**: Musí existovať a nesmie byť prázdny
2. **Company Name**: Musí existovať a nesmie byť prázdny
3. **Sector**: Musí existovať a nesmie byť prázdny
4. **Industry**: Musí existovať a nesmie byť prázdny
5. **Sector/Industry kombinácia**: Musí byť validná (cez `validateSectorIndustry`)
6. **Známe mappingy**: Porovná s `KNOWN_CORRECT_MAPPINGS` a opraví nesprávne hodnoty

## ✅ Známé tickery v mappingu

Script automaticky opraví tieto tickery:
- **TSM**: Technology / Semiconductors
- **RCL**: Consumer Cyclical / Travel Services
- **ASML, NVDA, AMD, INTC, AVGO, QCOM, TXN, MU**: Technology / Semiconductors
- **MSFT, ADBE, CRM, ORCL, NOW, INTU**: Technology / Software
- **GOOGL, GOOG, META**: Technology / Internet Content & Information
- **AAPL**: Technology / Consumer Electronics
- **TSLA, GM, F**: Consumer Cyclical / Auto Manufacturers
- **AMZN**: Consumer Cyclical / Internet Retail
- **JNJ, LLY, PFE, ABBV, MRK, BMY, NVS, AZN, GSK, SNY, NVO, TAK**: Healthcare / Drug Manufacturers
- **AMGN, GILD, REGN, VRTX, BIIB**: Healthcare / Biotechnology
- **MDT, ABT, BSX, ISRG, ZTS**: Healthcare / Medical Devices
- **JPM, BAC, WFC, C**: Financial Services / Banks
- **V, MA, AXP**: Financial Services / Credit Services
- **XOM, CVX**: Energy / Oil & Gas Integrated
- **WMT, COST, TGT**: Consumer Defensive / Discount Stores
- A ďalšie...

## 🔧 Pridanie nových tickerov do mappingu

Ak chceš pridať nový ticker do automatickej opravy, uprav `KNOWN_CORRECT_MAPPINGS` v `scripts/daily-ticker-validator.ts`:

```typescript
const KNOWN_CORRECT_MAPPINGS: { [key: string]: { sector: string; industry: string; name?: string } } = {
  // ... existujúce mappingy
  'NOVY_TICKER': { 
    sector: 'Technology', 
    industry: 'Software', 
    name: 'Company Name' 
  },
};
```

## 📝 Logy

Logy sa ukladajú do:
- **Output**: `/var/log/pm2/daily-ticker-validator-out.log`
- **Errors**: `/var/log/pm2/daily-ticker-validator-error.log`

## ⚠️ Poznámky

- Script sa spustí automaticky **raz denne o 02:00 UTC**
- Script kontroluje **všetky tickery** v databáze
- Opraví len tickery, ktoré majú mapping v `KNOWN_CORRECT_MAPPINGS`
- Tickers bez mappingu zostanú nezmenené (ale budú v logoch ako "unresolved issues")


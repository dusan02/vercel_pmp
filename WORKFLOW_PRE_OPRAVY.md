# 🔄 WORKFLOW PRE OPRAVY CHÝB

## 📊 ROZDIEL MEDZI KÓDOM A DÁTAMI

### ✅ **Dáta v databáze (sector/industry):**
- **Kde sú:** PostgreSQL databáza (tabuľka `Ticker`)
- **Čo sme updatovali:** Priamo v databáze cez SQL príkazy
- **Riziko vymazania:** **NÍZKE** - dáta zostanú, ak:
  - Nepoužiješ `DROP TABLE` alebo `TRUNCATE`
  - Nespustíš script, ktorý prepisuje hodnoty

### ⚠️ **Kódové zmeny:**
- **Kde sú:** Súbory v repozitári (`.ts`, `.tsx`, `.prisma`, atď.)
- **Čo treba opraviť:** Chyby v kóde, logike, UI, atď.
- **Riziko vymazania:** **ŽIADNE** - git workflow je bezpečný

## 🎯 ODPORÚČANÝ WORKFLOW

### **Pre kódové zmeny (UI, logika, bugfixy):**
```
localhost → test → commit → push → GitHub → deploy na produkciu
```

**Prečo:**
- ✅ Môžeš testovať lokálne
- ✅ Máš históriu zmien v gite
- ✅ Môžeš rollback ak niečo pokazíš
- ✅ Dáta v databáze zostanú nezmenené

### **Pre dáta v databáze (sector/industry):**
```
Priamo na produkcii cez SQL (ako sme robili)
```

**Prečo:**
- ✅ Rýchlejšie
- ✅ Nemusíš čakať na deployment
- ✅ Dáta sú okamžite aktualizované

## ⚠️ POZOR NA TYTO SCRIPTS

### **Scripts, ktoré MÔŽU prepísať dáta:**

1. **`bootstrap-static-data.ts`**
   - **Riziko:** Prepíše sector/industry, ak sú v mappingu
   - **Riešenie:** Script má ochranu - NEPREPISUJE existujúce hodnoty (riadok 188-189)
   ```typescript
   sector: sectorIndustry.sector || existing.sector || null,
   industry: sectorIndustry.industry || existing.industry || null,
   ```

2. **`update-sector-industry.ts`**
   - **Riziko:** Môže prepísať hodnoty z Polygon API
   - **Riešenie:** Používa sa len pre tickery bez hodnôt

3. **`verify-sector-industry.ts` (cron)**
   - **Riziko:** Overuje a opravuje hodnoty podľa `knownCorrectMappings`
   - **Riešenie:** Opravuje len neplatné kombinácie

## ✅ BEZPEČNÝ WORKFLOW PRE NOVÉ OPRAVY

### **Krok 1: Lokálne testovanie**
```bash
# Na localhost
npm run dev
# Testuj zmeny
```

### **Krok 2: Commit a push**
```bash
git add .
git commit -m "Fix: oprava chyby XYZ"
git push origin main
```

### **Krok 3: Deploy na produkciu**
```bash
# Na produkcii
cd /var/www/premarketprice
git pull origin main
npm install  # ak sú nové dependencies
pm2 restart premarketprice
```

### **Krok 4: Overenie**
- Skontroluj, že aplikácia beží
- Over, že dáta v databáze zostali (sector/industry)

## 🛡️ BACKUP PRED DEPLOYMENTOM

Ak chceš byť 100% istý, vytvor backup:

```bash
# Backup databázy
pg_dump -U pmp_user -d pmp_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# Alebo len sector/industry
psql "$DATABASE_URL" -c "COPY (SELECT symbol, sector, industry FROM \"Ticker\") TO STDOUT CSV HEADER" > sector_industry_backup.csv
```

## 📝 ZÁVER

**Pre kódové zmeny:** Použi git workflow (localhost → GitHub → produkcia)
**Pre dáta v databáze:** Priamo na produkcii cez SQL

**Dáta v databáze sa NEVYMAŽÚ, ak:**
- ✅ Použiješ git workflow pre kód
- ✅ Nespustíš `DROP TABLE` alebo `TRUNCATE`
- ✅ `bootstrap-static-data.ts` má ochranu proti prepisovaniu

**Odporúčanie:** Vždy použij git workflow pre kódové zmeny. Je to bezpečnejšie a profesionálnejšie.


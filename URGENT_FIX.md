# 🚨 NALIEHAVÉ RIEŠENIE - Projekt neexistuje na očakávanom mieste

## Problém
```
-bash: cd: /var/www/premarketprice/pmp_prod: No such file or directory
[PM2][ERROR] File ecosystem.config.js not found
```

## ⚡ RÝCHLE RIEŠENIE (kopírovať a spustiť)

### Krok 1: Nájsť, kde je projekt skutočne umiestnený

```bash
# Najrýchlejšie - skontrolovať earnings proces (beží na tom istom serveri)
pm2 describe earnings-table | grep cwd

# Alebo hľadať súbory
find / -name "ecosystem.config.js" 2>/dev/null
find / -name "server.ts" 2>/dev/null | grep -v node_modules | head -3

# Alebo hľadať adresáre
find / -type d -name "*premarketprice*" 2>/dev/null
find / -type d -name "*pmp*" 2>/dev/null | grep -v node_modules | head -5
```

### Krok 2: Keď nájdete cestu, napríklad `/srv/premarketprice/` alebo `/home/root/pmp_prod/`

```bash
# Prejsť do správneho adresára (nahraďte SKUTOČNA_CESTA)
cd /SKUTOČNA_CESTA

# Skontrolovať, či tam je ecosystem.config.js
ls -la ecosystem.config.js

# Ak áno, spustiť PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 status
```

## 🔍 Podrobnejšie vyhľadávanie

Ak vyššie uvedené príkazy nič nenašli, skúste:

```bash
# 1. Skontrolovať všetky PM2 procesy a ich cesty
pm2 list
pm2 describe earnings-table
pm2 describe earnings-cron

# 2. Hľadať package.json s "premarketprice"
find / -name "package.json" 2>/dev/null | xargs grep -l "premarketprice" 2>/dev/null

# 3. Skontrolovať bežné webové adresáre
ls -la /var/www/
ls -la /srv/
ls -la /home/root/
ls -la /opt/
ls -la /root/

# 4. Skontrolovať, kde bežia earnings procesy (môžu byť v tom istom adresári)
pm2 describe earnings-table | grep -E "(cwd|script|path)"
```

## 📝 Možné umiestnenia projektu

Projekt môže byť na jednom z týchto miest:

1. `/srv/premarketprice/` - bežné pre Debian/Ubuntu
2. `/srv/EarningsTable/` - ak je v tom istom adresári ako earnings
3. `/home/root/premarketprice/` - home adresár root používateľa
4. `/opt/premarketprice/` - opt adresár
5. `/var/www/html/` - štandardný web root
6. `/var/www/premarketprice/` - bez `pmp_prod` podadresára
7. `/root/premarketprice/` alebo `/root/pmp_prod/` - root home adresár

## ✅ Po nájdení projektu

1. **Aktualizovať `ecosystem.config.js`** - zmeniť `cwd` na správnu cestu
2. **Skontrolovať, či existujú všetky súbory:**
   ```bash
   ls -la server.ts
   ls -la package.json
   ls -la ecosystem.config.js
   ```

3. **Spustiť PM2:**
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   ```

4. **Skontrolovať:**
   ```bash
   pm2 status
   pm2 logs premarketprice --lines 20
   ```

## 🆘 Ak projekt vôbec neexistuje na serveri

Ak projekt nie je na serveri, musíte ho najprv nahrať:

1. **Nahrať projekt na server** (napr. cez git, scp, alebo rsync)
2. **Nainštalovať závislosti:**
   ```bash
   cd /cesta/k/projektu
   npm install
   npx prisma generate
   npm run build
   ```
3. **Spustiť PM2:**
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   ```


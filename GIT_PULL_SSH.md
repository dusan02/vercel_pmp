# 📥 SSH Príkazy na stiahnutie zmien z Git

## 🚀 Rýchly postup (kopírovať a spustiť)

```bash
# 1. Pripojiť sa na server
ssh root@89.185.250.213

# 2. Prejsť do adresára projektu
cd /var/www/premarketprice

# 3. Skontrolovať aktuálny stav
git status

# 4. Stiahnuť najnovšie zmeny z GitHub
git pull origin main

# 5. (Voliteľné) Ak sú lokálne zmeny, ktoré chcete zachovať
# git stash
# git pull origin main
# git stash pop

# 6. Skontrolovať, či sa zmeny stiahli
git log --oneline -5
```

## 📋 Kompletný postup s buildom a reštartom

```bash
# 1. Pripojiť sa na server
ssh root@89.185.250.213

# 2. Prejsť do adresára projektu
cd /var/www/premarketprice

# 3. Stiahnuť zmeny
git pull origin main

# 4. Inštalovať nové závislosti (ak boli pridané)
npm install

# 5. Generovať Prisma klienta
npx prisma generate

# 6. Build aplikácie
npm run build

# 7. Reštartovať PM2 procesy
pm2 restart premarketprice
pm2 restart pmp-polygon-worker
pm2 restart pmp-bulk-preloader

# 8. Skontrolovať status
pm2 status
pm2 logs premarketprice --lines 20
```

## 🔍 Kontrola zmien

```bash
# Zobraziť posledné commity
git log --oneline -10

# Zobraziť zmeny v súboroch
git diff HEAD~1

# Zobraziť, ktoré súbory sa zmenili
git diff --name-only HEAD~1
```

## ⚠️ Ak nastane konflikt

```bash
# Zobraziť konflikty
git status

# Ak chcete zachovať lokálne zmeny
git stash
git pull origin main
git stash pop

# Ak chcete prepísať lokálne zmeny (POZOR!)
git fetch origin
git reset --hard origin/main
```

## 📝 Poznámky

- **NEPOUŽÍVAJTE `sudo`** - ste prihlásení ako `root`
- Projekt je v `/var/www/premarketprice` (nie v `pmp_prod` podadresári)
- Po `git pull` je odporúčané urobiť `npm run build` a reštartovať PM2 procesy
- Vždy skontrolujte `pm2 status` po reštarte


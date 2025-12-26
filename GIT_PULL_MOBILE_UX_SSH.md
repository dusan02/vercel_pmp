# 📥 SSH Príkazy na stiahnutie Mobile UX optimalizácií

## 🚀 Rýchly postup (kopírovať a spustiť)

```bash
# 1. Prejsť do adresára projektu
cd /var/www/premarketprice

# 2. Skontrolovať aktuálny stav
git status

# 3. Stiahnuť najnovšie zmeny z GitHub
git pull origin main

# 4. Skontrolovať, či sa zmeny stiahli
git log --oneline -5
```

## 📋 Kompletný postup s buildom a reštartom

```bash
# 1. Prejsť do adresára projektu
cd /var/www/premarketprice

# 2. Stiahnuť zmeny
git pull origin main

# 3. Inštalovať nové závislosti (ak boli pridané)
npm install

# 4. Generovať Prisma klienta
npx prisma generate

# 5. Build aplikácie
npm run build

# 6. Reštartovať PM2 procesy
pm2 restart premarketprice
pm2 restart pmp-polygon-worker
pm2 restart pmp-bulk-preloader

# 7. Uložiť PM2 konfiguráciu
pm2 save

# 8. Skontrolovať status
pm2 status

# 9. Skontrolovať logy (posledných 20 riadkov)
pm2 logs premarketprice --lines 20 --nostream

# 10. Skontrolovať health endpoint
curl http://localhost:3000/api/health
```

## 🔍 Overenie zmien

```bash
# Zobraziť posledný commit
git log --oneline -1

# Zobraziť zmenené súbory v poslednom commite
git show --name-status HEAD

# Skontrolovať, či sú všetky zmeny stiahnuté
git status
```

## ⚠️ Poznámky

- Ak sa objavia konflikty pri `git pull`, použite `git stash` a potom `git pull`
- Build môže trvať 1-2 minúty
- Po reštarte počkajte 10-15 sekúnd, kým sa server spustí
- Health check by mal vrátiť `"status":"healthy"` alebo `"status":"degraded"` (ak Redis nie je nakonfigurovaný)


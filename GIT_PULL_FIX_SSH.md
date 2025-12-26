# 🔧 Oprava Git Pull - Lokálne zmeny

## ⚠️ Problém
Git pull zlyhal, pretože máte lokálne zmeny v:
- `ecosystem.config.js`
- `server.ts`

## 🚀 Riešenie 1: Stash lokálnych zmien (odporúčané)

Ak chcete zachovať lokálne zmeny pre budúce použitie:

```bash
# 1. Uložiť lokálne zmeny do stash
git stash

# 2. Stiahnuť nové zmeny
git pull origin main

# 3. (Voliteľné) Vrátiť lokálne zmeny späť
git stash pop

# 4. Ak nastane konflikt po stash pop, vyriešiť manuálne
```

## 🚀 Riešenie 2: Prepísať lokálne zmeny (ak nie sú potrebné)

Ak lokálne zmeny nie sú dôležité a chcete ich prepísať novými zmenami z GitHub:

```bash
# 1. Prepísať lokálne zmeny novými zmenami z GitHub
git fetch origin
git reset --hard origin/main

# 2. Skontrolovať, či sa zmeny stiahli
git log --oneline -5
```

## 📋 Kompletný postup po vyriešení konfliktu

```bash
# 1. Prejsť do adresára
cd /var/www/premarketprice

# 2. Vyriešiť konflikt (vyberte jedno z riešení vyššie)
# git stash && git pull origin main
# ALEBO
# git fetch origin && git reset --hard origin/main

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

# 7. Skontrolovať status
pm2 status
pm2 logs premarketprice --lines 20
```

## 🔍 Kontrola lokálnych zmien (pred rozhodnutím)

```bash
# Zobraziť, aké sú lokálne zmeny
git diff ecosystem.config.js
git diff server.ts

# Zobraziť status
git status
```

## ⚠️ Poznámka

- **Riešenie 1 (stash):** Použite, ak chcete zachovať lokálne zmeny
- **Riešenie 2 (reset):** Použite, ak sú lokálne zmeny nepotrebné a chcete ich prepísať


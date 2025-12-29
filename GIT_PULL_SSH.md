# Git Pull Commands for SSH Server

## Príkazy na stiahnutie zmien na produkčný server

```bash
# 1. Prejsť do priečinka aplikácie
cd /var/www/premarketprice

# 2. Stiahnuť najnovšie zmeny z GitHubu
git pull origin main

# 3. (Voliteľné) Ak by boli konflikty, reset na remote verziu
# git fetch origin
# git reset --hard origin/main

# 4. Reštartovať aplikáciu (ak používaš PM2)
pm2 restart premarketprice

# 5. (Voliteľné) Skontrolovať status
pm2 status
pm2 logs premarketprice --lines 20 --nostream
```

## Kompletný príkaz (všetko naraz)

```bash
cd /var/www/premarketprice && git pull origin main && pm2 restart premarketprice && pm2 status
```

## Ak by boli problémy s pull-om

```bash
# 1. Zálohovať aktuálny stav
cd /var/www/premarketprice
git stash

# 2. Stiahnuť zmeny
git pull origin main

# 3. Ak by boli konflikty, reset na remote
git fetch origin
git reset --hard origin/main

# 4. Reštartovať
pm2 restart premarketprice
```

## Verifikácia po deployi

```bash
# Skontrolovať, či beží aplikácia
pm2 status

# Skontrolovať logy
pm2 logs premarketprice --lines 50

# Skontrolovať health endpoint
curl http://localhost:3000/api/health

# Skontrolovať favicon (mal by mať v=4)
curl -I http://localhost:3000/favicon.svg
```

# ⚡ Rýchle riešenie problémov z terminálu

## 🔴 Hlavné problémy

### 1. `sudo: command not found`
**Riešenie:** Ste prihlásení ako `root`, takže **NEPOUŽÍVAJTE `sudo`**. Všetky príkazy spúšťajte priamo.

❌ **ZLE:**
```bash
sudo certbot certonly --nginx -d premarketprice.com
sudo nginx -t
```

✅ **SPRÁVNE:**
```bash
certbot certonly --nginx -d premarketprice.com
nginx -t
```

### 2. `[PM2][ERROR] File ecosystem.config.js not found` alebo `No such file or directory`
**Problém:** Adresár `/var/www/premarketprice/pmp_prod` neexistuje na serveri.

**Riešenie:** Najprv musíte nájsť, kde skutočne je projekt umiestnený.

```bash
# KROK 1: Nájsť umiestnenie projektu
# Možnosť A: Skontrolovať, kde bol starý proces spustený
pm2 describe earnings-table | grep cwd

# Možnosť B: Hľadať súbory projektu
find / -name "ecosystem.config.js" 2>/dev/null
find / -name "server.ts" 2>/dev/null | grep -v node_modules

# Možnosť C: Hľadať adresáre
find / -type d -name "*premarketprice*" 2>/dev/null
find / -type d -name "*pmp*" 2>/dev/null | grep -v node_modules

# Možnosť D: Skontrolovať bežné adresáre
ls -la /var/www/
ls -la /srv/
ls -la /home/
ls -la /opt/

# KROK 2: Keď nájdete správnu cestu, prejsť tam
cd /SKUTOČNA_CESTA_K_PROJEKTU

# KROK 3: Spustiť PM2
pm2 start ecosystem.config.js --env production
```

**Tip:** Earnings procesy (`earnings-table`, `earnings-cron`) bežia na tom istom serveri - skontrolujte ich `cwd` v PM2, aby ste zistili, kde je projekt.

### 3. Server beží na porte 3001 namiesto 3000
**Riešenie:** Starý proces používa inú konfiguráciu. Zastavte ho a spustite nový.

```bash
# Zastaviť starý proces
pm2 stop premarketprice
pm2 delete premarketprice

# Spustiť nový s novou konfiguráciou
cd /var/www/premarketprice/pmp_prod
pm2 start ecosystem.config.js --env production
pm2 save
```

### 4. Port 3000 vs 3001
V logoch vidíte:
```
🚀 Next.js server ready on http://localhost:3001
```

Ale v `ecosystem.config.js` máte:
```js
PORT: 3000
```

**Príčina:** Buď:
- Starý proces beží s inou konfiguráciou
- V `.env` súbore je `PORT=3001`

**Riešenie:**
```bash
cd /var/www/premarketprice/pmp_prod

# Skontrolovať .env
cat .env | grep PORT

# Ak je tam PORT=3001, odstrániť alebo zmeniť na PORT=3000
# Alebo jednoducho reštartovať s novou konfiguráciou
pm2 restart premarketprice --update-env
```

## 🚀 Rýchly deploy (kopírovať a spustiť)

```bash
# 1. Pripojiť sa na server
ssh root@89.185.250.213

# 2. Prejsť do adresára
cd /var/www/premarketprice/pmp_prod

# 3. Aktualizovať kód (ak používate git)
# git pull origin main

# 4. Inštalovať závislosti
npm install

# 5. Generovať Prisma
npx prisma generate

# 6. Build
npm run build

# 7. Zastaviť staré procesy
pm2 stop premarketprice
pm2 delete premarketprice

# 8. Spustiť nové procesy
pm2 start ecosystem.config.js --env production

# 9. Uložiť
pm2 save

# 10. Skontrolovať
pm2 status
pm2 logs premarketprice --lines 20
```

## 🔐 SSL certifikáty (bez sudo!)

```bash
# Inštalovať certbot (ak nie je nainštalovaný)
apt update
apt install certbot python3-certbot-nginx -y

# Generovať certifikáty
certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com
certbot certonly --nginx -d earningstable.com -d www.earningstable.com

# Skontrolovať Nginx
nginx -t
systemctl reload nginx
```

## 📊 Kontrola, či všetko funguje

```bash
# 1. PM2 procesy
pm2 status

# Mali by ste vidieť:
# - premarketprice (online)
# - pmp-polygon-worker (online)
# - pmp-bulk-preloader (online alebo waiting)

# 2. Porty
netstat -tlnp | grep 3000
# Mala by byť otvorená: 127.0.0.1:3000

# 3. Logy
pm2 logs premarketprice --lines 10
# Mali by ste vidieť: "🚀 Next.js server ready on http://localhost:3000"

# 4. Nginx
nginx -t
# Mala by byť: "syntax is ok" a "test is successful"

# 5. Test HTTP
curl http://localhost:3000/api/health
# Mala by vrátiť: "healthy" alebo podobnú odpoveď
```

## ⚠️ Dôležité poznámky

1. **Ste root** - nepoužívajte `sudo`
2. **Cesta k projektu:** `/var/www/premarketprice/pmp_prod`
3. **Port:** Musí byť `3000` (nie 3001)
4. **PM2 konfigurácia:** `ecosystem.config.js` musí byť v správnom adresári
5. **SSL certifikáty:** Každá doména potrebuje svoj vlastný certifikát

## 🆘 Ak niečo nefunguje

1. **Skontrolovať logy:**
   ```bash
   pm2 logs --lines 50
   ```

2. **Skontrolovať, či bežia procesy:**
   ```bash
   pm2 status
   ```

3. **Skontrolovať porty:**
   ```bash
   netstat -tlnp | grep -E '3000|443|80'
   ```

4. **Skontrolovať Nginx:**
   ```bash
   nginx -t
   tail -f /var/log/nginx/error.log
   ```

5. **Reštartovať všetko:**
   ```bash
   pm2 restart all
   systemctl restart nginx
   ```


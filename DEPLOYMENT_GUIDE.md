# 🚀 Návod na nasadenie na VPS server

## 📋 Zistené problémy z terminálu

1. ✅ **sudo nie je potrebné** - ste už prihlásení ako `root`
2. ❌ **ecosystem.config.js nie je nájdený** - PM2 hľadá súbor v aktuálnom adresári
3. ⚠️ **Server beží na porte 3001** namiesto 3000 - starý proces používa inú konfiguráciu
4. ⚠️ **Starý PM2 proces už beží** - potrebuje reštart s novou konfiguráciou

## 🔧 Postup nasadenia

### 1. Pripojenie na server

```bash
ssh root@89.185.250.213
```

**Poznámka:** Keď ste prihlásení ako `root`, **NEPOUŽÍVAJTE `sudo`** - všetky príkazy spúšťajte priamo.

### 2. Nájdenie správneho adresára

**⚠️ DÔLEŽITÉ:** Adresár `/var/www/premarketprice/pmp_prod` nemusí existovať!

Najprv musíte nájsť, kde je projekt skutočne umiestnený:

```bash
# Možnosť 1: Skontrolovať earnings proces (beží na tom istom serveri)
pm2 describe earnings-table | grep cwd

# Možnosť 2: Hľadať súbory projektu
find / -name "ecosystem.config.js" 2>/dev/null
find / -name "server.ts" 2>/dev/null | grep -v node_modules | head -3

# Možnosť 3: Hľadať adresáre
find / -type d -name "*premarketprice*" 2>/dev/null
find / -type d -name "*pmp*" 2>/dev/null | grep -v node_modules | head -5

# Možnosť 4: Skontrolovať bežné adresáre
ls -la /var/www/
ls -la /srv/
ls -la /home/root/
ls -la /opt/
```

**Keď nájdete správnu cestu, prejdite tam:**

```bash
cd /SKUTOČNA_CESTA_K_PROJEKTU
```

### 3. Aktualizácia kódu (ak používate git)

```bash
git pull origin main
# alebo
git pull origin master
```

### 4. Inštalácia závislostí (ak boli pridané nové)

```bash
npm install
```

### 5. Generovanie Prisma klienta

```bash
npx prisma generate
```

### 6. Build aplikácie

```bash
npm run build
```

### 7. Zastavenie starých PM2 procesov

```bash
# Zobrazenie aktuálnych procesov
pm2 status

# Zastavenie starého premarketprice procesu
pm2 stop premarketprice

# Odstránenie starého procesu (voliteľné)
pm2 delete premarketprice
```

### 8. Spustenie nových procesov s novou konfiguráciou

```bash
# Spustenie všetkých procesov z ecosystem.config.js
cd /var/www/premarketprice/pmp_prod
pm2 start ecosystem.config.js --env production

# Alebo jednotlivo:
pm2 start ecosystem.config.js --only premarketprice --env production
pm2 start ecosystem.config.js --only pmp-polygon-worker --env production
pm2 start ecosystem.config.js --only pmp-bulk-preloader --env production
```

### 9. Uloženie PM2 konfigurácie

```bash
pm2 save
```

### 10. Kontrola stavu

```bash
pm2 status
pm2 logs --lines 50
```

### 11. Generovanie SSL certifikátov (Let's Encrypt)

**Poznámka:** Keď ste `root`, nepoužívajte `sudo`:

```bash
# Pre premarketprice.com
certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com

# Pre earningstable.com
certbot certonly --nginx -d earningstable.com -d www.earningstable.com
```

Ak certbot nie je nainštalovaný:

```bash
apt update
apt install certbot python3-certbot-nginx -y
```

### 12. Kontrola a reload Nginx

```bash
# Kontrola konfigurácie
nginx -t

# Ak je konfigurácia v poriadku, reload
systemctl reload nginx

# Alebo reštart
systemctl restart nginx
```

### 13. Kontrola, či server beží na správnom porte

```bash
# Skontrolovať, či beží na porte 3000
netstat -tlnp | grep 3000
# alebo
ss -tlnp | grep 3000

# Skontrolovať PM2 logy
pm2 logs premarketprice --lines 20
```

Mali by ste vidieť:

```
🚀 Next.js server ready on http://localhost:3000
```

## 🔍 Riešenie problémov

### Problém: Server beží na porte 3001 namiesto 3000

**Príčina:** Starý proces alebo .env súbor má nastavený PORT=3001

**Riešenie:**

1. Skontrolovať .env súbor:

```bash
cd /var/www/premarketprice/pmp_prod
cat .env | grep PORT
```

2. Ak je tam PORT=3001, zmeniť na PORT=3000 alebo odstrániť riadok (ecosystem.config.js má PORT: 3000)

3. Reštartovať proces:

```bash
pm2 restart premarketprice
```

### Problém: PM2 nemôže nájsť ecosystem.config.js

**Príčina:** PM2 hľadá súbor v aktuálnom adresári

**Riešenie:**

```bash
# Prejsť do správneho adresára
cd /var/www/premarketprice/pmp_prod

# Spustiť PM2 s absolútnou cestou
pm2 start /var/www/premarketprice/pmp_prod/ecosystem.config.js --env production
```

### Problém: TypeScript súbory sa nespúšťajú

**Príčina:** Chýba tsx alebo npx

**Riešenie:**

```bash
# Skontrolovať, či je tsx nainštalovaný
npm list tsx

# Ak nie, nainštalovať
npm install --save-dev tsx

# Skontrolovať, či funguje
npx tsx --version
```

### Problém: Nginx nefunguje s HTTPS

**Príčina:** Chýbajú SSL certifikáty alebo zlá cesta v nginx.conf

**Riešenie:**

1. Skontrolovať, či existujú certifikáty:

```bash
ls -la /etc/letsencrypt/live/premarketprice.com/
ls -la /etc/letsencrypt/live/earningstable.com/
```

2. Ak neexistujú, vygenerovať:

```bash
certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com
certbot certonly --nginx -d earningstable.com -d www.earningstable.com
```

3. Skontrolovať nginx.conf - cesty k certifikátom musia byť správne

## 📊 Monitoring

### Kontrola procesov

```bash
# Status všetkých procesov
pm2 status

# Detailné informácie
pm2 describe premarketprice
pm2 describe pmp-polygon-worker
pm2 describe pmp-bulk-preloader

# Logy
pm2 logs premarketprice --lines 50
pm2 logs pmp-polygon-worker --lines 50
pm2 logs pmp-bulk-preloader --lines 50
```

### Kontrola portov

```bash
# Ktoré porty sú otvorené
netstat -tlnp | grep -E '3000|443|80'

# Alebo
ss -tlnp | grep -E '3000|443|80'
```

### Kontrola Nginx

```bash
# Status
systemctl status nginx

# Test konfigurácie
nginx -t

# Logy
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

## ✅ Kontrolný zoznam pred nasadením

- [ ] Kód je aktualizovaný na serveri
- [ ] `npm install` bol spustený
- [ ] `npx prisma generate` bol spustený
- [ ] `npm run build` bol úspešne dokončený
- [ ] `.env` súbor má správne premenné (PORT=3000, DATABASE_URL, atď.)
- [ ] Staré PM2 procesy sú zastavené
- [ ] Nové PM2 procesy sú spustené a bežia
- [ ] Server beží na porte 3000 (nie 3001)
- [ ] SSL certifikáty sú vygenerované
- [ ] Nginx konfigurácia je správna a reloadnutá
- [ ] Všetky procesy sú uložené v PM2 (`pm2 save`)

## 🎯 Očakávaný výsledok

Po úspešnom nasadení by ste mali mať:

1. **PM2 procesy:**

   - `premarketprice` - beží na porte 3000
   - `pmp-polygon-worker` - beží a ingestuje dáta
   - `pmp-bulk-preloader` - beží podľa cron rozvrhu

2. **Nginx:**

   - HTTP (port 80) presmerováva na HTTPS
   - HTTPS (port 443) funguje pre obe domény
   - Proxy smeruje na `127.0.0.1:3000`

3. **SSL:**

   - Certifikáty pre obe domény sú platné
   - HTTPS funguje bez chýb

4. **Aplikácia:**
   - `https://premarketprice.com` funguje
   - `https://earningstable.com` funguje
   - WebSocket funguje
   - API endpoints fungujú

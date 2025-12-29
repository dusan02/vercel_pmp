# Fix Worker Processes on SSH Server

## Problém
Po git pull a restarte:
- ✅ `premarketprice` - online (OK)
- ❌ `pmp-polygon-worker` - errored (617 restarts!)
- ❌ `pmp-bulk-preloader` - stopped

## Diagnostika

### 1. Skontrolovať logy polygon-worker

```bash
pm2 logs pmp-polygon-worker --lines 50 --nostream
```

### 2. Skontrolovať logy bulk-preloader

```bash
pm2 logs pmp-bulk-preloader --lines 50 --nostream
```

### 3. Skontrolovať ecosystem config

```bash
cd /var/www/premarketprice
cat ecosystem.config.js
```

## Riešenie

### Možnosť 1: Reštartovať všetky procesy

```bash
cd /var/www/premarketprice

# 1. Zastaviť všetky procesy
pm2 stop all

# 2. Vymazať všetky procesy
pm2 delete all

# 3. Spustiť znovu z ecosystem.config.js
pm2 start ecosystem.config.js

# 4. Skontrolovať status
pm2 status

# 5. Skontrolovať logy
pm2 logs --lines 20
```

### Možnosť 2: Reštartovať len problematické procesy

```bash
cd /var/www/premarketprice

# 1. Zastaviť a vymazať problematické procesy
pm2 delete pmp-polygon-worker
pm2 delete pmp-bulk-preloader

# 2. Spustiť znovu z ecosystem.config.js
pm2 start ecosystem.config.js --only pmp-polygon-worker
pm2 start ecosystem.config.js --only pmp-bulk-preloader

# 3. Skontrolovať status
pm2 status

# 4. Skontrolovať logy
pm2 logs pmp-polygon-worker --lines 20
pm2 logs pmp-bulk-preloader --lines 20
```

### Možnosť 3: Kompletný reset (ak nič nepomôže)

```bash
cd /var/www/premarketprice

# 1. Zastaviť všetko
pm2 stop all
pm2 delete all

# 2. Skontrolovať, či existuje ecosystem.config.js
ls -la ecosystem.config.js

# 3. Spustiť znovu
pm2 start ecosystem.config.js

# 4. Uložiť PM2 konfiguráciu
pm2 save

# 5. Skontrolovať status
pm2 status

# 6. Skontrolovať logy
pm2 logs --lines 30
```

## Overenie, že procesy bežia správne

```bash
# Status všetkých procesov
pm2 status

# Logy v reálnom čase (Ctrl+C pre ukončenie)
pm2 logs

# Skontrolovať, či worker beží
pm2 logs pmp-polygon-worker --lines 10

# Skontrolovať health endpoint
curl http://localhost:3000/api/health/worker
```

## Časté príčiny problémov

1. **Chýbajúce environment variables** - skontrolovať `.env` súbor
2. **Chyba v kóde** - pozrieť sa do logov
3. **Redis nedostupný** - skontrolovať Redis connection
4. **Databáza nedostupná** - skontrolovať DATABASE_URL
5. **Port už obsadený** - skontrolovať, či port nie je už používaný

## Diagnostické príkazy

```bash
# Skontrolovať environment variables
cd /var/www/premarketprice
source .env 2>/dev/null
echo $POLYGON_API_KEY | head -c 10
echo $DATABASE_URL | head -c 20

# Skontrolovať Redis
redis-cli ping

# Skontrolovať porty
netstat -tuln | grep 3000

# Skontrolovať disk space
df -h

# Skontrolovať memory
free -h
```


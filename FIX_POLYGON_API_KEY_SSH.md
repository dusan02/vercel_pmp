# Fix POLYGON_API_KEY on SSH Server

## Problém
`pmp-polygon-worker` padá s chybou: `❌ POLYGON_API_KEY not configured`

Worker sa spúšťa, ale okamžite padá, lebo nemá prístup k environment variables.

## Riešenie

### 1. Skontrolovať, či `.env` súbor existuje a obsahuje POLYGON_API_KEY

```bash
cd /var/www/premarketprice

# Skontrolovať, či existuje .env
ls -la .env

# Skontrolovať, či obsahuje POLYGON_API_KEY (bez zobrazenia hodnoty)
grep -q "POLYGON_API_KEY" .env && echo "✅ POLYGON_API_KEY exists" || echo "❌ POLYGON_API_KEY missing"

# Skontrolovať prvých 10 znakov (bez zobrazenia celej hodnoty)
grep "POLYGON_API_KEY" .env | head -c 30
```

### 2. Reštartovať procesy s --update-env (načíta environment variables znovu)

```bash
cd /var/www/premarketprice

# Reštartovať s update-env flagom
pm2 restart pmp-polygon-worker --update-env
pm2 restart pmp-bulk-preloader --update-env
pm2 restart premarketprice --update-env

# Skontrolovať status
pm2 status

# Skontrolovať logy (mal by byť bez "POLYGON_API_KEY not configured")
pm2 logs pmp-polygon-worker --lines 10 --nostream
```

### 3. Ak to nepomôže - skontrolovať ecosystem.config.js

```bash
cd /var/www/premarketprice

# Skontrolovať, či ecosystem.config.js má env_file alebo env nastavené
cat ecosystem.config.js | grep -A 5 "env_file\|env:"

# Ak chýba env_file, možno treba pridať do ecosystem.config.js
```

### 4. Alternatíva - načítať .env manuálne pred spustením

```bash
cd /var/www/premarketprice

# Načítať .env
source .env 2>/dev/null

# Skontrolovať, či je načítaný
echo $POLYGON_API_KEY | head -c 10

# Reštartovať procesy
pm2 restart all --update-env
```

### 5. Kompletný reset (ak nič nepomôže)

```bash
cd /var/www/premarketprice

# 1. Zastaviť všetko
pm2 stop all
pm2 delete all

# 2. Načítať .env
source .env 2>/dev/null

# 3. Spustiť znovu
pm2 start ecosystem.config.js

# 4. Uložiť PM2 konfiguráciu
pm2 save

# 5. Skontrolovať status
pm2 status

# 6. Skontrolovať logy
pm2 logs pmp-polygon-worker --lines 20
```

## Overenie, že to funguje

```bash
# Skontrolovať logy - nemali by byť chyby "POLYGON_API_KEY not configured"
pm2 logs pmp-polygon-worker --lines 20 --nostream | grep -i "polygon_api_key"

# Ak nie je žiadny výstup, znamená to, že problém je vyriešený
# Ak stále vidíš chyby, skús kompletný reset
```

## Časté príčiny

1. **PM2 nečíta .env automaticky** - treba použiť `--update-env` alebo nastaviť `env_file` v ecosystem.config.js
2. **.env súbor nie je v správnom priečinku** - musí byť v `/var/www/premarketprice`
3. **.env súbor nemá správne oprávnenia** - skontrolovať `ls -la .env`
4. **Environment variables nie sú exportované** - skontrolovať, či `.env` obsahuje `export POLYGON_API_KEY=...`


# Fix POLYGON_API_KEY - Final Solution

## Problém
POLYGON_API_KEY je v .env, ale worker ho stále nevidí, lebo `ecosystem.config.js` načítava .env len pri prvom spustení PM2.

## Riešenie - Úplný reštart procesov

```bash
cd /var/www/premarketprice

# 1. Zastaviť a vymazať worker procesy
pm2 delete pmp-polygon-worker
pm2 delete pmp-bulk-preloader

# 2. Spustiť znovu z ecosystem.config.js (načíta .env znovu)
pm2 start ecosystem.config.js --only pmp-polygon-worker
pm2 start ecosystem.config.js --only pmp-bulk-preloader

# 3. Skontrolovať status
pm2 status

# 4. Skontrolovať logy (nemali by byť chyby)
pm2 logs pmp-polygon-worker --lines 10 --nostream
```

## Kompletný príkaz (všetko naraz)

```bash
cd /var/www/premarketprice && pm2 delete pmp-polygon-worker pmp-bulk-preloader && pm2 start ecosystem.config.js --only pmp-polygon-worker && pm2 start ecosystem.config.js --only pmp-bulk-preloader && pm2 status
```

## Overenie

```bash
# Skontrolovať logy - nemali by byť chyby "POLYGON_API_KEY not configured"
pm2 logs pmp-polygon-worker --lines 20 --nostream | grep -i "polygon_api_key"

# Ak nie je žiadny výstup, znamená to, že problém je vyriešený ✅
# Mal by sa zobraziť napr. "🔄 Starting snapshot worker..." namiesto chýb
```

## Alternatíva - Skontrolovať, či ecosystem.config.js správne načítava .env

```bash
cd /var/www/premarketprice

# Testovať, či ecosystem.config.js vidí POLYGON_API_KEY
node -e "const fs = require('fs'); const env = fs.readFileSync('.env', 'utf8'); const match = env.match(/POLYGON_API_KEY=(.+)/); console.log(match ? 'Found: ' + match[1].substring(0, 10) + '...' : 'Not found');"
```


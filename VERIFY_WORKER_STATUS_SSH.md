# Verify Worker Status on SSH Server

## Overenie, že worker beží správne

```bash
cd /var/www/premarketprice

# 1. Skontrolovať status všetkých procesov
pm2 status

# 2. Skontrolovať aktuálne logy polygon-worker (mal by byť bez chýb)
pm2 logs pmp-polygon-worker --lines 30 --nostream

# 3. Skontrolovať, či worker naozaj beží (mal by byť "🔄 Starting snapshot worker...")
pm2 logs pmp-polygon-worker --lines 50 --nostream | tail -20

# 4. Skontrolovať error logy (mali by byť prázdne alebo bez "POLYGON_API_KEY not configured")
pm2 logs pmp-polygon-worker --err --lines 20 --nostream

# 5. Skontrolovať health endpoint
curl http://localhost:3000/api/health/worker

# 6. (Voliteľné) Skontrolovať, či worker naozaj fetuje dáta
pm2 logs pmp-polygon-worker --lines 100 --nostream | grep -E "Starting|ingest|snapshot|✅|❌" | tail -10
```

## Očakávaný výstup

Ak všetko funguje správne, mal by si vidieť:
- ✅ `pm2 status` - všetky procesy online
- ✅ Logy bez "POLYGON_API_KEY not configured"
- ✅ Logy obsahujú "🔄 Starting snapshot worker..." alebo podobné správne správy
- ✅ Health endpoint vracia `status: "healthy"`

## Ak stále vidíš problémy

```bash
# Skontrolovať, či .env súbor obsahuje POLYGON_API_KEY
grep "POLYGON_API_KEY" .env

# Testovať, či ecosystem.config.js vidí POLYGON_API_KEY
node -e "const config = require('./ecosystem.config.js'); console.log('POLYGON_API_KEY:', config.apps[1].env_production.POLYGON_API_KEY ? 'Found (' + config.apps[1].env_production.POLYGON_API_KEY.substring(0, 10) + '...)' : 'Not found');"
```


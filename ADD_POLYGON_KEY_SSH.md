# Add POLYGON_API_KEY to .env on SSH Server

## Príkazy na pridanie POLYGON_API_KEY do .env súboru

```bash
cd /var/www/premarketprice

# 1. Skontrolovať, či .env existuje
ls -la .env

# 2. Pridať POLYGON_API_KEY do .env (ak už existuje, prepíše ho)
echo "POLYGON_API_KEY=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX" >> .env

# ALEBO ak chceš nahradiť existujúci (ak existuje):
# Najprv odstrániť starý (ak existuje)
sed -i '/^POLYGON_API_KEY=/d' .env
# Potom pridať nový
echo "POLYGON_API_KEY=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX" >> .env

# 3. Overiť, že bol pridaný
grep "POLYGON_API_KEY" .env

# 4. Reštartovať procesy s --update-env
pm2 restart pmp-polygon-worker --update-env
pm2 restart pmp-bulk-preloader --update-env

# 5. Skontrolovať logy (nemali by byť chyby)
pm2 logs pmp-polygon-worker --lines 10 --nostream
```

## Kompletný príkaz (všetko naraz)

```bash
cd /var/www/premarketprice && sed -i '/^POLYGON_API_KEY=/d' .env && echo "POLYGON_API_KEY=Vi_pMLcusE8RA_SUvkPAmiyziVzlmOoX" >> .env && pm2 restart pmp-polygon-worker pmp-bulk-preloader --update-env && pm2 logs pmp-polygon-worker --lines 5 --nostream
```

## Overenie

```bash
# Skontrolovať, či už nie sú chyby "POLYGON_API_KEY not configured"
pm2 logs pmp-polygon-worker --lines 20 --nostream | grep -i "polygon_api_key"

# Ak nie je žiadny výstup, znamená to, že problém je vyriešený ✅
# Mal by sa zobraziť napr. "🔄 Starting snapshot worker..." namiesto chýb
```


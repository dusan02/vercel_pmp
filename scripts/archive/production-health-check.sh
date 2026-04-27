#!/bin/bash

# MONITORING SCRIPT - KONTROLA ZDRAVIA PRODUKCIE
# Použiť po novom nasadení

echo "🏥 KONTROLA ZDRAVIA PREMARKETPRICE PRODUKCIE"
echo "============================================"

# 1. Základná kontrola webu
echo "1. 🌐 KONTROLA WEB STRÁNKY:"
echo "   - HTTPS Status:"
curl -k -s -w "Status: %{http_code}\n" https://premarketprice.com | head -1
echo "   - Health API:"
curl -k -s https://premarketprice.com/api/health | grep -o '"status":"[^"]*"' || echo "   - Health: N/A"

# 2. Kontrola SSL certifikátu
echo ""
echo "2. 🔒 KONTROLA SSL CERTIFIKÁTU:"
openssl x509 -in /etc/letsencrypt/live/premarketprice.com/fullchain.pem -noout -dates 2>/dev/null || echo "   - SSL: Nepodarilo sa zistiť"

# 3. Kontrola PM2 procesov
echo ""
echo "3. 🚀 KONTROLA PM2 PROCESOV:"
pm2 status | grep -E "(premarketprice|pmp-polygon-worker|pmp-bulk-preloader)" | head -5

# 4. Kontrola portu 3000
echo ""
echo "4. 🔌 KONTROLA PORTU 3000:"
ss -tlnp | grep :3000 || echo "   - Port 3000: Neaktívny"

# 5. Test lokálneho API
echo ""
echo "5. 📡 TEST LOKÁLNEHO API:"
curl -s http://127.0.0.1:3000/api/health | head -1 || echo "   - Lokálne API: Nereaguje"

# 6. Kontrola NGINX statusu
echo ""
echo "6. 🌐 KONTROLA NGINX:"
systemctl is-active nginx || echo "   - Nginx: Neaktívny"

# 7. Kontrola databázy (ak je SQLite)
echo ""
echo "7. 💾 KONTROLA DATABÁZY:"
if [ -f "/var/www/premarketprice/prisma/data/premarket.db" ]; then
    echo "   - SQLite DB: Existuje"
    echo "   - Veľkosť: $(du -h /var/www/premarketprice/prisma/data/premarket.db | cut -f1)"
else
    echo "   - SQLite DB: Neexistuje"
fi

# 8. Kontrola posledných NGINX error logov
echo ""
echo "8. 📝 POSLEDNÉ NGINX ERRORY:"
tail -5 /var/log/nginx/error.log 2>/dev/null | grep -E "(error|crit)" || echo "   - Žiadne nedávne NGINX errory"

# 9. Kontrola Redis (ak beží)
echo ""
echo "9. 🔴 KONTROLA REDIS:"
redis-cli ping 2>/dev/null || echo "   - Redis: Nedostupný"

# 10. Heatmap dáta kontrola
echo ""
echo "10. 🗺️  KONTROLA HEATMAP DÁT:"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "/var/www/premarketprice/prisma/data/premarket.db" ]; then
    SESSION_COUNT=$(sqlite3 /var/www/premarketprice/prisma/data/premarket.db "SELECT COUNT(*) FROM SessionPrice;" 2>/dev/null || echo "0")
    DAILYREF_COUNT=$(sqlite3 /var/www/premarketprice/prisma/data/premarket.db "SELECT COUNT(*) FROM DailyRef;" 2>/dev/null || echo "0")
    echo "   - SessionPrice: $SESSION_COUNT záznamov"
    echo "   - DailyRef: $DAILYREF_COUNT záznamov"
else
    echo "   - Heatmap dáta: Nepodarilo sa zistiť"
fi

echo ""
echo "✅ KONTROLA DOKONČENÁ!"
echo "📊 Ak všetko funguje, malo by zobraziť:"
echo "   - HTTPS Status: 200"
echo "   - Health: healthy/degraded"
echo "   - PM2: 3+ online procesy"
echo "   - Port 3000: LISTEN"
echo "   - Lokálne API: JSON odpoveď"
echo "   - Nginx: active"
echo "   - Heatmap dáta: >0 záznamov"

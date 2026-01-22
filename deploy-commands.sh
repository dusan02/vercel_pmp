#!/bin/bash
# 🚀 Rýchly deploy skript pre PremarketPrice na VPS
# Použitie: ssh root@89.185.250.213 a potom spustiť tento skript

set -e  # Zastaviť pri chybe

echo "🚀 Začínam nasadenie PremarketPrice..."

# 1. Prejsť do správneho adresára
cd /var/www/premarketprice
echo "✅ Adresár: $(pwd)"

# 2. Aktualizovať kód (ak používate git)
# echo "📥 Aktualizujem kód..."
# git pull origin main || git pull origin master

# 3. Inštalovať závislosti
echo "📦 Inštalujem závislosti..."
npm install

# 4. Generovať Prisma klienta
echo "🗄️ Generujem Prisma klienta..."
npx prisma generate

# 5. Build aplikácie
echo "🔨 Buildujem aplikáciu..."
npm run build

# 6. Zastaviť staré procesy
echo "🛑 Zastavujem staré PM2 procesy..."
pm2 stop premarketprice 2>/dev/null || true
pm2 delete premarketprice 2>/dev/null || true
pm2 stop pmp-polygon-worker 2>/dev/null || true
pm2 delete pmp-polygon-worker 2>/dev/null || true
pm2 stop pmp-bulk-preloader 2>/dev/null || true
pm2 delete pmp-bulk-preloader 2>/dev/null || true

# 7. Spustiť nové procesy
echo "▶️ Spúšťam nové PM2 procesy..."
pm2 start ecosystem.config.js --env production

# 8. Uložiť PM2 konfiguráciu
echo "💾 Ukladám PM2 konfiguráciu..."
pm2 save

# 9. Zobraziť status
echo "📊 Status PM2 procesov:"
pm2 status

# 10. Skontrolovať porty
echo "🔍 Kontrolujem porty:"
netstat -tlnp | grep -E '3000|443|80' || ss -tlnp | grep -E '3000|443|80'

# 11. Skontrolovať logy (posledných 10 riadkov)
echo "📋 Posledné logy premarketprice:"
pm2 logs premarketprice --lines 10 --nostream

echo ""
echo "✅ Nasadenie dokončené!"
echo ""
echo "📝 Ďalšie kroky:"
echo "1. Skontrolovať logy: pm2 logs"
echo "2. Generovať SSL certifikáty: certbot certonly --nginx -d premarketprice.com -d www.premarketprice.com"
echo "3. Skontrolovať Nginx: nginx -t && systemctl reload nginx"


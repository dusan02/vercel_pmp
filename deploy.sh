#!/bin/bash
# 🚀 Rýchly deployment script pre PremarketPrice
# Tento script sa spúšťa na serveri po SSH prihlásení

set -e  # Zastaviť pri chybe

echo "🚀 Začínam nasadenie PremarketPrice..."
echo ""

# 1. Prejsť do správneho adresára
cd /var/www/premarketprice
echo "✅ Adresár: $(pwd)"

# 2b. Node version sanity check (stability for native deps like better-sqlite3)
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "")"
if [ "$NODE_MAJOR" != "20" ]; then
  echo "⚠️  WARNING: Recommended Node.js major is 20.x (current: $(node -v 2>/dev/null || echo 'unknown'))"
  echo "    Native dependencies (e.g. better-sqlite3) may fail to install/build on other versions."
fi

# 2. Aktualizovať kód z gitu
echo "📥 Aktualizujem kód z gitu..."
git pull origin main

# 3. Inštalovať závislosti
echo "📦 Inštalujem závislosti..."
npm ci

# 4. Generovať Prisma klienta
echo "🗄️ Generujem Prisma klienta..."
npx prisma generate

# 5. Build aplikácie
echo "🔨 Buildujem aplikáciu..."
npm run build

# 6. Reštartovať PM2 procesy
echo "🔄 Reštartujem PM2 procesy..."
pm2 restart premarketprice --update-env

# 7. Zobraziť status
echo ""
echo "📊 Status PM2 procesov:"
pm2 status

echo ""
echo "✅ Nasadenie dokončené!"

#!/bin/bash
# Reštart aplikácie a vyčistenie Next.js cache

cd /var/www/premarketprice

echo "🔄 Reštartujem aplikáciu a čistím cache..."

# 1. Zastav PM2 procesy
echo "⏹️  Zastavujem PM2 procesy..."
pm2 stop all

# 2. Vyčisti Next.js cache
echo "🧹 Čistím Next.js cache..."
rm -rf .next

# 3. Skontroluj, či sú zmeny na serveri
echo "📥 Kontrolujem zmeny z gitu..."
git pull origin main

# 4. Spusti nový build
echo "🔨 Spúšťam nový build..."
npm run build

# 5. Reštartuj PM2 procesy
echo "▶️  Reštartujem PM2 procesy..."
pm2 restart ecosystem.config.js --update-env

# 6. Počkať 15 sekúnd
echo "⏳ Čakám 15 sekúnd..."
sleep 15

# 7. Skontroluj status
echo "✅ Kontrolujem status..."
pm2 status

echo "🎉 Hotovo! Aplikácia bola reštartovaná a cache vyčistená."


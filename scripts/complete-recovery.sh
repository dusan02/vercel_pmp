#!/bin/bash

# Complete Application Recovery Script
echo "=== COMPLETE APPLICATION RECOVERY ==="
echo "=================================="

# 1. Zastav všetko
echo "1. Zastavujem všetky PM2 procesy..."
pm2 stop all
pm2 delete all

# 2. Počkaj
sleep 5

# 3. Spusti hlavnú aplikáciu
echo "2. Spúšťam hlavnú aplikáciu..."
cd /var/www/premarketprice
npm run start &

# 4. Počkaj na štart
sleep 10

# 5. Spusti PM2 procesy
echo "3. Spúšťam PM2 procesy..."
pm2 start ecosystem.config.js --env production

# 6. Počkaj
sleep 10

# 7. Status
echo "4. Status aplikácie:"
curl -k -s https://premarketprice.com/api/health | head -5

echo "5. PM2 Status:"
pm2 status | head -10

echo "=== RECOVERY COMPLETE ==="

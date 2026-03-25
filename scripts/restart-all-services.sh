#!/bin/bash

# PM2 Restart Script for PreMarketPrice
echo "=== PM2 RESTART SCRIPT ==="
echo "========================"

# Zastav všetky procesy
echo "1. Zastavujem všetky PM2 procesy..."
pm2 stop all

# Počkaj 5 sekúnd
sleep 5

# Spusti všetky procesy
echo "2. Spúšťam všetky PM2 procesy..."
pm2 start all

# Počkaj 10 sekúnd
sleep 10

# Zobraz status
echo "3. PM2 Status:"
pm2 status

echo "4. Health check:"
curl -s https://premarketprice.com/api/health | grep -o '"status":"[^"]*"'

echo "=== PM2 RESTART DOKONČENÝ ==="

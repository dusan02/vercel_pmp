#!/bin/bash

echo "🔍 Diagnostika PostgreSQL a Resetu Dát"
echo "=================================="

echo "1. Skontrola PostgreSQL Status..."
sudo -u postgres psql -c "SELECT version();" 2>/dev/null || echo "❌ PostgreSQL pripojenie zlyhalo"

echo ""
echo "2. Skontrola PM2 Environment..."
pm2 show premarketprice | grep -E "(env|DATABASE_URL)" || echo "❌ PM2 premenné nenájdené"

echo ""
echo "3. Skontrola .env File..."
if [ -f "/var/www/premarketprice/.env" ]; then
    echo "✅ .env file existuje"
    echo "Obsah .env:"
    cat /var/www/premarketprice/.env | grep -E "(POSTGRES|DATABASE)" || echo "❌ Žiadne PostgreSQL premenné v .env"
else
    echo "❌ .env file neexistuje"
fi

echo ""
echo "4. Test pripojenia k PostgreSQL..."
sudo -u postgres psql -c "SELECT 1;" 2>/dev/null && echo "✅ PostgreSQL pripojenie funguje" || echo "❌ PostgreSQL pripojenie zlyhalo"

echo ""
echo "5. Kontrola existujúcich tickerov..."
sudo -u postgres psql -c "SELECT COUNT(*) FROM ticker;" 2>/dev/null && echo "✅ Počet tickerov v databáze" || echo "❌ Chyba pri počítaní tickerov"

echo ""
echo "=================================="
echo "🎯 Ak všetky testy prejdú, PostgreSQL je pripravený na reset dát"

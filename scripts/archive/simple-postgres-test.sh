#!/bin/bash

echo "🔍 Jednoduchá PostgreSQL Diagnostika"
echo "=================================="

echo "1. Test pripojenia k PostgreSQL..."
psql postgresql://postgres:password@localhost:5432/premarketprice -c "SELECT version();" 2>/dev/null && echo "✅ PostgreSQL pripojenie funguje" || echo "❌ PostgreSQL pripojenie zlyhalo"

echo ""
echo "2. Kontrola existujúcich tickerov..."
psql postgresql://postgres:password@localhost:5432/premarketprice -c "SELECT COUNT(*) FROM ticker;" 2>/dev/null && echo "✅ Počet tickerov v databáze" || echo "❌ Chyba pri počítaní tickerov"

echo ""
echo "3. Kontrola .env premenných..."
if [ -f ".env" ]; then
    echo "✅ .env file existuje"
    echo "DATABASE_URL obsah:"
    grep DATABASE_URL .env || echo "❌ DATABASE_URL nenájdená"
else
    echo "❌ .env file neexistuje"
fi

echo ""
echo "🎯 Diagnostika dokončená"

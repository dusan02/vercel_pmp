#!/bin/bash
# 🔍 Skript na nájdenie umiestnenia projektu PremarketPrice na serveri

echo "🔍 Hľadám projekt PremarketPrice na serveri..."
echo ""

# 1. Hľadať adresáre
echo "📁 Hľadám adresáre s názvom 'premarketprice' alebo 'pmp':"
find / -type d -name "*premarketprice*" 2>/dev/null | head -10
find / -type d -name "*pmp*" 2>/dev/null | grep -v node_modules | head -10
echo ""

# 2. Hľadať súbory
echo "📄 Hľadám súbory ecosystem.config.js:"
find / -name "ecosystem.config.js" 2>/dev/null | head -5
echo ""

echo "📄 Hľadám súbory server.ts:"
find / -name "server.ts" 2>/dev/null | grep -v node_modules | head -5
echo ""

echo "📄 Hľadám package.json s 'premarketprice':"
find / -name "package.json" 2>/dev/null | xargs grep -l "premarketprice" 2>/dev/null | head -5
echo ""

# 3. Skontrolovať bežné adresáre
echo "📂 Kontrolujem bežné webové adresáre:"
for dir in /var/www /srv /home /opt /usr/local /root; do
    if [ -d "$dir" ]; then
        echo "  $dir:"
        ls -la "$dir" 2>/dev/null | grep -E "(premarket|pmp)" | head -3
    fi
done
echo ""

# 4. Skontrolovať PM2 procesy
echo "🔧 Informácie o PM2 procesoch:"
if pm2 list | grep -q premarketprice; then
    echo "  Premarketprice proces existuje:"
    pm2 describe premarketprice 2>/dev/null | grep -E "(cwd|script|path)" || echo "  (proces nebeží)"
else
    echo "  Premarketprice proces neexistuje v PM2"
fi
echo ""

# 5. Skontrolovať earnings proces (môže byť v tom istom adresári)
echo "🔧 Informácie o earnings-table procese (môže byť v tom istom adresári):"
if pm2 list | grep -q earnings-table; then
    pm2 describe earnings-table 2>/dev/null | grep -E "(cwd|script|path)" || echo "  (nie je dostupné)"
fi
echo ""

echo "✅ Vyhľadávanie dokončené!"
echo ""
echo "💡 Tip: Pozrite sa na 'cwd' (current working directory) v PM2 describe výstupe"


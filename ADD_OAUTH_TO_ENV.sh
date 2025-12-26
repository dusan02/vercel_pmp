#!/bin/bash
# 🔧 Príkaz na pridanie Google OAuth nastavení do .env súboru
# Použitie: Spustite tento príkaz na serveri

cd /var/www/premarketprice

# Pridanie Google OAuth nastavení na koniec .env súboru
cat >> .env << 'EOF'

# Google OAuth Configuration
GOOGLE_CLIENT_ID=47392532694-0oi9lef3mj7aoa2159bgmtrmncihvdt1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE

# NextAuth Configuration
AUTH_SECRET=YOUR_AUTH_SECRET_HERE
NEXTAUTH_URL=https://premarketprice.com
EOF

echo "✅ Google OAuth nastavenia pridané do .env súboru"
echo ""
echo "⚠️  DÔLEŽITÉ: Musíte upraviť .env súbor a nahradiť:"
echo "   - YOUR_CLIENT_SECRET_HERE → váš skutočný GOOGLE_CLIENT_SECRET"
echo "   - YOUR_AUTH_SECRET_HERE → váš skutočný AUTH_SECRET (alebo vygenerujte: openssl rand -base64 32)"
echo ""
echo "Potom spustite: nano .env"



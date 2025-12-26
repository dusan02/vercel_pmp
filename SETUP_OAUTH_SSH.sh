#!/bin/bash
# 🔧 Script na nastavenie Google OAuth na serveri
# Použitie: ./SETUP_OAUTH_SSH.sh

cd /var/www/premarketprice

echo "🔍 Kontrola aktuálneho .env súboru..."
echo ""

# Zobraziť aktuálne OAuth nastavenia (bez zobrazenia secretov)
if [ -f .env ]; then
    echo "Aktuálne nastavenia:"
    grep -E "GOOGLE|AUTH|NEXTAUTH" .env | sed 's/=.*/=***/' || echo "  Žiadne OAuth nastavenia"
else
    echo "⚠️  .env súbor neexistuje, vytvorím nový"
fi

echo ""
echo "📝 Nastavenie Google OAuth..."
echo ""

# Client ID (už máme)
GOOGLE_CLIENT_ID="47392532694-0oi9lef3mj7aoa2159bgmtrmncihvdt1.apps.googleusercontent.com"

# Požiadať o Client Secret
echo "Zadajte GOOGLE_CLIENT_SECRET (z Google Cloud Console):"
read -s GOOGLE_CLIENT_SECRET
echo ""

# Požiadať o AUTH_SECRET (alebo použiť existujúci)
echo "Zadajte AUTH_SECRET (alebo stlačte Enter pre použitie existujúceho):"
read -s AUTH_SECRET_INPUT
if [ -z "$AUTH_SECRET_INPUT" ]; then
    # Skúsiť načítať existujúci
    if [ -f .env ]; then
        AUTH_SECRET=$(grep "^AUTH_SECRET=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ -z "$AUTH_SECRET" ]; then
            AUTH_SECRET=$(grep "^NEXTAUTH_SECRET=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        fi
    fi
    if [ -z "$AUTH_SECRET" ]; then
        echo "⚠️  AUTH_SECRET nebol nájdený, vygenerujem nový..."
        AUTH_SECRET=$(openssl rand -base64 32)
        echo "✅ Vygenerovaný AUTH_SECRET: ${AUTH_SECRET:0:20}..."
    else
        echo "✅ Používam existujúci AUTH_SECRET"
    fi
else
    AUTH_SECRET="$AUTH_SECRET_INPUT"
fi

# NEXTAUTH_URL
NEXTAUTH_URL="https://premarketprice.com"

echo ""
echo "📋 Zhrnutie nastavení:"
echo "  GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:30}..."
echo "  GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:+SET}"
echo "  AUTH_SECRET: ${AUTH_SECRET:0:20}..."
echo "  NEXTAUTH_URL: $NEXTAUTH_URL"
echo ""

read -p "Pokračovať s nastavením? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Zrušené"
    exit 1
fi

# Zálohovať existujúci .env
if [ -f .env ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Záloha .env vytvorená"
fi

# Pridať/aktualizovať OAuth nastavenia v .env
if [ -f .env ]; then
    # Odstrániť staré OAuth nastavenia
    sed -i '/^GOOGLE_CLIENT_ID=/d' .env
    sed -i '/^GOOGLE_CLIENT_SECRET=/d' .env
    sed -i '/^AUTH_SECRET=/d' .env
    sed -i '/^NEXTAUTH_SECRET=/d' .env
    sed -i '/^NEXTAUTH_URL=/d' .env
fi

# Pridať nové nastavenia
cat >> .env << EOF

# Google OAuth Configuration
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

# NextAuth Configuration
AUTH_SECRET=$AUTH_SECRET
NEXTAUTH_URL=$NEXTAUTH_URL
EOF

echo "✅ .env súbor aktualizovaný"
echo ""

# Skontrolovať, či ecosystem.config.js obsahuje OAuth premenné
if grep -q "GOOGLE_CLIENT_ID" ecosystem.config.js; then
    echo "✅ ecosystem.config.js obsahuje OAuth premenné"
else
    echo "⚠️  ecosystem.config.js neobsahuje OAuth premenné"
    echo "   Musíte aktualizovať ecosystem.config.js manuálne"
fi

echo ""
echo "🔄 Reštartovanie aplikácie..."
pm2 restart all

echo ""
echo "⏳ Čakám 5 sekúnd..."
sleep 5

echo ""
echo "🔍 Kontrola logov..."
pm2 logs premarketprice --lines 10 --nostream | grep -i "oauth\|google\|auth" || echo "  Žiadne OAuth logy"

echo ""
echo "✅ Hotovo!"
echo ""
echo "📝 Ďalšie kroky:"
echo "1. Skontrolujte logy: pm2 logs premarketprice"
echo "2. Test API: curl http://localhost:3000/api/auth/providers"
echo "3. Test na produkcii: https://premarketprice.com - kliknite 'Sign In'"


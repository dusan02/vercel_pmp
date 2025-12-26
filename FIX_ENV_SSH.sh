#!/bin/bash
# 🔧 Kompletné príkazy na opravu .env súboru bez nano
# Spustite všetky príkazy naraz

cd /var/www/premarketprice

echo "🔧 Opravujem .env súbor..."

# 1. Nahradiť AUTH_SECRET
sed -i 's/AUTH_SECRET=YOUR_AUTH_SECRET_HERE/AUTH_SECRET=PmvYkCGSptpV153YHddjgQtcWRL0GdZJ00t0\/1VTyOw=/' .env

# 2. Odstrániť duplikát NEXTAUTH_URL (odstrániť prvý výskyt, nechať posledný)
sed -i '0,/^NEXTAUTH_URL=https:\/\/premarketprice\.com$/d' .env

# 3. Skontrolovať výsledok
echo ""
echo "✅ Opravené! Kontrola:"
echo ""
grep -E "GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|AUTH_SECRET|NEXTAUTH_URL" .env | head -4

echo ""
echo "⚠️  DÔLEŽITÉ: Musíte ešte nahradiť GOOGLE_CLIENT_SECRET!"
echo "   Použite: sed -i 's/GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE/GOOGLE_CLIENT_SECRET=VAŠ_SKUTOČNÝ_SECRET/' .env"
echo ""
echo "   Alebo: nano .env (ak chcete manuálne)"



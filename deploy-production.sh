#!/bin/bash
# Production Deployment Script
# Automatizuje SSH prihlásenie a deployment na produkciu
#
# Použitie:
#   ./deploy-production.sh
#   alebo s explicitným heslom:
#   SSH_PASSWORD="sfdsfae" ./deploy-production.sh

set -e  # Exit on error

SERVER_IP="${SERVER_IP:-89.185.250.213}"
USER="${SSH_USER:-root}"
PASSWORD="${SSH_PASSWORD}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/premarketprice}"

echo "🚀 Starting deployment to $USER@$SERVER_IP..."
echo ""

# Metóda 1: Použiť sshpass (ak je heslo poskytnuté)
if [ -n "$PASSWORD" ]; then
    echo "📝 Using sshpass with password..."
    
    # Kontrola, či je sshpass nainštalovaný
    if ! command -v sshpass &> /dev/null; then
        echo "⚠️  sshpass is not installed. Installing..."
        # Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y sshpass
        # macOS
        elif command -v brew &> /dev/null; then
            brew install hudochenkov/sshpass/sshpass
        else
            echo "❌ Cannot install sshpass automatically. Please install it manually."
            exit 1
        fi
    fi
    
    # Spustenie príkazov cez SSH s heslom
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$USER@$SERVER_IP" << 'ENDSSH'
cd /var/www/premarketprice
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart premarketprice --update-env
ENDSSH

# Metóda 2: Použiť SSH kľúč (ak nie je heslo)
else
    echo "🔑 Using SSH key authentication (recommended)..."
    echo ""
    
    # Spustenie príkazov cez SSH
    ssh -o StrictHostKeyChecking=no "$USER@$SERVER_IP" << 'ENDSSH'
cd /var/www/premarketprice
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart premarketprice --update-env
ENDSSH
fi

echo ""
echo "✅ Deployment successful!"

#!/bin/bash
# Fix sectors for tickers: LNG, SE, B, ING, HEI, E, NU, HLN, NGG
# Run this on production server via SSH

echo "🔧 Fixing sectors for tickers on production..."

# Option 1: Call API endpoint (recommended - easiest)
echo "📡 Calling API endpoint..."
curl -s https://premarketprice.com/api/fix-other-sectors | jq '.'

# Option 2: If API doesn't work, run TypeScript script directly
# Uncomment the following lines if API endpoint doesn't work:
# echo "📝 Running TypeScript script..."
# cd /var/www/premarketprice/pmp_prod
# npx tsx scripts/fix-other-sector-tickers.ts

echo ""
echo "✅ Done! Check the output above for results."

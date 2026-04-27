#!/bin/bash
# Helper script to find the project directory

echo "🔍 Looking for pmp_prod directory..."

# Common locations
PATHS=(
  "/root/pmp_prod"
  "/home/*/pmp_prod"
  "/var/www/pmp_prod"
  "/opt/pmp_prod"
  "$(pwd)/pmp_prod"
  "$(dirname "$0")/.."
)

for path in "${PATHS[@]}"; do
  if [ -d "$path" ] && [ -f "$path/package.json" ]; then
    echo "✅ Found project at: $path"
    echo ""
    echo "To run scripts, use:"
    echo "  cd $path"
    echo "  npx tsx scripts/check-prod-prevclose-issue.ts MSFT --fix"
    exit 0
  fi
done

echo "❌ Could not find pmp_prod directory"
echo ""
echo "Please run this from the pmp_prod directory, or provide the path:"
echo "  cd /path/to/pmp_prod"
echo "  npx tsx scripts/check-prod-prevclose-issue.ts MSFT --fix"

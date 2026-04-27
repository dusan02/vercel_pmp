#!/bin/bash
# Start bulk preloader worker manually
# Usage: ./scripts/start-bulk-preloader.sh

cd "$(dirname "$0")/.."

# Check if POLYGON_API_KEY is set
if [ -z "$POLYGON_API_KEY" ]; then
  echo "❌ POLYGON_API_KEY not set. Please set it in .env or export it."
  exit 1
fi

# Run the preloader
echo "🚀 Starting bulk preloader..."
npx ts-node src/workers/backgroundPreloader.ts


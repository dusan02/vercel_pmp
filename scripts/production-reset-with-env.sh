#!/bin/bash

# Production Data Reset with Environment Override
echo "🚀 Starting Production Data Reset with Environment Override..."

# Set environment variables explicitly
export FORCE_PRODUCTION_RESET=true
export DATABASE_URL="postgresql://postgres:password@localhost:5432/premarketprice"

# Run the reset script
npm run reset-prod-data

echo "✅ Reset completed. Now starting refresh..."

# Set environment for refresh
export DATABASE_URL="postgresql://postgres:password@localhost:5432/premarketprice"

# Run the refresh script
npm run refresh-prod-data

echo "🎉 Production data reset and refresh completed!"

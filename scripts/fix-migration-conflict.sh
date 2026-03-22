#!/bin/bash

# Script to fix migration conflict on production server
# Run this on the production server to resolve altmanZ column conflict

echo "🔧 Fixing Prisma migration conflict..."

# Step 1: Mark the failed migration as applied
echo "📝 Marking failed migration as applied..."
npx prisma migrate resolve --applied 20260322202039_add_valuation_charts

# Step 2: Create and apply the resolution migration
echo "🔄 Creating resolution migration..."
npx prisma migrate dev --name resolve_altmanz_conflict --skip-seed

# Step 3: Generate Prisma client
echo "⚙️ Generating Prisma client..."
npx prisma generate

# Step 4: Verify database status
echo "🔍 Checking database status..."
npx prisma migrate status

echo "✅ Migration conflict resolved!"
echo "Now you can run: npm run build"

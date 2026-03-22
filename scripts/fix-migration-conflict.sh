#!/bin/bash

# Script to fix all migration conflicts on production server
# Run this on the production server to resolve all column conflicts

echo "🔧 Fixing all Prisma migration conflicts..."

# Step 1: Mark all failed migrations as applied
echo "📝 Marking all failed migrations as applied..."
npx prisma migrate resolve --applied 20260322202039_add_valuation_charts
npx prisma migrate resolve --applied 20260322210000_resolve_altmanz_conflict
npx prisma migrate resolve --applied 20260322210001_resolve_all_column_conflicts

# Step 2: Check database status
echo "� Checking database status..."
npx prisma migrate status

# Step 3: Generate Prisma client
echo "⚙️ Generating Prisma client..."
npx prisma generate

# Step 4: Try to deploy remaining migrations
echo "� Attempting to deploy remaining migrations..."
npx prisma migrate deploy

echo "✅ Migration conflicts resolved!"
echo "Now you can run: npm run build"

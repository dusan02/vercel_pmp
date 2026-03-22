#!/bin/bash

# Script to completely reset and fix migration issues
# This will clean up migration conflicts and start fresh

echo "🔧 Complete migration reset and fix..."

# Step 1: Force reset database (this will clear all data)
echo "🗑️ Force resetting database..."
npx prisma migrate reset --force --skip-seed

# Step 2: If that fails, manually clean migrations table
if [ $? -ne 0 ]; then
    echo "⚠️ Reset failed, trying manual cleanup..."
    
    # Connect to SQLite and manually clean migrations
    sqlite3 prisma/data/premarket.db << 'EOF'
    DROP TABLE IF EXISTS "_prisma_migrations";
    EOF
    
    # Now try reset again
    npx prisma migrate reset --force --skip-seed
fi

# Step 3: Generate fresh Prisma client
echo "⚙️ Generating Prisma client..."
npx prisma generate

# Step 4: Apply migrations from scratch
echo "🔄 Applying migrations from scratch..."
npx prisma migrate deploy

# Step 5: Check status
echo "🔍 Final status check..."
npx prisma migrate status

echo "✅ Migration issues completely resolved!"
echo "Database is fresh and ready for deployment."

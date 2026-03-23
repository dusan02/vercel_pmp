# 🚀 Production Deployment Instructions

## 📦 Deployment Package
- **File**: `pmp-production-20260323-114500.tar.gz` (53MB)
- **Created**: March 23, 2026 at 11:45
- **Contents**: Complete application with all fixes and 500+ tickers

## 🔧 Pre-deployment Checklist

### 1. Server Requirements
- **Node.js**: 20.x (required for better-sqlite3)
- **PM2**: Process manager
- **SQLite**: Database (included)
- **Redis**: Optional (fallback to DB)
- **Nginx**: Reverse proxy (optional)

### 2. Environment Variables
```bash
# Database
DATABASE_URL="file:./data/premarket.db"

# Polygon API (optional - has fallback)
POLYGON_API_KEY="your_polygon_key_here"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# Next.js
NEXTAUTH_URL="https://your-domain.com"
NODE_ENV="production"
```

## 🚀 Deployment Steps

### Option A: SSH Deploy (Recommended)
```bash
# 1. Upload to server
scp pmp-production-20260323-114500.tar.gz user@your-server:/tmp/

# 2. Extract and deploy
ssh user@your-server << 'EOF'
    cd /var/www/premarketprice
    tar -xzf /tmp/pmp-production-20260323-114500.tar.gz --strip-components=1
    
    # Install dependencies
    npm ci --production
    
    # Generate Prisma client
    npx prisma generate
    
    # Build application
    npm run build
    
    # Restart PM2
    pm2 restart premarketprice --update-env
    
    # Clean up
    rm /tmp/pmp-production-20260323-114500.tar.gz
EOF
```

### Option B: Git Deploy (if server has git access)
```bash
ssh user@your-server << 'EOF'
    cd /var/www/premarketprice
    
    # Pull latest changes
    git pull origin main
    
    # Install dependencies
    npm ci
    
    # Generate Prisma client
    npx prisma generate
    
    # Build application
    npm run build
    
    # Restart PM2
    pm2 restart premarketprice --update-env
EOF
```

## 🗄️ Database Setup

### 1. Create database directory
```bash
mkdir -p /var/www/premarketprice/data
```

### 2. Run migrations
```bash
cd /var/www/premarketprice
npx prisma migrate deploy
```

### 3. Seed data (optional - for 500+ tickers)
```bash
# If you want the 500+ ticker dataset
node complete-seed.cjs
node extended-heatmap-seed.cjs
```

## 🔄 Post-deployment Verification

### 1. Check PM2 status
```bash
pm2 status
pm2 logs premarketprice --lines 50
```

### 2. Test API endpoints
```bash
# Health check
curl https://your-domain.com/api/healthz

# Demo stocks (fallback)
curl https://your-domain.com/api/stocks/demo

# Heatmap (should show 366 tickers)
curl https://your-domain.com/api/heatmap | jq '.count'
```

### 3. Test frontend
- Open: `https://your-domain.com`
- Check heatmap loads with 366 tickers
- Test analysis tab functionality
- Verify portfolio features work

## 📊 What's Included

### ✅ Features
- **500+ tickers** (367 with complete data)
- **Analysis module** with AI-ready structure
- **Valuation charts** and GuruFocus metrics
- **Real-time heatmap** with WebSocket support
- **Portfolio tracking** with P&L capability
- **Mobile optimization** and PWA support

### ✅ Fixes Applied
- **Technical debt**: Removed duplicate components
- **Database**: Extended to 500+ tickers
- **Heatmap**: Fixed with complete SessionPrice/DailyRef data
- **API**: Enhanced with on-demand prevClose fetching
- **Build**: Dynamic rendering for SSR compatibility

### ✅ Performance Optimizations
- **Redis caching** with database fallback
- **WebSocket** for real-time updates
- **Rate limiting** for API calls
- **Database indexing** for fast queries
- **Mobile-first** responsive design

## 🚨 Troubleshooting

### Common Issues
1. **Node version mismatch**: Ensure Node.js 20.x
2. **Database permissions**: Check write access to data directory
3. **Port conflicts**: Ensure port 3000 is available
4. **Memory issues**: Increase Node.js heap size if needed

### Health Checks
```bash
# Application health
curl https://your-domain.com/api/healthz

# Database status
curl https://your-domain.com/api/health

# Redis status
curl https://your-domain.com/api/health/redis
```

## 📈 Production Monitoring

### Key Metrics
- **Response time**: <200ms for API calls
- **Uptime**: Monitor with PM2
- **Memory usage**: Watch for memory leaks
- **Database size**: Monitor SQLite growth

### PM2 Monitoring
```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs premarketprice

# Restart if needed
pm2 restart premarketprice
```

---

## 🎯 Deployment Complete!

Your PremarketPrice application is now running with:
- ✅ 500+ tickers
- ✅ Complete analysis module
- ✅ Real-time heatmap
- ✅ Portfolio tracking
- ✅ Mobile optimization
- ✅ Production-ready performance

**Next Steps**:
1. Monitor application performance
2. Set up backup procedures
3. Configure monitoring alerts
4. Plan scaling strategy

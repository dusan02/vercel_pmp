# Technical Architecture Documentation

## Overview
This document provides comprehensive technical documentation for the PMP (Portfolio Management Platform) application architecture, focusing on the current implementation state after recent heatmap fixes and Antigravity optimizations.

## 🏗️ **Current Architecture**

### Application Stack
```
Frontend: React/Next.js 16.0.10 (Turbopack)
Backend: Node.js with TypeScript
Database: SQLite with Prisma ORM
Cache: Redis (session & data caching)
Real-time: WebSocket connections
Deployment: PM2 on Ubuntu server
```

### Project Structure
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   ├── heatmap/           # Heatmap page
│   ├── company/           # Company analysis
│   └── layout.tsx         # Root layout
├── components/             # Reusable React components
│   ├── analysis/          # Analysis components
│   ├── company/           # Company-specific components
│   ├── home/              # Homepage components
│   └── DevCacheClear.tsx  # Development utility
├── lib/                   # Utility libraries
│   ├── utils/             # Helper functions
│   │   ├── heatmapLayout.ts # Heatmap hierarchy logic
│   │   ├── heatmapColors.ts # Color scaling
│   │   ├── marketCapUtils.ts # Market cap calculations
│   │   └── sectorIndustryValidator.ts # Sector validation
│   ├── heatmap/            # Heatmap-specific types
│   └── workers/            # Background job definitions
├── workers/               # Background processes
│   ├── polygonWorker.ts   # Polygon API integration
│   └── backgroundPreloader.ts # Data preloading
└── data/                  # Static data
    ├── defaultTickers.ts  # Default stock list
    └── sectorIndustryOverrides.ts # Sector corrections
```

## 📊 **Heatmap Implementation**

### Data Flow Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Polygon API   │───▶│   SessionPrice  │───▶│   Ticker DB    │
│   (Real-time)   │    │   (Current)    │    │   (Denorm)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Heatmap API (/api/heatmap/route.ts)        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Cache     │  │   Session   │  │   Ticker    │ │
│  │   Hit       │  │   Path      │  │   Path      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Heatmap UI   │
                    │   (D3.js)      │
                    └─────────────────┘
```

### Hierarchy Building Process
```typescript
// 1. Data Collection
const tickers = await fetchTickers(); // From database
const prices = await fetchPrices(); // From cache/API

// 2. Hierarchy Construction
const hierarchy = buildHeatmapHierarchy(data, 'percent');
/*
Root
├── Technology (Large Sector)
│   ├── Software (Industry)
│   │   ├── AAPL (Company)
│   │   ├── MSFT (Company)
│   │   └── ...
│   ├── Semiconductors (Industry)
│   └── Consumer Electronics (Industry)
├── Financial Services (Large Sector)
│   ├── Banks (Industry)
│   └── Credit Services (Industry)
└── [Other Sectors]
*/

// 3. D3.js Rendering
const treemap = d3.treemap()
  .size([width, height])
  .padding(2)
  .round(true);
```

## 🔧 **Market Cap Calculation System**

### Calculation Pipeline
```typescript
// Step 1: Data Source Priority
1. Cache (Redis) - 15min TTL, fastest
2. SessionPrice (DB) - Current session data
3. Ticker (DB) - Denormalized fallback

// Step 2: Market Cap Computation
marketCap = computeMarketCap(currentPrice, sharesOutstanding);
marketCapDiff = computeMarketCapDiff(currentPrice, referencePrice, sharesOutstanding);

// Step 3: Validation
if (!validateMarketCap(marketCap, ticker)) {
  // Filter out invalid values (≤0, >$10T)
  skippedNoMarketCap++;
  continue;
}

if (!validatePercentChange(changePercent, ticker)) {
  // Filter out extreme changes (>100%)
  skippedNoPrice++;
  continue;
}
```

### Precision Handling
- **Decimal.js**: All financial calculations use Decimal.js
- **Rounding**: Results rounded to 2 decimal places
- **Validation**: Extreme values filtered before display
- **Logging**: Detailed debug information for troubleshooting

## 📡 **Data Sources & Integration**

### Primary Data Sources
```typescript
// 1. Polygon.io API
- Real-time stock prices
- Company financial data
- Historical price data
- Shares outstanding data

// 2. Database (SQLite + Prisma)
models: {
  Ticker: {
    symbol, name, sector, industry
    sharesOutstanding, lastPrice, latestPrevClose
    lastMarketCap, lastMarketCapDiff
  }
  SessionPrice: {
    symbol, lastPrice, changePct, lastTs
    session, updatedAt
  }
  DailyRef: {
    symbol, date, open, high, low, close
    regularClose, previousClose
  }
}

// 3. Cache Layer (Redis)
- Stock data: 15-minute TTL
- Previous close: 24-hour TTL
- Share counts: 24-hour TTL
- Session data: Real-time updates
```

### Data Validation Rules
```typescript
// Market Cap Validation
const MARKET_CAP_MIN = 0;
const MARKET_CAP_MAX = 10000; // $10 trillion

// Percent Change Validation  
const PERCENT_CHANGE_MAX = 100; // 100%
const PRICE_MIN = 0.01; // $0.01

// Sector Validation
const VALID_SECTORS = [
  'Technology', 'Financial Services', 'Consumer Cyclical',
  'Consumer Defensive', 'Healthcare', 'Energy',
  'Industrials', 'Real Estate', 'Utilities'
];
```

## 🎨 **UI/UX Architecture**

### Component Hierarchy
```
App Layout (layout.tsx)
├── AuthProvider (Authentication)
├── GAListener (Analytics)
├── ThemeEffect (Dark/Light mode)
├── DevCacheClear (Development utility)
└── Page Components
    ├── HomePage (Market overview)
    ├── HeatmapPage (Interactive heatmap)
    ├── CompanyPage (Detailed analysis)
    └── ErrorPages (404, 500)
```

### Responsive Design Strategy
```typescript
// Mobile-first approach
const breakpoints = {
  mobile: 'max-width: 768px',
  tablet: 'min-width: 769px, max-width: 1024px',
  desktop: 'min-width: 1025px'
};

// Component variants
<ResponsiveMarketHeatmap>
  <MobileTreemapNew />  // Mobile optimized
  <DesktopMarketHeatmap /> // Desktop features
</ResponsiveMarketHeatmap>
```

## 🔄 **Background Processing Architecture**

### Worker Processes
```typescript
// PM2 Configuration (ecosystem.config.cjs)
module.exports = {
  apps: [
    {
      name: 'premarketprice',
      script: 'server.ts',
      instances: 1,
      env: 'production'
    },
    {
      name: 'pmp-polygon-worker',
      script: 'workers/polygonWorker.ts',
      instances: 1,
      cron: '*/5 * * * *' // Every 5 minutes
    },
    {
      name: 'pmp-bulk-preloader',
      script: 'workers/backgroundPreloader.ts',
      instances: 1,
      cron: '0 2 * * *' // Daily at 2 AM
    }
  ]
};
```

### Job Scheduling
```typescript
// Cron Jobs Configuration
const cronJobs = {
  '*/5 13-20 * * 1-5': 'Live market updates',
  '0 2 * * *': 'Daily data refresh',
  '0 10 * * *': 'Market open preparation',
  '30 21 * * *': 'After-hours processing',
  '0 22 * * *': 'End-of-day cleanup'
};
```

## 🚀 **Performance Optimizations**

### Caching Strategy
```typescript
// Multi-level caching
const cacheStrategy = {
  // L1: Memory (fastest)
  shareCounts: new Map(), // 24-hour TTL
  prevCloseCache: new Map(), // 24-hour TTL
  
  // L2: Redis (persistent)
  stockData: '15m TTL', // Market data
  heatmapData: '15m TTL', // Computed hierarchy
  apiResponses: '5m TTL', // API responses
  
  // L3: Database (source)
  sessionPrice: 'Real-time', // Current session
  dailyRef: '7-day window', // Historical data
  ticker: 'Denormalized' // Pre-computed values
};
```

### Database Optimizations
```sql
-- Optimized queries with proper indexing
CREATE INDEX idx_ticker_symbol ON Ticker(symbol);
CREATE INDEX idx_session_price_symbol_ts ON SessionPrice(symbol, lastTs);
CREATE INDEX idx_daily_ref_symbol_date ON DailyRef(symbol, date);

-- Efficient data fetching
SELECT * FROM SessionPrice 
WHERE symbol IN (tickers) 
  AND lastTs >= datetime('now', '-1 day')
ORDER BY lastTs DESC, session ASC;
```

## 🔒 **Security Architecture**

### Authentication & Authorization
```typescript
// NextAuth.js Configuration
const authConfig = {
  providers: [
    // OAuth providers (Google, GitHub, etc.)
    // Credentials provider for development
  ],
  callbacks: {
    // JWT token management
    // Session handling
    // User profile synchronization
  },
  session: {
    strategy: 'database', // Persistent sessions
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 24 * 60 * 60 // 24 hours
  }
};
```

### API Security
```typescript
// Rate limiting
const rateLimits = {
  '/api/stocks': '100 requests/hour',
  '/api/heatmap': '50 requests/hour',
  '/api/company/*': '200 requests/hour'
};

// Input validation
const validation = {
  tickers: '^[A-Z]{1,5}$', // Valid stock symbols
  numeric: 'number', // Numeric parameters only
  dates: 'YYYY-MM-DD' // Date format validation
};

// CORS configuration
const corsConfig = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};
```

## 📊 **Monitoring & Observability**

### Logging Strategy
```typescript
// Structured logging with Pino
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino/file',
    options: {
      destination: './logs/app.log',
      mkdir: true
    }
  }
});

// Log categories
const logCategories = {
  API: 'api_requests',
  DATABASE: 'db_operations',
  CACHE: 'cache_operations',
  WORKERS: 'background_jobs',
  PERFORMANCE: 'response_times'
};
```

### Performance Metrics
```typescript
// Key performance indicators
const kpis = {
  responseTime: '< 200ms', // API response time
  cacheHitRate: '> 80%', // Cache efficiency
  errorRate: '< 1%', // Error percentage
  uptime: '> 99.9%', // Application uptime
  memoryUsage: '< 512MB' // Memory consumption
};

// Real-time monitoring
const monitoring = {
  healthCheck: '/api/health', // Application health
  metrics: '/api/metrics', // Performance metrics
  websocket: '/api/websocket', // Real-time status
  logs: '/api/logs' // Application logs
};
```

## 🔧 **Development Workflow**

### Build Process
```bash
# Development
npm run dev          # Next.js development server
npm run test          # Jest test suite
npm run lint          # ESLint checking
npm run type-check    # TypeScript validation

# Production
npm run build         # Production build
npm run start         # Production server
npm run deploy         # SSH deployment script
```

### Testing Strategy
```typescript
// Test categories
const testSuites = {
  unit: 'src/**/*.test.ts',           // Unit tests
  integration: 'src/**/*.integration.test.ts', // API integration
  e2e: 'tests/**/*.test.ts',        // End-to-end
  performance: 'tests/performance/*.test.ts' // Performance tests
};

// Test configuration (jest.config.mjs)
const jestConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## 🚀 **Deployment Architecture**

### Server Configuration
```bash
# Production server (Ubuntu)
Server: 89.185.250.213
OS: Debian 6.1.0
Web Server: Nginx (reverse proxy)
App Server: PM2 (process manager)
Database: SQLite (file-based)
Cache: Redis (in-memory)
```

### Deployment Pipeline
```yaml
# GitHub Actions (.github/workflows/deploy.yml)
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Build application
        run: npm run build
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        run: |
          ssh root@89.185.250.213 \
          "cd /var/www/premarketprice && \
           git pull origin main && \
           npm run build && \
           pm2 restart ecosystem.config.cjs --env production"
```

## 📈 **Recent Improvements (Post-Antigravity)**

### Heatmap Structure Fixes
```typescript
// 1. Sector Name Updates
const LARGE_SECTORS = [
  'Technology',      // ✅ Updated from 'Communication Services'
  'Financial Services', // ✅ Updated from 'Financial Services'  
  'Consumer',        // ✅ Updated from 'Consumer Cyclical'
  'Healthcare'       // ✅ Updated from 'Healthcare'
];

// 2. Industry Subcategories
const industryStructure = {
  'Technology': [
    'Software', 'Semiconductors', 'Internet Content & Information',
    'Consumer Electronics', 'Information Technology Services'
  ],
  'Financial Services': [
    'Banks', 'Credit Services', 'Insurance', 'Capital Markets'
  ]
  // ... other sectors
};
```

### Data Validation Enhancements
```typescript
// 3. Extreme Value Filtering
const validationRules = {
  marketCap: {
    min: 0,
    max: 10000, // $10 trillion
    filter: true
  },
  percentChange: {
    max: 100, // 100%
    filter: true,
    warnThreshold: 40 // Warning at 40%
  },
  price: {
    min: 0.01,
    validate: true
  }
};

// 4. Error Handling
const errorHandling = {
  missingData: 'skip', // Don't show misleading data
  extremeValues: 'filter', // Remove from display
  logLevel: 'warn', // Detailed logging
  fallback: 'graceful' // Graceful degradation
};
```

### Hydration Fixes
```typescript
// 5. Client-side Script Isolation
const DevCacheClear = () => {
  'use client';
  
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <script
      id="cache-clear-utility"
      dangerouslySetInnerHTML={{
        __html: `
          window.clearAllCaches = async function() {
            // Cache clearing logic
          };
        `
      }}
    />
  );
};
```

## 📚 **Documentation Structure**

### Available Documentation
```
docs/
├── market-cap-calculations.md    # Business user documentation (Slovak)
├── technical-calculations.md      # Developer technical documentation (English)
├── vps-502-fix.md              # Server troubleshooting guide
└── (Additional docs in development)

README.md                          # Project overview and quick start
IMPROVEMENTS.md                    # Strategic roadmap and business plan
```

## 🔮 **Future Architecture Considerations**

### Scalability Planning
```typescript
// Microservices transition (Phase 2)
const microservices = {
  authService: 'Authentication & authorization',
  stockService: 'Stock data management',
  heatmapService: 'Heatmap computation',
  notificationService: 'Real-time notifications',
  analyticsService: 'Business intelligence'
};

// Database scaling
const databaseStrategy = {
  current: 'SQLite with connection pooling',
  target: 'PostgreSQL with read replicas',
  cache: 'Redis cluster for distributed caching',
  search: 'Elasticsearch for full-text search'
};
```

### Performance Roadmap
```typescript
// Next optimization targets
const performanceTargets = {
  responseTime: '< 100ms', // From current 200ms
  cacheHitRate: '> 95%', // From current 80%
  bundleSize: '< 1MB', // Code splitting
  firstContentfulPaint: '< 1.5s', // Core web vitals
  timeToInteractive: '< 2s' // User experience
};
```

---

## 📞 **Contact & Support**

### Technical Documentation
- **Architecture**: This document
- **API Documentation**: Available in-code JSDoc comments
- **Database Schema**: `prisma/schema.prisma`
- **Deployment Guide**: `DEPLOYMENT-INSTRUCTIONS.md`

### Development Support
- **Code Standards**: ESLint + Prettier configuration
- **Testing**: Jest configuration with coverage thresholds
- **Debugging**: Source maps and detailed logging
- **Performance**: Built-in profiling tools

---

*This document is maintained alongside the codebase and reflects the current architecture state as of the latest deployment.*

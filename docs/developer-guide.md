# Developer Guide

## 🚀 Quick Start

This guide helps developers understand the PMP codebase structure, development workflow, and best practices.

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git
- VS Code (recommended) with extensions

### Initial Setup
```bash
# Clone repository
git clone https://github.com/dusan02/vercel_pmp.git
cd vercel_pmp

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Initialize database
npx prisma generate
npx prisma migrate dev

# Start development server
npm run dev
```

## 📁 Project Structure Deep Dive

### Core Directories
```
src/
├── app/                    # Next.js 13+ App Router
│   ├── api/               # API routes
│   │   ├── heatmap/       # Heatmap data endpoint
│   │   ├── stocks/        # Stock data endpoint  
│   │   ├── health/        # Health checks
│   │   └── auth/          # Authentication
│   ├── heatmap/           # Heatmap page component
│   ├── company/           # Company analysis pages
│   └── layout.tsx         # Root layout with providers
├── components/             # Reusable React components
│   ├── analysis/          # Analysis-related components
│   ├── company/           # Company-specific components
│   ├── home/              # Homepage components
│   └── DevCacheClear.tsx  # Development utility component
├── lib/                   # Utility libraries and business logic
│   ├── utils/             # Helper functions
│   │   ├── heatmapLayout.ts # Heatmap hierarchy building
│   │   ├── heatmapColors.ts # Color scaling logic
│   │   ├── marketCapUtils.ts # Market cap calculations
│   │   └── timeUtils.ts    # Time zone utilities
│   ├── heatmap/            # Heatmap types and interfaces
│   ├── workers/            # Background job definitions
│   └── auth.ts            # Authentication configuration
├── workers/               # Background processing scripts
│   ├── polygonWorker.ts   # Real-time data fetching
│   └── backgroundPreloader.ts # Batch data processing
└── data/                  # Static data and configurations
    ├── defaultTickers.ts  # Default stock tickers
    └── sectorIndustryOverrides.ts # Sector name corrections
```

### Key Files Explained

#### `/src/app/api/heatmap/route.ts`
**Purpose**: Main heatmap data API endpoint
**Key Functions**:
- `buildHeatmapHierarchy()`: Creates D3.js compatible hierarchy
- `computeMarketCap()`: Calculates market capitalization
- `validateMarketCap()`: Filters invalid market caps
- `validatePercentChange()`: Filters extreme percent changes

#### `/src/lib/utils/heatmapLayout.ts`
**Purpose**: Heatmap layout and hierarchy logic
**Key Constants**:
- `LARGE_SECTORS`: ['Technology', 'Finance', 'Consumer', 'Healthcare']
- `SECTOR_GAP`: Spacing between sectors
- `INDUSTRY_LABEL`: Industry subcategory styling

#### `/src/lib/utils/marketCapUtils.ts`
**Purpose**: Financial calculations with precision
**Key Functions**:
- `computeMarketCap()`: Market cap in billions USD
- `computeMarketCapDiff()`: Market cap difference
- `computePercentChange()`: Session-aware percent changes
- `validatePriceChange()`: Data validation

## 🔧 Development Workflow

### Daily Development
```bash
# 1. Start development server
npm run dev

# 2. Run tests in separate terminal
npm run test -- --watch

# 3. Check code quality
npm run lint
npm run type-check

# 4. Database operations
npx prisma studio          # Visual database browser
npx prisma migrate dev      # Apply schema changes
npx prisma generate         # Regenerate client
```

### Testing Strategy
```bash
# Run all tests
npm test

# Run specific test file
npm test -- heatmap.test.ts

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### Code Quality
```bash
# Linting
npm run lint                # Check all files
npm run lint:fix           # Auto-fix issues
npm run lint:check         # Staged files only

# Type checking
npm run type-check          # TypeScript validation

# Formatting
npm run format              # Prettier formatting
npm run format:check        # Check formatting only
```

## 🏗️ Architecture Understanding

### Data Flow
```
User Request → Next.js API → Business Logic → Database/Cache → Response
     ↓                ↓                ↓              ↓
   UI Component → Hook → Data Fetching → Processing → Display
```

### Key Patterns

#### 1. API Route Pattern
```typescript
// src/app/api/endpoint/route.ts
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // 1. Validate input
    const { searchParams } = new URL(request.url);
    
    // 2. Fetch data
    const data = await fetchData(searchParams);
    
    // 3. Validate and process
    const processedData = validateAndProcess(data);
    
    // 4. Return response
    return NextResponse.json(processedData);
  } catch (error) {
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}
```

#### 2. Component Pattern
```typescript
// src/components/ComponentName.tsx
'use client';

import { useState, useEffect } from 'react';

interface ComponentProps {
  // Props definition
}

export function ComponentName({ prop }: ComponentProps) {
  const [state, setState] = useState(initialState);
  
  useEffect(() => {
    // Side effects
  }, [dependencies]);
  
  return (
    <div className="component-wrapper">
      {/* JSX content */}
    </div>
  );
}
```

#### 3. Hook Pattern
```typescript
// src/hooks/useHookName.ts
import { useState, useEffect } from 'react';

interface UseHookReturn {
  // Return type definition
}

export function useHookName(params): UseHookReturn {
  const [state, setState] = useState(initialState);
  
  useEffect(() => {
    // Hook logic
  }, [params]);
  
  return {
    state,
    setState,
    // Other return values
  };
}
```

## 📊 Heatmap Development

### Adding New Sectors
```typescript
// 1. Update LARGE_SECTORS in heatmapLayout.ts
const LARGE_SECTORS = [
  'Technology',
  'Financial Services', 
  'Consumer',
  'Healthcare',
  'NewSector' // Add new sector here
];

// 2. Update validation in sectorIndustryValidator.ts
const VALID_SECTORS = [
  // ... existing sectors
  'NewSector' // Add to valid sectors
];

// 3. Add industry mappings
const VALID_INDUSTRIES = {
  'NewSector': [
    'Industry1',
    'Industry2',
    'Industry3'
  ]
};
```

### Modifying Calculations
```typescript
// 1. Update market cap calculations
export function computeCustomMetric(params: CalculationParams): number {
  // Custom calculation logic
  return result;
}

// 2. Add validation rules
export function validateCustomValue(value: number): boolean {
  // Custom validation logic
  return isValid;
}

// 3. Update API endpoint
// Add new metric to response in route.ts
return NextResponse.json({
  data: processedData,
  customMetric: computedValue
});
```

## 🔒 Security Best Practices

### API Security
```typescript
// 1. Input validation
import { z } from 'zod';

const querySchema = z.object({
  ticker: z.string().regex(/^[A-Z]{1,5}$/),
  limit: z.number().min(1).max(100)
});

// 2. Rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// 3. Environment variables
const apiKey = process.env.POLYGON_API_KEY;
if (!apiKey) {
  throw new Error('Missing required environment variable');
}
```

### Database Security
```typescript
// 1. Use parameterized queries
const ticker = req.params.ticker;
const result = await prisma.ticker.findMany({
  where: { 
    symbol: ticker  // Safe: parameterized
  }
});

// 2. Validate user input
const isValidTicker = VALID_TICKERS.includes(ticker);
if (!isValidTicker) {
  return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
}

// 3. Limit data exposure
const safeTickerData = {
  symbol: ticker.symbol,
  name: ticker.name,
  sector: ticker.sector
  // Don't expose sensitive internal fields
};
```

## 🚀 Performance Optimization

### Caching Strategy
```typescript
// 1. Memory cache for frequently accessed data
const cache = new Map<string, CacheEntry>();

// 2. Redis for persistent caching
import { setJson, getJson } from '@/lib/redis';

await setJson(cacheKey, data, { ttl: 900 }); // 15 minutes
const cached = await getJson(cacheKey);

// 3. Database query optimization
const tickers = await prisma.ticker.findMany({
  where: {
    symbol: { in: tickerSymbols }
  },
  select: {
    symbol: true,
    name: true,
    sector: true,
    industry: true,
    lastPrice: true,
    lastMarketCap: true
    // Only select required fields
  }
});
```

### Bundle Optimization
```typescript
// 1. Dynamic imports for code splitting
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <div>Loading...</div>,
  ssr: false // Client-side only
});

// 2. Image optimization
import Image from 'next/image';

<Image
  src={imageUrl}
  alt={description}
  width={500}
  height={300}
  priority={isAboveFold}
/>

// 3. Font optimization
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter'
});
```

## 🐛 Debugging Guide

### Common Issues

#### 1. Heatmap Not Displaying
```bash
# Check browser console for errors
# Verify API endpoint returns data
curl http://localhost:3000/api/heatmap

# Check data structure
console.log('Hierarchy:', hierarchy);

# Validate sector names
console.log('Sectors:', data.map(d => d.sector));
```

#### 2. Market Cap Calculations Wrong
```bash
# Check raw data
console.log('Price:', currentPrice, 'Shares:', shares);

# Verify calculation
const expected = (currentPrice * shares) / 1000000000;
console.log('Expected:', expected, 'Actual:', marketCap);

# Check for missing data
if (!sharesOutstanding) {
  console.warn('Missing shares data for', ticker);
}
```

#### 3. Performance Issues
```bash
# Profile API endpoint
curl -w "@{time_total}\n" http://localhost:3000/api/heatmap

# Check database queries
npx prisma studio --browser none

# Monitor memory usage
npm run build --analyze
```

### Debug Tools
```typescript
// 1. Development logging
const debugMode = process.env.NODE_ENV === 'development';

if (debugMode) {
  console.log('Debug: Processing ticker', ticker);
  console.log('Debug: Raw data', rawData);
  console.log('Debug: Processed data', processedData);
}

// 2. Error boundaries
import { ErrorBoundary } from 'react';

<ErrorBoundary
  fallback={<div>Something went wrong.</div>}
  onError={(error) => console.error('Component error:', error)}
>
  <YourComponent />
</ErrorBoundary>

// 3. Performance monitoring
const startTime = performance.now();
// ... your code
const endTime = performance.now();
console.log(`Operation took ${endTime - startTime}ms`);
```

## 📝 Contributing Guidelines

### Code Standards
1. **TypeScript**: Strong typing required
2. **ESLint**: Follow project linting rules
3. **Prettier**: Use automatic formatting
4. **Comments**: JSDoc for public functions
5. **Testing**: Write tests for new features

### Git Workflow
```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make changes
# ... develop your feature

# 3. Commit changes
git add .
git commit -m "feat: add your feature description"

# 4. Push and create PR
git push origin feature/your-feature-name
# Create Pull Request on GitHub
```

### Testing Requirements
```typescript
// Unit tests for utility functions
describe('marketCapUtils', () => {
  it('should calculate market cap correctly', () => {
    const result = computeMarketCap(100, 1000000);
    expect(result).toBe(0.1); // $100M = 0.1B
  });
});

// Integration tests for API endpoints
describe('/api/heatmap', () => {
  it('should return valid heatmap data', async () => {
    const response = await fetch('/api/heatmap');
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
  });
});
```

## 📚 Additional Resources

### Documentation
- [Technical Architecture](./technical-architecture.md)
- [Market Cap Calculations](./market-cap-calculations.md)
- [API Documentation](./api-documentation.md) (coming soon)
- [Deployment Guide](./deployment-guide.md) (coming soon)

### External Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [D3.js Documentation](https://d3js.org/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

## 🤝 Getting Help

### Troubleshooting Channels
1. **Check existing issues**: GitHub Issues
2. **Read documentation**: This guide and technical docs
3. **Console debugging**: Browser dev tools and terminal logs
4. **Code review**: Ask for code review on pull requests

### Best Practices
- Start small and test incrementally
- Use TypeScript for type safety
- Write tests as you develop
- Comment complex logic
- Follow existing code patterns
- Keep performance in mind

---

*Happy coding! 🚀*

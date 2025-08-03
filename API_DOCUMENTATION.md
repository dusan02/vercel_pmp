# API Documentation

## Overview

This document provides comprehensive documentation for the PMP5 API endpoints. The API is built with Next.js and provides real-time stock data, caching, monitoring, and administrative functions.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://premarketprice.com` (and other domain variants)

## Authentication

### Admin Endpoints

Admin endpoints require authentication in production environments:

```bash
# Add admin_key parameter to query string
GET /api/admin/cache/keys?admin_key=YOUR_ADMIN_SECRET_KEY

# Or use Authorization header for metrics
GET /api/metrics
Authorization: Bearer YOUR_METRICS_SECRET_KEY
```

### Environment Variables

```bash
# Admin authentication
ADMIN_SECRET_KEY=your_admin_secret_key

# Metrics authentication (optional)
METRICS_SECRET_KEY=your_metrics_secret_key

# Polygon.io API key
POLYGON_API_KEY=your_polygon_api_key
```

## Endpoints

### Stock Data

#### GET /api/stocks

Retrieve real-time stock data for default tickers.

**Query Parameters:**
- `project` (optional): Project code (`pmp`, `cm`, `gl`, `cv`)
- `limit` (optional): Number of stocks to return (default: 50)

**Example Request:**
```bash
curl "http://localhost:3000/api/stocks?project=pmp&limit=10"
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "ticker": "AAPL",
      "currentPrice": 150.25,
      "closePrice": 148.50,
      "percentChange": 1.18,
      "marketCap": 2500000000000,
      "marketCapDiff": 12500000000,
      "lastUpdated": "2024-01-15T10:30:00.000Z"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "source": "cache"
}
```

#### GET /api/prices

Get current prices for specific tickers.

**Query Parameters:**
- `tickers`: Comma-separated list of ticker symbols
- `project` (optional): Project code

**Example Request:**
```bash
curl "http://localhost:3000/api/prices?tickers=AAPL,MSFT,GOOGL&project=pmp"
```

#### GET /api/prices/cached

Get cached prices with fallback to live data.

**Query Parameters:**
- `tickers`: Comma-separated list of ticker symbols
- `project` (optional): Project code

### Ticker Management

#### GET /api/tickers/default

Get default tickers for a project.

**Query Parameters:**
- `project` (optional): Project code (default: `pmp`)
- `limit` (optional): Number of tickers to return

**Example Request:**
```bash
curl "http://localhost:3000/api/tickers/default?project=cm&limit=20"
```

**Example Response:**
```json
{
  "success": true,
  "data": ["AAPL", "MSFT", "GOOGL", "AMZN"],
  "project": "cm",
  "count": 4,
  "limit": 20,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Favorites Management

#### GET /api/favorites

Get user favorites for a project.

**Query Parameters:**
- `project` (optional): Project code

#### POST /api/favorites

Add a ticker to favorites.

**Request Body:**
```json
{
  "ticker": "AAPL",
  "project": "pmp"
}
```

#### DELETE /api/favorites

Remove a ticker from favorites.

**Request Body:**
```json
{
  "ticker": "AAPL",
  "project": "pmp"
}
```

### Health & Monitoring

#### GET /api/health

Get application health status.

**Example Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": {
    "nodeEnv": "production",
    "vercel": "true"
  },
  "services": {
    "redis": "connected",
    "database": "connected"
  }
}
```

#### GET /api/health/redis

Get Redis connection status.

**Query Parameters:**
- `detailed` (optional): Include detailed configuration info

**Example Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": {
    "nodeEnv": "production",
    "project": "pmp",
    "domain": "premarketprice.com",
    "isProduction": true
  },
  "redis": {
    "status": "healthy",
    "message": "Redis is connected and responding",
    "connected": true
  },
  "cache": {
    "enabled": true,
    "type": "redis",
    "fallback": false
  }
}
```

#### GET /api/metrics

Get Prometheus metrics.

**Query Parameters:**
- `format` (optional): Output format (`prometheus` or `json`)

**Headers:**
- `Authorization: Bearer YOUR_METRICS_SECRET_KEY` (required in production)

**Example Response (Prometheus format):**
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total 1234 1705312200000

# HELP cache_hits_total Total number of cache hits
# TYPE cache_hits_total counter
cache_hits_total 567 1705312200000

# HELP cache_hit_ratio Cache hit ratio (0-1)
# TYPE cache_hit_ratio gauge
cache_hit_ratio 0.85 1705312200000
```

**Example Response (JSON format):**
```json
{
  "success": true,
  "data": {
    "http_requests_total": 1234,
    "cache_hits_total": 567,
    "cache_misses_total": 100,
    "cache_hit_ratio": 0.85,
    "uptime_seconds": 3600,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Cache Management

#### GET /api/cache/status

Get cache status and metrics.

**Example Response:**
```json
{
  "success": true,
  "status": "healthy",
  "redis": {
    "connected": true,
    "keys": 150,
    "memory": "2.5MB"
  },
  "metrics": {
    "hits": 1000,
    "misses": 150,
    "hitRate": 0.87,
    "avgResponseTime": 0.05
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Admin Endpoints

#### GET /api/admin/cache/keys

List all cache keys (requires admin authentication).

**Query Parameters:**
- `admin_key`: Admin secret key

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "key": "stock:pmp:AAPL",
      "ttl": 120,
      "size": 1024,
      "lastAccessed": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 150,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### POST /api/admin/cache/invalidate

Invalidate cache keys (requires admin authentication).

**Query Parameters:**
- `admin_key`: Admin secret key

**Request Body:**
```json
{
  "key": "stock:pmp:AAPL"  // Optional: specific key to invalidate
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Key \"stock:pmp:AAPL\" invalidated",
  "deletedCount": 1,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Background Services

#### GET /api/background/status

Get background service status.

**Example Response:**
```json
{
  "success": true,
  "isRunning": true,
  "lastUpdate": "2024-01-15T10:25:00.000Z",
  "nextUpdate": "2024-01-15T10:30:00.000Z",
  "interval": 300,
  "stats": {
    "totalUpdates": 1000,
    "successfulUpdates": 985,
    "failedUpdates": 15
  }
}
```

#### POST /api/background/control

Control background service (requires admin authentication).

**Query Parameters:**
- `admin_key`: Admin secret key

**Request Body:**
```json
{
  "action": "start"  // "start", "stop", or "restart"
}
```

### Blog & Content

#### GET /api/blog/daily-report

Get daily market report.

**Query Parameters:**
- `date` (optional): Report date (YYYY-MM-DD format)

#### POST /api/blog/generate

Generate blog content (requires authentication).

**Request Body:**
```json
{
  "type": "daily-report",
  "date": "2024-01-15",
  "api_key": "your_blog_api_key"
}
```

#### GET /api/blog/ai-insights

Get AI-generated market insights.

**Query Parameters:**
- `tickers` (optional): Comma-separated list of tickers
- `limit` (optional): Number of insights to return

## Error Handling

All API endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Common HTTP Status Codes

- `200`: Success
- `400`: Bad Request - Invalid parameters
- `401`: Unauthorized - Missing or invalid authentication
- `404`: Not Found - Endpoint or resource not found
- `429`: Too Many Requests - Rate limit exceeded
- `500`: Internal Server Error - Server error

### Rate Limiting

- **Default**: 100 requests per minute per IP
- **Admin endpoints**: 10 requests per minute per IP
- **Metrics endpoint**: 5 requests per minute per IP

## Data Models

### Stock Data

```typescript
interface StockData {
  ticker: string;
  currentPrice: number;
  closePrice: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  lastUpdated: string;
}
```

### API Response

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  timestamp: string;
  source?: 'cache' | 'live';
}
```

### Cache Key

```typescript
interface CacheKey {
  key: string;
  ttl: number;
  size: number;
  lastAccessed: string;
}
```

## Project Configuration

The API supports multiple project domains with different configurations:

| Project | Domain | Default Tickers | Cache Prefix |
|---------|--------|----------------|--------------|
| PMP | premarketprice.com | S&P 500 | `pmp` |
| CM | capmovers.com | Market Movers | `cm` |
| GL | gainerslosers.com | Gainers/Losers | `gl` |
| CV | stockcv.com | Custom List | `cv` |

## Caching Strategy

- **TTL**: 2 minutes for stock data
- **Fallback**: In-memory cache when Redis unavailable
- **Invalidation**: Manual via admin endpoints
- **Metrics**: Hit/miss tracking with Prometheus

## Monitoring & Observability

### Metrics Available

- HTTP request counts and durations
- Cache hit/miss ratios
- Redis connection status
- Background job performance
- API error rates
- Application uptime

### Health Checks

- `/api/health` - Overall application health
- `/api/health/redis` - Redis connection status
- `/api/metrics` - Prometheus metrics endpoint

### Logging

All endpoints log:
- Request/response details
- Error information
- Performance metrics
- Cache operations

## Development

### Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Start development server
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/app/api/__tests__/stocks.test.ts
```

### Environment Variables

```bash
# Required
POLYGON_API_KEY=your_polygon_api_key

# Optional
ADMIN_SECRET_KEY=your_admin_secret_key
METRICS_SECRET_KEY=your_metrics_secret_key
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

## Deployment

### Vercel Deployment

The API is configured for Vercel deployment with:

- Edge functions for performance
- Automatic environment variable management
- Built-in monitoring and logging
- Global CDN distribution

### Production Checklist

- [ ] Set all required environment variables
- [ ] Configure custom domain
- [ ] Set up monitoring alerts
- [ ] Test all endpoints
- [ ] Verify cache functionality
- [ ] Check rate limiting
- [ ] Validate security headers

## Support

For API support and questions:

- **Documentation**: This file
- **Health Check**: `/api/health`
- **Metrics**: `/api/metrics`
- **Admin Panel**: `/admin/cache`

## Changelog

### v1.0.0 (2024-01-15)
- Initial API release
- Stock data endpoints
- Caching system
- Admin panel
- Prometheus metrics
- Comprehensive testing 
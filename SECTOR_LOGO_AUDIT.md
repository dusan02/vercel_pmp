# Sector/Industry & Logo Audit Report

## ✅ FIXED: Sector/Industry Corrections

The following international stocks had incorrect sector/industry data and have been corrected:

### Corrected Stocks:
1. **PBR (Petrobras)**
   - ❌ Was: Healthcare - Medical Devices
   - ✅ Now: Energy - Oil & Gas Integrated

2. **VALE (Vale S.A.)**
   - ❌ Was: Real Estate - REIT - Industrial
   - ✅ Now: Basic Materials - Other Industrial Metals & Mining

3. **ABEV (Ambev S.A.)**
   - ❌ Was: Industrials - Farm & Heavy Construction Machinery
   - ✅ Now: Consumer Defensive - Beverages - Brewers

4. **TSM (Taiwan Semiconductor)**
   - ❌ Was: Consumer Defensive - Discount Stores
   - ✅ Now: Technology - Semiconductors

5. **BABA (Alibaba Group)**
   - ❌ Was: Real Estate - REIT - Industrial
   - ✅ Now: Consumer Cyclical - Internet Retail

6. **ASML (ASML Holding)**
   - ❌ Was: Basic Materials - Specialty Chemicals
   - ✅ Now: Technology - Semiconductor Equipment & Materials

7. **NVO (Novo Nordisk)**
   - ✅ Already correct: Healthcare - Drug Manufacturers - General

## ⚠️ LOGO AVAILABILITY ISSUE

### Problem:
Smaller market cap companies (< $10B) do not have locally cached logos in `public/logos/`.

### Current Logo Strategy:
1. **Static files** (`public/logos/[ticker]-32.webp`) - Only available for large caps
2. **Redis cache** - Temporary cache of fetched logos
3. **External APIs** - Fallback to Clearbit, Google Favicon, DuckDuckGo
4. **SVG Placeholder** - Final fallback (colored square with ticker initial)

### Why Smaller Companies Show Placeholders:
1. The `fetch-logos.ts` script was likely run only for S&P 500 or large-cap stocks
2. Smaller companies may not have logos on Clearbit/Google (especially non-US companies)
3. External API calls may timeout or fail during page load

### Recommended Solutions:

#### Option 1: Pre-fetch More Logos (Recommended)
Run the logo fetching script for all tickers in the database:

```bash
npm run fetch-logos
```

This will:
- Fetch logos from multiple sources (Polygon, Clearbit, Simple Icons)
- Convert to WebP format
- Store locally in `public/logos/`
- Significantly improve load times

#### Option 2: Improve Fallback Chain
The current API route already has a good fallback chain, but we can enhance it:

1. Add more logo sources (e.g., Yahoo Finance, FMP)
2. Increase timeout for external fetches
3. Implement better error handling and retry logic

#### Option 3: Use Polygon Logo API
For stocks with Polygon data, we can fetch logos directly from Polygon API:
- Endpoint: `https://api.polygon.io/v3/reference/tickers/{ticker}?apikey={key}`
- Returns: `branding.logo_url` and `branding.icon_url`

### Current Status:
- ✅ Large-cap stocks: Logos load correctly (from local cache)
- ⚠️ Mid/small-cap stocks: May show placeholders or load slowly
- ❌ International stocks: Higher chance of missing logos

### Next Steps:
1. Run `npm run fetch-logos` to populate logos for all tickers
2. Monitor logo loading performance in production
3. Consider implementing lazy loading with IntersectionObserver (already done in CompanyLogo.tsx)

## Summary:
- **Sector/Industry**: ✅ Fixed for all identified incorrect entries
- **Logo Loading**: ⚠️ Needs logo pre-fetching for smaller companies

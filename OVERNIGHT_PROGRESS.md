# Overnight Progress Report — 2026-08-27

## Summary

Completed P1–P4 of the roadmap. All features deployed to production and verified.

## P0.3: Premarket Historical Pages (completed in prior session)

- **Status**: ✅ Deployed and verified
- **Fix**: `SessionPrice.date` query window changed to full-day (`T00:00:00Z` to `T23:59:59Z`) in `src/lib/seo/premarketArchive.ts`
- **Result**: `/premarket-gainers/[date]` and `/premarket-losers/[date]` pages display 50 tickers with correct percentage changes. `/premarket-movers` shows 7 days of historical data with correct navigation links.

## P1: Earnings Experience

- **Status**: ✅ Deployed and verified
- **Files modified**:
  - `src/lib/seo/earningsSSR.ts` — new SSR data provider for earnings
  - `src/app/earnings/page.tsx` — added SSR content with EPS values and internal links
  - `src/app/analysis/[ticker]/page.tsx` — added earnings section after "Recent Market Moves"
- **Features**:
  - `/earnings` page now has SSR content for SEO (was 100% client-side before)
  - Analysis pages show earnings history with EPS actuals/estimates and surprise %
  - Internal links from earnings to analysis pages
- **Data source**: `EarningsCalendar` PostgreSQL table (41 rows, 2026-05-27 to 2026-09-02)

## P2: Analyst Consensus (pivoted from Price Targets)

- **Status**: ✅ Deployed and verified
- **Pivot reason**: Finnhub free tier returns 403 for `/stock/price-target` endpoint. Pivoted to use `/stock/recommendation` (free tier) for analyst consensus data.
- **Files modified**:
  - `prisma/schema.prisma` — added `FinnhubRecommendation` model
  - `src/lib/clients/finnhubClient.ts` — added `FinnhubRecommendation` interface + `fetchRecommendation()` method
  - `src/services/finnhubService.ts` — added `getRecommendation()` with DB caching (no Redis)
  - `scripts/sync-finnhub-metrics.ts` — updated to sync recommendations + price targets (price target 403 caught gracefully)
  - `src/app/analysis/[ticker]/page.tsx` — added "Analyst Consensus" section
- **Features**:
  - Consensus label badge (Strong Buy / Buy / Hold / Sell)
  - Price target cards (if available from paid tier — currently empty)
  - Recommendation breakdown bar (strongBuy/buy/hold/sell/strongSell)
  - Analyst count and period
  - Color-coded recommendation bar with legend
  - Clearly labeled "Wall Street consensus — not a PMP forecast"
- **Data**: 19 recommendations synced (NVDA, AAPL, GOOGL, GOOG, MSFT, AMZN, TSM, SPCX, AVGO, META, TSLA, SKHY, MU, BRK.B, LLY, JPM, WMT, SPY, AMD)
- **Verification**: NVDA shows "Strong Buy" (23 strongBuy, 41 buy, 3 hold, 1 sell). AAPL shows "Buy".

## P3: Ticker Comparison Widget

- **Status**: ✅ Deployed and verified
- **Files modified**:
  - `src/components/company/AnalysisTab.tsx` — imported and rendered `CompareToolbar`
- **Discovery**: The `CompareToolbar` component, `useAnalysis` hook comparison logic, `/api/analysis/[ticker]?compare=XXX` endpoint, and `FinancialHealthTable` secondary data display were all already implemented. The only missing piece was rendering the `CompareToolbar` in `AnalysisTab`.
- **Features**:
  - Ticker input field for comparison
  - Sector peer quick-select buttons
  - Remove comparison button
  - `FinancialHealthTable` shows side-by-side metrics when comparing
  - All client-interactive (no SSR needed)

## P4: Premarket Archive Internal Linking

- **Status**: ✅ Deployed and verified
- **Files modified**:
  - `src/app/analysis/[ticker]/page.tsx` — Recent Market Moves table now links pre-market move dates to archive pages
  - `src/app/premarket-gainers/[date]/page.tsx` — added screener link
  - `src/app/premarket-losers/[date]/page.tsx` — added screener link
- **Features**:
  - Analysis page "Recent Market Moves" table links pre-market moves to `/premarket-gainers/[date]` (positive) or `/premarket-losers/[date]` (negative)
  - Bidirectional linking: archive → ticker → archive
  - Screener link added to premarket archive "Explore More" sections
- **Internal linking chain**:
  ```
  Homepage → /premarket-movers → /premarket-gainers/[date] → /analysis/[ticker]
                            → /premarket-losers/[date]  → /analysis/[ticker]
  /analysis/[ticker] → /premarket-gainers/[date] (via Recent Market Moves)
                     → /premarket-losers/[date] (via Recent Market Moves)
                     → /movers/[ticker] → /earnings → /analysis/[ticker]
  ```
- **Verification**: `/analysis/ZM` links to `/premarket-losers/2026-08-26` (ZM had -5.93% pre-market move). Target page returns 200 and includes ZM.

## Production QA Results

| Feature | URL | Status | Verified |
|---------|-----|--------|----------|
| Earnings SSR | /earnings | 200 | ✅ EPS values in HTML |
| Analysis earnings | /analysis/NVDA | 200 | ✅ EPS in HTML |
| Analyst Consensus | /analysis/NVDA | 200 | ✅ "Strong Buy" + recommendation counts |
| Analyst Consensus | /analysis/AAPL | 200 | ✅ "Buy" consensus |
| Compare Toolbar | /analysis/NVDA | 200 | ✅ Client-rendered |
| Premarket archive link | /analysis/ZM | 200 | ✅ Links to /premarket-losers/2026-08-26 |
| Premarket gainers | /premarket-gainers/2026-08-26 | 200 | ✅ Screener link present |
| Premarket losers | /premarket-losers/2026-08-26 | 200 | ✅ Screener link present, ZM listed |
| Sitemap | /sitemap.xml | 200 | ✅ Includes premarket archives + earnings |

## Commits

1. `49bf084` — P2: Analyst Price Targets — sync + analysis page UI
2. `fabbaa8` — P2: Analyst Consensus — recommendation sync + UI
3. `8729073` — P3: Ticker Comparison Widget — wire CompareToolbar into AnalysisTab
4. `b1aa874` — P4: Premarket Archive Internal Linking — analysis page links + screener links

## Known Issues

- **Redis**: Redis is down on production (ECONNREFUSED 127.0.0.1:6380). All SSR content uses PostgreSQL directly, so this does not affect SEO or page rendering. Redis only affects client-side caching.
- **Finnhub price targets**: Free tier does not include `/stock/price-target`. The UI gracefully handles missing price target data by showing only the recommendation breakdown.
- **Finnhub recommendation sync**: Currently only 19 tickers synced (top 20 by market cap). The cron job will sync all tickers nightly at 03:00 UTC.

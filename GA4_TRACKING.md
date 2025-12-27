# Google Analytics 4 (GA4) Tracking Documentation

This document describes the GA4 tracking implementation for the PreMarketPrice Next.js App Router SPA.

## Overview

GA4 tracking is implemented using:
- **`src/lib/ga.ts`** - Core GA4 utility functions (`pageview`, `event`)
- **`src/components/GAListener.tsx`** - Client component that tracks route changes
- **`src/lib/ga-api-errors.ts`** - Utility for tracking API errors
- **`src/app/layout.tsx`** - GA4 script initialization with `send_page_view: false`

## Configuration

### Environment Variable

Set `NEXT_PUBLIC_GA_ID` in your `.env.local` or production environment:

```bash
NEXT_PUBLIC_GA_ID=G-VQ1P6MDRRW
```

If not set, it defaults to `G-VQ1P6MDRRW`.

### Initialization

GA4 is initialized in `app/layout.tsx` with:
- `send_page_view: false` - Page views are tracked manually via `GAListener`
- `anonymize_ip: true` - IP addresses are anonymized for privacy
- `debug_mode: true` - When URL contains `?debug=1` parameter

## Page View Tracking

Page views are automatically tracked on route changes by the `GAListener` component, which:
- Uses `usePathname()` and `useSearchParams()` from Next.js
- Tracks the full URL including query parameters (e.g., `/heatmap?metric=mcap`)
- Calls `pageview(url)` on every route change

## Custom Events

### 1. Favorite Toggle
**Event:** `favorite_toggle`  
**Triggered when:** User toggles a stock favorite status  
**Parameters:**
- `ticker` (string) - Stock ticker symbol
- `enabled` (boolean) - Whether favorite was added (true) or removed (false)
- `source` (string) - Source of the action (e.g., 'favorites_section')

**Example:**
```typescript
event('favorite_toggle', {
  ticker: 'AAPL',
  enabled: true,
  source: 'favorites_section'
});
```

### 2. Ticker Click
**Event:** `ticker_click`  
**Triggered when:** User clicks on a ticker (heatmap tile or portfolio search result)  
**Parameters:**
- `ticker` (string) - Stock ticker symbol
- `source` (string) - Source of the click ('heatmap' or 'portfolio_search')

**Example:**
```typescript
event('ticker_click', {
  ticker: 'NVDA',
  source: 'heatmap'
});
```

### 3. Heatmap Change
**Event:** `heatmap_change`  
**Triggered when:** User changes heatmap metric (Percent vs Market Cap) or timeframe  
**Parameters:**
- `metric` (string) - Selected metric ('percent' or 'mcap')
- `timeframe` (string) - Selected timeframe (currently 'day')

**Example:**
```typescript
event('heatmap_change', {
  metric: 'mcap',
  timeframe: 'day'
});
```

### 4. Heatmap Fullscreen Toggle
**Event:** `heatmap_fullscreen_toggle`  
**Triggered when:** User enters or exits fullscreen heatmap view  
**Parameters:**
- `enabled` (boolean) - Whether fullscreen was enabled (true) or disabled (false)

**Example:**
```typescript
event('heatmap_fullscreen_toggle', {
  enabled: true
});
```

### 5. Sign-In Click
**Event:** `sign_in_click`  
**Triggered when:** User clicks the sign-in button  
**Parameters:**
- `provider` (string) - Authentication provider ('google')

**Example:**
```typescript
event('sign_in_click', {
  provider: 'google'
});
```

### 6. API Error
**Event:** `api_error`  
**Triggered when:** An API request fails  
**Parameters:**
- `endpoint` (string) - API endpoint that failed (e.g., '/api/heatmap')
- `status` (number) - HTTP status code (0 for network errors)
- `error_message` (string, optional) - Error message for debugging

**Example:**
```typescript
trackApiError('/api/heatmap', 500, 'Internal server error');
```

## Verification

### 1. Verify Page Views in Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to **Network** tab
3. Filter by: `collect`
4. Navigate between pages (e.g., `/` → `/heatmap`)
5. You should see POST requests to `https://region1.google-analytics.com/g/collect` with:
   - `en=page_view` parameter
   - `ep.page_path=/heatmap` (or current path)
   - Status: `204 No Content`

**Example Network Request:**
```
POST https://region1.google-analytics.com/g/collect
...
en=page_view
ep.page_path=/heatmap
tid=G-VQ1P6MDRRW
```

### 2. Verify Events in Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to **Network** tab
3. Filter by: `collect`
4. Perform actions (toggle favorite, click ticker, etc.)
5. You should see POST requests with:
   - `en=<event_name>` (e.g., `en=favorite_toggle`)
   - Event-specific parameters (e.g., `ep.ticker=AAPL`)

**Example Event Request:**
```
POST https://region1.google-analytics.com/g/collect
...
en=favorite_toggle
ep.ticker=AAPL
ep.enabled=true
ep.source=favorites_section
tid=G-VQ1P6MDRRW
```

### 3. Use GA4 DebugView with `?debug=1`

1. Add `?debug=1` to your URL (e.g., `https://premarketprice.com?debug=1`)
2. Open [Google Analytics DebugView](https://analytics.google.com/analytics/web/#/debugview)
3. You should see real-time events as you interact with the site
4. Events will show:
   - Event name
   - Event parameters
   - Timestamp
   - User properties

**Note:** Debug mode is automatically enabled when the URL contains `?debug=1` due to the `debug_mode` configuration in `layout.tsx`.

### 4. Verify in Google Analytics Real-Time Reports

1. Go to [Google Analytics](https://analytics.google.com)
2. Navigate to **Reports** → **Real-Time** → **Overview**
3. Interact with the site
4. You should see:
   - Active users
   - Page views
   - Events (favorite_toggle, ticker_click, etc.)

**Note:** Real-time data may take a few seconds to appear.

## Implementation Details

### File Structure

```
src/
├── lib/
│   ├── ga.ts                    # Core GA4 utilities (pageview, event)
│   └── ga-api-errors.ts         # API error tracking utility
├── components/
│   └── GAListener.tsx           # Route change tracking component
└── app/
    └── layout.tsx               # GA4 script initialization
```

### Usage Examples

**Track a page view:**
```typescript
import { pageview } from '@/lib/ga';

pageview('/heatmap?metric=mcap');
```

**Track a custom event:**
```typescript
import { event } from '@/lib/ga';

event('favorite_toggle', {
  ticker: 'AAPL',
  enabled: true,
  source: 'favorites_section'
});
```

**Track an API error:**
```typescript
import { trackApiError } from '@/lib/ga-api-errors';

try {
  const response = await fetch('/api/stocks');
  if (!response.ok) {
    trackApiError('/api/stocks', response.status);
  }
} catch (error) {
  trackApiError('/api/stocks', 0, error.message);
}
```

## Troubleshooting

### Events Not Appearing

1. **Check Network Tab:** Verify POST requests to `google-analytics.com/g/collect` are being sent
2. **Check Console:** Look for JavaScript errors that might prevent GA4 from loading
3. **Check GA_ID:** Verify `NEXT_PUBLIC_GA_ID` is set correctly
4. **Check Ad Blockers:** Disable ad blockers that might block GA4 scripts

### Page Views Not Tracking

1. **Verify GAListener:** Ensure `<GAListener />` is mounted in `layout.tsx`
2. **Check Route Changes:** Verify `usePathname()` and `useSearchParams()` are working
3. **Check send_page_view:** Ensure `send_page_view: false` is set in GA4 config

### Debug Mode Not Working

1. **Check URL Parameter:** Ensure `?debug=1` is in the URL
2. **Check DebugView:** Open GA4 DebugView in a separate tab
3. **Check Console:** Look for GA4 debug messages

## Privacy

- IP addresses are anonymized (`anonymize_ip: true`)
- No personally identifiable information (PII) is tracked
- Cookie consent is respected (favorites require consent)

## References

- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Next.js Script Component](https://nextjs.org/docs/app/api-reference/components/script)
- [GA4 DebugView](https://support.google.com/analytics/answer/7201382)


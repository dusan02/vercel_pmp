# SEO Health Report — Production Baseline

**Date:** 2026-09-15 · **Commit:** `af96361d` · **Tool:** `npx tsx scripts/seo-health-check.ts https://premarketprice.com`

This is the pre-GSC baseline. All numbers measured against live production with a Googlebot user-agent.

## Page health

| URL | HTTP | H1 | Title | Clean text | Analysis links | Issues |
|---|---:|---:|---:|---:|---:|---|
| `/` | 200 | 1 | 50 | 2,756 | 60 | — |
| `/screener` | 200 | 1 | 47 | 2,449 | 0 | thin content |
| `/sectors` | 200 | 1 | 30 | 594 | 0 | thin content |
| `/heatmap` | 200 | 1 | 31 | 1,078 | 8 | thin content |
| `/earnings` | 200 | 1 | 34 | 4,489 | 57 | — |
| `/premarket-movers` | 200 | 1 | 58 | 4,180 | 68 | — |
| `/analysis/AAPL` | 200 | 1 | 52 | 6,403 | 10 | — |
| `/valuation/AAPL` | 200 | 1 | 39 | 3,782 | 3 | — |
| `/financials/AAPL` | 200 | 1 | 40 | 4,685 | 3 | — |
| `/movers/AAPL` | 200 | 1 | 36 | 2,082 | 1 | `noindex` (by design) |

All titles ≤60 chars. Exactly one H1 per page (logo headings removed from `PageHeader`).

## Sitemap

- HTTP 200, **2,119 unique URLs** — analysis 695, financials 619, valuation 566, movers 120, archive 61, earnings 31, sectors 12, blog 6
- 7 unique `lastmod` dates
- `robots.txt` 200, references sitemap, no disallow-all

## Analytics (GA4 `G-VQ1P6MDRRW`)

- `page_view` on all routes (GAListener), `analysis_view` per ticker, `favorite_toggle`, `sign_in_click`, `ticker_click`, `heatmap_change`, `api_error`
- Organic attribution via GA4 source/medium — no custom UTM needed
- Funnel coverage: landing → analysis → sign-in → favorite ✅; paid conversion ❌ (no Stripe)

## Deferred to post-GSC decision

- Thin content on `/screener`, `/sectors`, `/heatmap`
- `noindex` movers pages with insufficient data
- Internal-linking expansion, content enrichment, programmatic pages

**Note:** "technically indexable" ≠ "indexed". Actual indexation is a GSC question.

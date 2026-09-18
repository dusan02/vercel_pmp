import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;

/**
 * llms.txt — a standard summary file for LLM crawlers (GEO).
 * Describes the site structure so AI engines can cite the right pages.
 */
export async function GET() {
  let tickers: string[] = [];
  try {
    tickers = await getEligibleAnalysisTickers();
  } catch {
    tickers = [];
  }

  const topTickers = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'JPM', 'V']
    .filter((t) => tickers.length === 0 || tickers.includes(t));

  const body = `# PreMarketPrice

> Real-time pre-market stock prices, market movers, earnings calendar, and data-driven stock analysis for US-listed companies (NYSE, NASDAQ). Free, no paywall.

PreMarketPrice tracks 300+ US stocks during the pre-market session (4:00 AM – 9:30 AM ET), publishing live prices, percentage changes, market-cap moves, and per-ticker fundamental analysis. Data is updated continuously during market hours.

## Main pages

- [Homepage](https://premarketprice.com): Live pre-market prices and market overview
- [Market Heatmap](https://premarketprice.com/heatmap): Color-coded heatmap of the whole US market by sector and market cap
- [Premarket Movers](https://premarketprice.com/premarket-movers): Stocks moving the most in pre-market trading today, with z-scores and relative volume
- [Premarket Gainers](https://premarketprice.com/gainers): Top pre-market gainers today with prices and market-cap changes
- [Premarket Losers](https://premarketprice.com/losers): Top pre-market losers today with prices and market-cap changes
- [Earnings Calendar](https://premarketprice.com/earnings): Upcoming earnings dates, EPS and revenue estimates for US companies
- [Stock Screener](https://premarketprice.com/screener): Filter US stocks by sector, price, market cap, and pre-market movement
- [Curated stock screens](https://premarketprice.com/screener/most-undervalued): Ranked leaderboards — most undervalued, healthiest balance sheets, highest Piotroski score, lowest P/E, lowest PEG, highest dividend yield, highest ROE, highest FCF margin, fastest revenue growth
- [Early Winners](https://premarketprice.com/screener/early-winners): US stocks ranked by the PMP composite score — fundamentals, momentum and quality factors from SEC filings and price data (V5-B current-data methodology, earnings pillar blocked)
- [Capex Tracker](https://premarketprice.com/capex-tracker): Top 50 US companies by capital expenditures — capex/revenue intensity, YoY change and FCF after capex
- [All Stocks](https://premarketprice.com/stocks): Full index of every tracked US stock with links to its analysis and valuation pages
- [Sectors](https://premarketprice.com/sectors): Sector-level performance and top movers per sector
- [Embeddable heatmap widget](https://premarketprice.com/embed/heatmap): Free iframe widget of the live heatmap for external publishers
- [Blog](https://premarketprice.com/blog): Daily premarket reports and weekly earnings recaps
- [RSS Feed](https://premarketprice.com/api/rss): Machine-readable feed of daily reports

## Daily archives (updated every trading day)

Each trading day gets permanent dated pages — useful for "what moved on [date]" questions:

- /premarket-gainers/[YYYY-MM-DD]: top pre-market gainers for that date (e.g. [latest](https://premarketprice.com/premarket-gainers))
- /premarket-losers/[YYYY-MM-DD]: top pre-market losers for that date (e.g. [latest](https://premarketprice.com/premarket-losers))
- /gainers and /losers: today's regular-session leaders
- [/premarket-movers/weekly](https://premarketprice.com/premarket-movers/weekly): biggest single-day pre-market moves of the current trading week
- /premarket/[TICKER]: per-stock history of significant pre-market moves with catalysts (e.g. [AAPL](https://premarketprice.com/premarket/AAPL))

## Metric heatmaps (one per fundamental/valuation metric)

Dedicated heatmap pages ranking the whole market by a single metric — useful for "which stocks have the lowest P/E" style questions:

- [P/E ratio](https://premarketprice.com/heatmap/pe-ratio), [forward P/E](https://premarketprice.com/heatmap/forward-pe), [P/S](https://premarketprice.com/heatmap/price-to-sales), [P/B](https://premarketprice.com/heatmap/price-to-book), [PEG](https://premarketprice.com/heatmap/peg-ratio), [EV/EBITDA](https://premarketprice.com/heatmap/ev-ebitda)
- [Dividend yield](https://premarketprice.com/heatmap/dividend-yield), [ROE](https://premarketprice.com/heatmap/roe), [net margin](https://premarketprice.com/heatmap/net-margin), [revenue growth](https://premarketprice.com/heatmap/revenue-growth), [EPS growth](https://premarketprice.com/heatmap/eps-growth), [FCF margin](https://premarketprice.com/heatmap/fcf-margin)
- [Piotroski F-Score](https://premarketprice.com/heatmap/piotroski-score), [Altman Z-Score](https://premarketprice.com/heatmap/altman-z-score), [Beneish M-Score](https://premarketprice.com/heatmap/beneish-m-score)
- [Relative volume](https://premarketprice.com/heatmap/relative-volume), [beta](https://premarketprice.com/heatmap/beta), [movers z-score](https://premarketprice.com/heatmap/movers-z-score)
- [Weekly](https://premarketprice.com/heatmap/weekly-performance), [monthly](https://premarketprice.com/heatmap/monthly-performance), [YTD](https://premarketprice.com/heatmap/ytd), [1-year](https://premarketprice.com/heatmap/one-year-performance) performance, [market-cap change](https://premarketprice.com/heatmap/market-cap-change)

## Chinese version (中文版)

Simplified Chinese pilot pages — same live data, Chinese UI:

- [/zh](https://premarketprice.com/zh): Chinese index / 美股盘前行情
- [/zh/premarket-movers](https://premarketprice.com/zh/premarket-movers): 今日美股盘前异动股

## Per-ticker pages

Each tracked company has three data pages:

- /analysis/[TICKER]: live pre-market price, financial health scores, profitability, valuation, recent moves (e.g. [AAPL](https://premarketprice.com/analysis/AAPL))
- /valuation/[TICKER]: P/E and P/S history, valuation percentile vs 5-year range (e.g. [AAPL](https://premarketprice.com/valuation/AAPL))
- /financials/[TICKER]: revenue, net income, assets and liabilities history (e.g. [AAPL](https://premarketprice.com/financials/AAPL))

Top tickers: ${topTickers.map((t) => `[${t}](https://premarketprice.com/analysis/${t})`).join(', ')}

## Data methodology

- Prices are sourced from financial data APIs and refreshed continuously during the pre-market session.
- Movers are ranked by percentage change with statistical significance filtering (z-score >= 2.0).
- Analysis pages include Altman Z-Score, debt ratios, profitability margins, and P/E valuation context.
- Every page shows a "last updated" timestamp; historical archive pages are kept for each trading day.

## Company

- [About](https://premarketprice.com/about)
- [Contact](https://premarketprice.com/contact): info@verifa.sk
- [Disclaimer](https://premarketprice.com/disclaimer)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

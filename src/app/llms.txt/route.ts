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
- [All Stocks](https://premarketprice.com/stocks): Full list of tracked US stocks with live prices
- [Sectors](https://premarketprice.com/sectors): Sector-level performance and top movers per sector
- [Blog](https://premarketprice.com/blog): Daily premarket reports and weekly earnings recaps
- [RSS Feed](https://premarketprice.com/api/rss): Machine-readable feed of daily reports

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
- [Contact](https://premarketprice.com/contact): info@premarketprice.com
- [Disclaimer](https://premarketprice.com/disclaimer)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

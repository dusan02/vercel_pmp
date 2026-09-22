/**
 * Leaderboard definitions for programmatic SEO pages at /screener/[slug].
 * Each leaderboard is a server-rendered "top N stocks by metric X" page.
 * Data comes from AnalysisCache (our computed scores) or FinnhubMetrics
 * (Finnhub fundamentals) — both refreshed daily by the worker.
 */

import { prisma } from '@/lib/db/prisma';
import { formatCurrencyCompact } from '@/lib/utils/format';

export type MetricSource = 'analysisCache' | 'finnhubMetrics' | 'ewScore' | 'insiderAggregate';

export interface LeaderboardDef {
  slug: string;
  /** <title> */
  title: string;
  /** Page H1 */
  h1: string;
  /** meta description */
  description: string;
  keywords: string[];
  /** Table column header for the metric, e.g. "P/E" */
  metricLabel: string;
  source: MetricSource;
  /** Field on the source relation, e.g. 'peRatio' */
  field: string;
  order: 'asc' | 'desc';
  /** Optional minimum value filter (e.g. exclude negative P/E) */
  minValue?: number;
  /** Extra conditions on the metric relation — combined screens like
   *  "quality ≥75 AND valuation ≥60". Merged into the metric `is` filter. */
  extraWhere?: Record<string, unknown>;
  format: (v: number) => string;
  /** 1–2 intro paragraphs rendered above the table (crawlable). */
  intro: string[];
  /** FAQ items rendered visibly and emitted as FAQPage JSON-LD. */
  faq: { q: string; a: string }[];
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const num1 = (v: number) => v.toFixed(1);
const num2 = (v: number) => v.toFixed(2);

export const LEADERBOARDS: LeaderboardDef[] = [
  {
    slug: 'most-undervalued',
    title: 'Most Undervalued Stocks — Top Picks by Valuation Score',
    h1: 'Most Undervalued Stocks',
    description:
      'US stocks ranked by our valuation score: P/E vs its own 5-year history, free-cash-flow yield, price-to-sales and EV/EBIT. Updated daily.',
    keywords: ['most undervalued stocks', 'undervalued stocks', 'cheap stocks', 'value stocks screener', 'stocks trading below fair value'],
    metricLabel: 'Valuation score',
    source: 'analysisCache',
    field: 'valuationScore',
    order: 'desc',
    format: (v) => String(Math.round(v)),
    intro: [
      'These US-listed stocks rank highest on our composite valuation score — a 0–100 metric that rewards cheapness on four equally-weighted checks: current P/E versus the stock’s own 5-year history, free-cash-flow yield, price-to-sales, and EV/EBIT.',
      'A high score means the stock looks inexpensive relative to its own history and typical sector levels — it is a screening starting point, not a guarantee of returns. Always review the full analysis before investing.',
    ],
    faq: [
      { q: 'How is the valuation score calculated?', a: 'It sums up to 25 points each for four checks: P/E percentile vs the stock’s own history, free-cash-flow yield, price-to-sales ratio, and EV/EBIT. Scores range from 0 (expensive) to 100 (cheap).' },
      { q: 'Does a high valuation score mean the stock will go up?', a: 'No. It only means the stock looks cheap on common multiples — cheap stocks can stay cheap if fundamentals deteriorate. Use it as a filter, then dig into the analysis.' },
    ],
  },
  {
    slug: 'healthiest-balance-sheets',
    title: 'Financially Healthiest Stocks — Strongest Balance Sheets',
    h1: 'Financially Healthiest Stocks',
    description:
      'US stocks ranked by financial health score: Altman Z-score, current ratio, interest coverage and net debt vs assets. Updated daily.',
    keywords: ['financially healthy stocks', 'strong balance sheet stocks', 'financial health score', 'safe stocks', 'low debt stocks'],
    metricLabel: 'Health score',
    source: 'analysisCache',
    field: 'healthScore',
    order: 'desc',
    format: (v) => String(Math.round(v)),
    intro: [
      'These companies rank highest on our 0–100 financial health score, which adds up to 25 points each for Altman Z-score (bankruptcy risk), current ratio (liquidity), interest coverage (debt serviceability) and net debt relative to total assets (leverage).',
      'A high score signals a company that can fund operations and service debt comfortably — useful when screening for resilience during downturns.',
    ],
    faq: [
      { q: 'What does the health score measure?', a: 'Balance-sheet strength: Altman Z-score, current ratio, interest coverage, and net debt relative to assets — 25 points each, 0–100 total.' },
      { q: 'Is a high health score always good?', a: 'It means low balance-sheet risk, not necessarily a good investment — growth and valuation are not part of this score.' },
    ],
  },
  {
    slug: 'highest-piotroski-score',
    title: 'Highest Piotroski F-Score Stocks — Fundamental Strength',
    h1: 'Highest Piotroski F-Score Stocks',
    description:
      'US stocks with the highest Piotroski F-score — the 9-point fundamental checklist covering profitability, leverage and efficiency. Updated daily.',
    keywords: ['piotroski f score stocks', 'high piotroski score', 'piotroski screen', 'fundamentally strong stocks', 'f score 9 stocks'],
    metricLabel: 'F-Score',
    source: 'analysisCache',
    field: 'piotroskiScore',
    order: 'desc',
    format: (v) => `${Math.round(v)}/9`,
    intro: [
      'The Piotroski F-score rates companies 0–9 on binary checks of profitability (positive income, cash flow, ROA, accruals), leverage/liquidity (debt, current ratio, share count) and operating efficiency (margin and asset-turnover trends).',
      'Scores of 8–9 are considered fundamentally strong; 0–2 weak. This list surfaces US stocks passing the most checks in their latest annual filings.',
    ],
    faq: [
      { q: 'What is a good Piotroski F-score?', a: '8–9 is traditionally considered strong, 4–6 average, and 0–2 weak. The score measures fundamental improvement, not valuation.' },
      { q: 'Where does the data come from?', a: 'We compute the F-score from SEC-filed annual financial statements, refreshed after each filing.' },
    ],
  },
  {
    slug: 'lowest-pe-ratio',
    title: 'Lowest P/E Ratio Stocks — Cheapest Earnings Multiples',
    h1: 'Lowest P/E Ratio Stocks',
    description:
      'US stocks with the lowest price-to-earnings ratios. Only profitable companies (P/E > 0) are included. Updated daily from Finnhub data.',
    keywords: ['low pe stocks', 'lowest pe ratio stocks', 'cheap stocks by pe', 'low price to earnings stocks', 'value stocks low pe'],
    metricLabel: 'P/E',
    source: 'finnhubMetrics',
    field: 'peRatio',
    order: 'asc',
    minValue: 0,
    format: num1,
    intro: [
      'The price-to-earnings (P/E) ratio divides the share price by trailing earnings per share — the lower it is, the less you pay per dollar of profit. This list shows US stocks with the lowest positive P/E (companies losing money have no meaningful P/E and are excluded).',
      'A low P/E can signal an undervalued stock — or a business in decline. Compare it with the company’s own history and sector peers before drawing conclusions.',
    ],
    faq: [
      { q: 'What is a good P/E ratio?', a: 'There is no universal number — the S&P 500 historically averages around 15–25. Sector context matters: utilities trade lower, tech higher. Compare within the same industry.' },
      { q: 'Why are negative P/E stocks excluded?', a: 'A negative P/E means the company is losing money — the ratio is not meaningful. We only rank profitable companies.' },
    ],
  },
  {
    slug: 'lowest-peg-ratio',
    title: 'Lowest PEG Ratio Stocks — Growth at a Reasonable Price',
    h1: 'Lowest PEG Ratio Stocks',
    description:
      'US stocks with the lowest PEG ratios — P/E divided by earnings growth. Peter Lynch’s "growth at a reasonable price" screen. Updated daily.',
    keywords: ['low peg stocks', 'peg ratio screener', 'growth at reasonable price', 'garp stocks', 'undervalued growth stocks'],
    metricLabel: 'PEG',
    source: 'finnhubMetrics',
    field: 'pegRatio',
    order: 'asc',
    minValue: 0,
    format: num2,
    intro: [
      'The PEG ratio divides the P/E by the earnings growth rate — popularized by Peter Lynch as a "growth at a reasonable price" (GARP) gauge. A PEG below 1 is traditionally viewed as attractively priced relative to growth.',
      'This list ranks US stocks with the lowest positive PEG. Be aware PEG depends on the growth rate used (historical vs forward) — treat it as a first-pass screen.',
    ],
    faq: [
      { q: 'What is a good PEG ratio?', a: 'Below 1.0 is the classic "cheap relative to growth" threshold; 1–2 is reasonable; above 2 suggests you pay a lot for each point of growth.' },
      { q: 'Why are some stocks missing PEG?', a: 'PEG needs both positive earnings and a meaningful growth rate — companies with losses or erratic growth often have no usable value.' },
    ],
  },
  {
    slug: 'highest-dividend-yield',
    title: 'Highest Dividend Yield Stocks — Top Income Payers',
    h1: 'Highest Dividend Yield Stocks',
    description:
      'US stocks with the highest dividend yields (trailing twelve months). Updated daily from Finnhub data.',
    keywords: ['highest dividend yield stocks', 'high dividend stocks', 'best dividend stocks', 'dividend yield screener', 'income stocks'],
    metricLabel: 'Div. yield',
    source: 'finnhubMetrics',
    field: 'dividendYield',
    order: 'desc',
    minValue: 0,
    format: pct1,
    intro: [
      'Dividend yield is the annual dividend per share divided by the share price. This list ranks US stocks by trailing-twelve-month yield.',
      'A very high yield can signal a falling share price rather than a generous payout — the classic "yield trap". Check the payout’s coverage by free cash flow before relying on it.',
    ],
    faq: [
      { q: 'What is a good dividend yield?', a: 'The S&P 500 averages roughly 1.3–2%. Yields of 3–5% are considered high; anything above ~8% deserves extra scrutiny — it may reflect a price crash, not generosity.' },
      { q: 'Is a higher yield always better?', a: 'No. The yield rises when the price falls. Screen for dividend sustainability (FCF coverage, debt) alongside the headline number.' },
    ],
  },
  {
    slug: 'highest-roe',
    title: 'Highest ROE Stocks — Best Return on Equity',
    h1: 'Highest ROE Stocks',
    description:
      'US stocks with the highest return on equity (ROE) — net income relative to shareholder equity. Updated daily from Finnhub data.',
    keywords: ['highest roe stocks', 'return on equity screener', 'high roe companies', 'efficient companies stocks', 'roe ranking'],
    metricLabel: 'ROE',
    source: 'finnhubMetrics',
    field: 'roe',
    order: 'desc',
    minValue: 0,
    format: pct1,
    intro: [
      'Return on equity measures how much profit a company generates per dollar of shareholder equity — Warren Buffett’s favorite quality gauge. Persistent ROE above ~15–20% usually marks an efficient, well-run business.',
      'Caveat: high leverage inflates ROE mechanically. Pair it with the health score to separate genuinely profitable companies from debt-fueled ones.',
    ],
    faq: [
      { q: 'What is a good ROE?', a: 'Above 15% is generally considered strong; above 25% excellent. Extremely high ROE (>100%) often reflects a small or negative equity base from buybacks — check the balance sheet.' },
      { q: 'Why are negative-ROE stocks excluded?', a: 'ROE below zero means the company loses money on shareholders’ capital — this list highlights profitable capital allocation only.' },
    ],
  },
  {
    slug: 'highest-fcf-margin',
    title: 'Highest Free Cash Flow Margin Stocks — Cash Machines',
    h1: 'Highest Free Cash Flow Margin Stocks',
    description:
      'US stocks ranked by free-cash-flow margin — how much of each revenue dollar becomes free cash. Updated daily.',
    keywords: ['free cash flow stocks', 'high fcf margin', 'cash generating stocks', 'fcf margin screener', 'quality stocks cash flow'],
    metricLabel: 'FCF margin',
    source: 'analysisCache',
    field: 'fcfMargin',
    order: 'desc',
    format: pct1,
    intro: [
      'Free-cash-flow margin is FCF divided by revenue — the share of sales that turns into spendable cash after running and investing in the business. High-margin companies can fund dividends, buybacks and growth without new debt.',
      'This list ranks US stocks by their latest annual FCF margin, computed from SEC-filed statements.',
    ],
    faq: [
      { q: 'What is a good FCF margin?', a: 'Above 10% is solid; above 20% is excellent (typical of software and asset-light businesses). Capital-intensive industries naturally run lower.' },
      { q: 'Why FCF margin and not just earnings?', a: 'Cash is harder to fudge than accounting profit — FCF subtracts capital expenditure, so it shows what the business truly generates.' },
    ],
  },
  {
    slug: 'fastest-revenue-growth',
    title: 'Fastest Growing Stocks — Top Revenue Growth Rates',
    h1: 'Fastest Growing Stocks',
    description:
      'US stocks with the highest year-over-year revenue growth. Updated daily from Finnhub data.',
    keywords: ['fastest growing stocks', 'high revenue growth stocks', 'growth stocks screener', 'top growth companies', 'revenue growth ranking'],
    metricLabel: 'Rev. growth',
    source: 'finnhubMetrics',
    field: 'revenueGrowth',
    order: 'desc',
    minValue: 0,
    format: pct1,
    intro: [
      'Revenue growth is the year-over-year percentage increase in sales — the raw speed of business expansion. This list ranks US stocks by their latest reported growth rate.',
      'Growth without profitability burns cash — combine this screen with the profitability score or net margin to find companies growing sustainably.',
    ],
    faq: [
      { q: 'What counts as high revenue growth?', a: 'Above 20% YoY is generally considered high growth for large caps; small caps can sustain 50%+. Growth naturally slows as companies scale.' },
      { q: 'Is high revenue growth always good?', a: 'Not alone — growth bought with discounts or heavy spending can destroy value. Check margins and cash flow alongside it.' },
    ],
  },
  {
    slug: 'best-overall',
    title: 'Best Overall Stocks — Highest Composite Fundamental Score',
    h1: 'Best Overall Stocks',
    description:
      'US stocks ranked by overall fundamental score — the mean of our five 0–100 pillar scores: valuation, growth, profitability, financial health and quality. Updated daily.',
    keywords: ['best stocks overall', 'highest rated stocks', 'best fundamental stocks', 'top scored stocks', 'strongest companies'],
    metricLabel: 'Overall score',
    source: 'analysisCache',
    field: 'overallScore',
    order: 'desc',
    format: (v) => String(Math.round(v)),
    intro: [
      'The overall score is the simple mean of five equally-weighted pillars — valuation (cheapness vs own history), growth (revenue/EPS trajectory), profitability (returns and margins), financial health (balance-sheet strength) and quality (earnings reliability).',
      'A high overall score means a company performs well across all five dimensions — not that the stock is a buy. Use it as a starting point, then review the per-pillar breakdown on the analysis page.',
    ],
    faq: [
      { q: 'How is the overall score calculated?', a: 'It is the arithmetic mean of five 0–100 pillar scores: valuation, growth, profitability, financial health and quality. Each pillar itself sums four 25-point checks.' },
      { q: 'Is the overall score the same as the Early Winners score?', a: 'No — Early Winners is a separate quant composite (V5-B methodology) with different inputs and weights. The overall score is a transparent mean of the five analysis pillars shown on every stock page.' },
    ],
  },
  {
    slug: 'highest-quality',
    title: 'Highest Quality Stocks — Strongest Earnings Reliability',
    h1: 'Highest Quality Stocks',
    description:
      'US stocks ranked by quality score: Piotroski F-score, Beneish M-score (earnings manipulation risk), FCF conversion and margin stability. Updated daily.',
    keywords: ['high quality stocks', 'quality stocks', 'earnings quality', 'piotroski beneish screen', 'reliable earnings stocks'],
    metricLabel: 'Quality score',
    source: 'analysisCache',
    field: 'qualityScore',
    order: 'desc',
    format: (v) => String(Math.round(v)),
    intro: [
      'The quality score (0–100) sums four checks: Piotroski F-score (fundamental improvement), Beneish M-score (earnings-manipulation risk), free-cash-flow conversion (earnings backed by cash) and margin stability (predictable operations).',
      'High-quality companies show consistent, cash-backed profits — this is a screen for reliability, not cheapness. Pair it with the valuation score to find quality at a reasonable price.',
    ],
    faq: [
      { q: 'What makes a stock "high quality"?', a: 'Strong Piotroski F-score, low Beneish M-score (low manipulation risk), high FCF conversion and stable margins — signs that reported earnings are real and repeatable.' },
      { q: 'Does high quality mean a good investment?', a: 'Not by itself — quality says nothing about the price you pay. Combine it with the valuation score for a fuller picture.' },
    ],
  },
  {
    slug: 'highest-growth',
    title: 'Highest Growth Stocks — Fastest Revenue & EPS Expansion',
    h1: 'Highest Growth Stocks',
    description:
      'US stocks ranked by growth score: revenue CAGR, net-income CAGR, 5-year EPS CAGR and forward implied growth. Updated daily.',
    keywords: ['highest growth stocks', 'fastest growing stocks', 'revenue growth stocks', 'eps growth screen', 'growth stock screener'],
    metricLabel: 'Growth score',
    source: 'analysisCache',
    field: 'growthScore',
    order: 'desc',
    format: (v) => String(Math.round(v)),
    intro: [
      'The growth score (0–100) sums four checks: multi-year revenue CAGR, net-income CAGR, 5-year EPS CAGR and forward implied growth derived from the forward P/E.',
      'High growth scores flag companies expanding fast — but say nothing about valuation or durability. The analysis page shows each growth leg separately.',
    ],
    faq: [
      { q: 'What counts as a high growth score?', a: 'Scores of 75+ typically mean strong double-digit compounded growth across revenue, earnings and EPS over the last ~5 years plus positive forward expectations.' },
      { q: 'Is a high growth score risky?', a: 'Growth screens surface fast growers, including cyclicals at peak earnings — check the health and quality pillars before drawing conclusions.' },
    ],
  },
  {
    slug: 'quality-compounders',
    title: 'Quality Compounders — High Quality, Profitability and Growth',
    h1: 'Quality Compounders',
    description:
      'US stocks passing a combined screen: quality ≥ 80, profitability ≥ 75 and growth ≥ 60. Updated daily.',
    keywords: ['quality compounders', 'quality growth stocks', 'compounders screen', 'high quality profitable stocks', 'compounding stocks'],
    metricLabel: 'Quality score',
    source: 'analysisCache',
    field: 'qualityScore',
    order: 'desc',
    extraWhere: { qualityScore: { gte: 80 }, profitabilityScore: { gte: 75 }, growthScore: { gte: 60 } },
    format: (v) => String(Math.round(v)),
    intro: [
      'Quality compounders are companies that score at least 80/100 on quality, 75/100 on profitability and 60/100 on growth — reliable, cash-backed earnings that are still expanding.',
      'The screen deliberately ignores valuation: some of these names may be expensive. Check the valuation pillar on each analysis page before treating any entry as attractive.',
    ],
    faq: [
      { q: 'What is a quality compounder?', a: 'A company combining high earnings quality (cash-backed profits, low manipulation risk) with strong profitability and continued growth — the classic "compounder" profile.' },
      { q: 'Why is valuation not part of this screen?', a: 'It is intentionally quality-first. Cheapness is a separate pillar — see the "quality at a reasonable price" screen for the value-aware variant.' },
    ],
  },
  {
    slug: 'quality-at-reasonable-price',
    title: 'Quality Stocks at a Reasonable Price — Quality ≥75, Valuation ≥60',
    h1: 'Quality Stocks at a Reasonable Price',
    description:
      'US stocks passing a combined screen: quality ≥ 75 and valuation ≥ 60 — reliable fundamentals that are not historically expensive. Updated daily.',
    keywords: ['quality at reasonable price', 'qarp stocks', 'cheap quality stocks', 'undervalued quality stocks', 'quality value screen'],
    metricLabel: 'Overall score',
    source: 'analysisCache',
    field: 'overallScore',
    order: 'desc',
    extraWhere: { qualityScore: { gte: 75 }, valuationScore: { gte: 60 } },
    format: (v) => String(Math.round(v)),
    intro: [
      'This screen combines the two pillars investors most often want together: quality ≥ 75 (reliable, cash-backed earnings) and valuation ≥ 60 (not expensive versus the stock’s own history).',
      'It is the classic "quality at a reasonable price" idea expressed in our five-pillar framework — sorted by overall score so the most balanced names appear first.',
    ],
    faq: [
      { q: 'What does the valuation score measure here?', a: 'Cheapness relative to the stock’s own 5-year valuation history plus absolute multiples (FCF yield, P/S, EV/EBIT) — not a cross-sector comparison.' },
      { q: 'Is this a buy list?', a: 'No — it is a screening starting point. Fundamental scores describe the business and its price relative to history, not future returns.' },
    ],
  },
  {
    slug: 'growth-at-reasonable-price',
    title: 'Growth Stocks at a Reasonable Price — Growth ≥75, Valuation ≥60',
    h1: 'Growth Stocks at a Reasonable Price',
    description:
      'US stocks passing a combined screen: growth ≥ 75 and valuation ≥ 60 — fast-growing companies that are not historically expensive. Updated daily.',
    keywords: ['growth at reasonable price', 'garp stocks', 'cheap growth stocks', 'undervalued growth stocks', 'growth value screen'],
    metricLabel: 'Overall score',
    source: 'analysisCache',
    field: 'overallScore',
    order: 'desc',
    extraWhere: { growthScore: { gte: 75 }, valuationScore: { gte: 60 } },
    format: (v) => String(Math.round(v)),
    intro: [
      'GARP — growth at a reasonable price — combines growth ≥ 75 (strong revenue, earnings and EPS expansion) with valuation ≥ 60 (not expensive versus the stock’s own history).',
      'The combination filters out both speculative growth and stagnant value traps; the table is sorted by overall score across all five pillars.',
    ],
    faq: [
      { q: 'What is GARP?', a: 'Growth at a reasonable price — a screen for companies growing quickly that are not trading at extreme valuations. Here: growth pillar ≥75 and valuation pillar ≥60.' },
      { q: 'Are these stocks cheap?', a: 'Relatively — valuation ≥60 means cheaper than most of the stock’s own history, not necessarily cheap in absolute terms.' },
    ],
  },
  {
    slug: 'early-winners',
    title: 'Early Winners — Top Stocks by PMP Composite Score',
    h1: 'Early Winners',
    description:
      'US stocks ranked by the Early Winners composite score (fundamentals, momentum and quality factors from SEC filings and price data). Current-data score — V5-B methodology.',
    keywords: ['early winners stocks', 'best stocks to buy', 'stock ranking', 'composite stock score', 'top rated stocks'],
    metricLabel: 'EW score',
    source: 'ewScore',
    field: 'totalScore',
    order: 'desc',
    format: num1,
    intro: [
      'Early Winners is our 0–100 composite ranking built on the frozen V5 methodology: 35% earnings, 30% fundamentals, 25% momentum and 10% quality — computed from SEC filings and market data.',
      'This page shows the current-data (V5-B) variant: the earnings pillar is blocked until verified point-in-time analyst consensus data becomes available, so the score reflects fundamentals, momentum and quality only. It is a screening signal, not a backtested result — historical V5-C performance has not been established.',
    ],
    faq: [
      { q: 'What is the Early Winners score?', a: 'A 0–100 composite ranking across four weighted pillars: earnings (35%), fundamentals (30%), momentum (25%) and quality (10%). It uses SEC-filed financials and price/volume data.' },
      { q: 'Why does the Earnings column show BLOCKED?', a: 'The earnings pillar requires historical point-in-time analyst consensus data, which is not currently available. Rather than fabricate a value, the score is computed without it and the pillar is explicitly marked as blocked.' },
      { q: 'Is this score backtested?', a: 'The underlying V5-B methodology has a frozen out-of-sample benchmark, but this current-data leaderboard is not itself a backtest — it is a daily snapshot for screening, not a promise of future returns.' },
      { q: 'How often is it updated?', a: 'Scores are recomputed as a batch from the latest available filings and price data and imported daily.' },
    ],
  },
  {
    slug: 'insider-buying',
    title: 'Stocks With the Most Insider Buying — Last 90 Days',
    h1: 'Stocks With the Most Insider Buying',
    description:
      'US stocks ranked by net open-market insider buying over the last 90 days — real SEC Form 4 purchases at actual transaction prices, aggregated daily.',
    keywords: ['insider buying stocks', 'most insider buying', 'insider purchases', 'stocks insiders are buying', 'form 4 insider buying'],
    metricLabel: 'Net insider buying (90D)',
    source: 'insiderAggregate',
    field: 'netBuyValue90d',
    order: 'desc',
    minValue: 0,
    format: (v) => formatCurrencyCompact(v, true),
    intro: [
      'These US-listed companies saw the largest net open-market insider purchases over the last 90 days. We count only Form 4 transaction codes P (open-market purchase) and S (open-market sale) — stock grants, option exercises, tax withholdings and gifts are excluded because they are compensation mechanics, not a discretionary signal.',
      'Dollar amounts use shares multiplied by the actual transaction price reported to the SEC — not today\'s price. Insider buying is one of the stronger public signals of management conviction, but a single purchase is still just one data point.',
    ],
    faq: [
      { q: 'What counts as insider buying?', a: 'Only SEC Form 4 transaction code P — an open-market or private purchase of company shares by an officer, director or 10% owner. Grants (A), option exercises (M) and tax withholdings (F) are excluded.' },
      { q: 'How is "net" insider buying computed?', a: 'Total dollars purchased (code P) minus total dollars sold (code S) over the trailing 90 days, valued at each transaction\'s reported execution price.' },
      { q: 'Why does insider buying matter?', a: 'Insiders sell for many reasons (diversification, taxes, comp plans) but generally buy for one — they believe the stock is worth more than its price. Academic research consistently links open-market insider purchases to positive abnormal returns.' },
      { q: 'How fresh is this data?', a: 'Form 4 filings must be submitted within two business days of the transaction. We sync filings daily and recompute the aggregates once per day.' },
    ],
  },
  {
    slug: 'insider-buying-percent',
    title: 'Biggest Insider Buying by % of Shares Outstanding — 90 Days',
    h1: 'Biggest Insider Buying by % of Shares Outstanding',
    description:
      'US stocks ranked by net insider buying as a percentage of shares outstanding over 90 days — a size-adjusted view of insider conviction across large and small caps.',
    keywords: ['insider buying percentage', 'insider ownership change', 'insider accumulation', 'insider buying percent of float'],
    metricLabel: 'Net buying % of shares out.',
    source: 'insiderAggregate',
    field: 'netBuyPct90d',
    order: 'desc',
    minValue: 0,
    format: (v) => `${(v * 100).toFixed(2)}%`,
    intro: [
      'Dollar rankings favor mega-caps — a $300M insider purchase means more at a $5B company than at a $3T one. This leaderboard normalizes net open-market insider buying (Form 4 codes P and S, 90 days) by shares outstanding, surfacing companies where insiders moved a meaningful share of the company.',
      'Small floats amplify this metric — a single large holder purchase can top the list. Pair it with the dollar-value leaderboard for the full picture.',
    ],
    faq: [
      { q: 'Why rank by % of shares outstanding instead of dollars?', a: 'It removes the size bias: $10M of insider buying is routine at a mega-cap but a major conviction signal at a small-cap.' },
      { q: 'What transactions are included?', a: 'SEC Form 4 codes P (open-market purchase) and S (open-market sale) over the trailing 90 days. Compensation-related codes (grants, option exercises, tax withholding) are excluded.' },
      { q: 'Can this ranking be skewed?', a: 'Yes — companies with low share counts can jump to the top on a single transaction. Treat it as a discovery screen, not a ranking of conviction quality.' },
    ],
  },
  {
    slug: 'insider-selling',
    title: 'Stocks With the Most Insider Selling — Last 90 Days',
    h1: 'Stocks With the Most Insider Selling',
    description:
      'US stocks ranked by open-market insider selling over the last 90 days — real SEC Form 4 sales at actual transaction prices, aggregated daily.',
    keywords: ['insider selling stocks', 'most insider selling', 'insider sales', 'stocks insiders are selling', 'form 4 insider selling'],
    metricLabel: 'Insider selling (90D)',
    source: 'insiderAggregate',
    field: 'sellValue90d',
    order: 'desc',
    minValue: 0,
    format: (v) => formatCurrencyCompact(v),
    intro: [
      'These companies saw the largest open-market insider sales over the last 90 days (SEC Form 4 code S), valued at each transaction\'s reported price. We exclude tax withholdings and option-exercise-and-sell combinations, which are mechanical rather than discretionary.',
      'Context matters: insiders routinely sell for diversification and pre-arranged 10b5-1 plans. Heavy, clustered selling by multiple insiders is more informative than one large sale — check the insider cluster column in the screener for that signal.',
    ],
    faq: [
      { q: 'Is insider selling a bad sign?', a: 'Not automatically. Executives hold concentrated positions and sell for diversification, taxes or pre-scheduled 10b5-1 plans. Sustained selling by multiple insiders in a short window is a stronger warning than a single sale.' },
      { q: 'What sales are excluded?', a: 'Tax-withholding disposals (code F), option exercises (M) and gifts (G) are excluded — they are not discretionary open-market decisions.' },
      { q: 'How is the dollar amount computed?', a: 'Shares sold multiplied by the actual execution price reported in each Form 4 filing — not the current market price.' },
    ],
  },
];

const LEADERBOARD_MAP = new Map(LEADERBOARDS.map((l) => [l.slug, l]));

export function getLeaderboard(slug: string): LeaderboardDef | undefined {
  return LEADERBOARD_MAP.get(slug);
}

export interface LeaderboardRow {
  rank: number;
  symbol: string;
  name: string;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  marketCapB: number | null;
  metricValue: number | null;
}

/**
 * Fetch the top `limit` tickers for a leaderboard — sorted by the metric on
 * its source relation (nulls last), only priced tickers.
 */
export async function getLeaderboardRows(def: LeaderboardDef, limit = 50): Promise<LeaderboardRow[]> {
  const metricWhere: Record<string, unknown> = {
    ...(def.minValue != null
      ? { [def.field]: { gt: def.minValue } }
      : { [def.field]: { not: null } }),
    ...(def.extraWhere ?? {}),
  };

  // Dynamic keys make Prisma's return type unusable — keep it untyped and
  // map explicitly below.
  const tickers: any[] = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      [def.source]: { is: metricWhere },
    },
    select: {
      symbol: true,
      name: true,
      sector: true,
      lastPrice: true,
      lastChangePct: true,
      lastMarketCap: true,
      [def.source]: { select: { [def.field]: true } },
    },
    orderBy: {
      [def.source]: { [def.field]: { sort: def.order, nulls: 'last' } },
    },
    take: limit,
  } as any);

  return tickers.map((t, i) => {
    const rel = t[def.source] as Record<string, number | null> | null;
    return {
      rank: i + 1,
      symbol: t.symbol as string,
      name: (t.name as string | null) || (t.symbol as string),
      sector: t.sector as string | null,
      price: t.lastPrice as number | null,
      changePct: t.lastChangePct as number | null,
      marketCapB: t.lastMarketCap as number | null,
      metricValue: rel?.[def.field] ?? null,
    };
  });
}

// ─── Early Winners (EwScoreSnapshot source) ─────────────────────────────────

export interface EwLeaderboardRow {
  rank: number;
  symbol: string;
  name: string;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  marketCapB: number | null;
  totalScore: number;
  maxPossible: number;
  fundamentalsScore: number | null;
  momentumScore: number | null;
  qualityScore: number | null;
  earningsBlocked: boolean;
  asOfDate: Date;
}

/**
 * Top Early Winners rows from the latest imported EwScoreSnapshot batch.
 * Live-ticker filter: only symbols present in Ticker with a valid price —
 * delisted securities from the frozen research universe are never shown.
 * Returns [] when no snapshot batch has been imported yet.
 */
export async function getEwLeaderboardRows(limit = 50): Promise<EwLeaderboardRow[]> {
  const latest = await prisma.ewScoreSnapshot.aggregate({
    _max: { asOfDate: true },
  });
  const asOfDate = latest._max.asOfDate;
  if (!asOfDate) return [];

  const snaps = await prisma.ewScoreSnapshot.findMany({
    where: {
      asOfDate,
      ticker: { lastPrice: { gt: 0 } },
    },
    orderBy: [{ totalScore: 'desc' }, { symbol: 'asc' }],
    take: limit,
    include: {
      ticker: {
        select: {
          name: true,
          sector: true,
          lastPrice: true,
          lastChangePct: true,
          lastMarketCap: true,
        },
      },
    },
  });

  return snaps.map((s, i) => ({
    rank: i + 1,
    symbol: s.symbol,
    name: s.ticker.name || s.symbol,
    sector: s.ticker.sector,
    price: s.ticker.lastPrice,
    changePct: s.ticker.lastChangePct,
    marketCapB: s.ticker.lastMarketCap,
    totalScore: s.totalScore,
    maxPossible: s.maxPossible,
    fundamentalsScore: s.fundamentalsScore,
    momentumScore: s.momentumScore,
    qualityScore: s.qualityScore,
    earningsBlocked: s.earningsBlocked,
    asOfDate: s.asOfDate,
  }));
}

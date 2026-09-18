/**
 * Leaderboard definitions for programmatic SEO pages at /screener/[slug].
 * Each leaderboard is a server-rendered "top N stocks by metric X" page.
 * Data comes from AnalysisCache (our computed scores) or FinnhubMetrics
 * (Finnhub fundamentals) — both refreshed daily by the worker.
 */

import { prisma } from '@/lib/db/prisma';

export type MetricSource = 'analysisCache' | 'finnhubMetrics' | 'ewScore';

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
  const metricWhere: Record<string, unknown> = def.minValue != null
    ? { [def.field]: { gt: def.minValue } }
    : { [def.field]: { not: null } };

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

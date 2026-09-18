import type { HeatmapMetric } from './types';

/**
 * Per-metric SEO landing page definitions for /heatmap/[metric] routes.
 *
 * Each entry must carry genuinely unique copy — a renamed duplicate of
 * /heatmap would be ignored as thin content. Titles target the actual
 * query classes ("low pe stocks", "relative volume screener", ...).
 */
export type MetricPageDef = {
  slug: string;
  metric: HeatmapMetric;
  titleTag: string;
  description: string;
  h1: string;
  intro: string;
  colorNote: string;
  keywords: string[];
  faq: { q: string; a: string }[];
};

export const METRIC_PAGES: MetricPageDef[] = [
  {
    slug: 'pe-ratio',
    metric: 'pe',
    titleTag: 'P/E Ratio Heatmap — US Stocks by Valuation',
    description:
      'Live P/E ratio heatmap of 700+ US stocks grouped by sector. Spot the cheapest and most expensive companies at a glance — tile size is market cap, color is trailing P/E.',
    h1: 'P/E Ratio Heatmap',
    intro:
      'The price-to-earnings (P/E) ratio divides a company\'s share price by its trailing twelve-month earnings per share — the market\'s price tag for each dollar of profit. On this heatmap, every tile is a US-listed company sized by market cap and colored by its P/E ratio, so whole sectors can be compared for expensiveness in a single view.',
    colorNote:
      'Greener tiles have lower (cheaper) P/E ratios, redder tiles have higher (more expensive) ratios, and gray tiles are loss-makers with no meaningful P/E.',
    keywords: ['pe ratio heatmap', 'low pe stocks', 'pe ratio screener', 'cheap stocks', 'undervalued stocks', 'stock valuation'],
    faq: [
      {
        q: 'What is a good P/E ratio for a stock?',
        a: 'There is no universal "good" P/E — the US market average is roughly 20–25. Value investors often screen for P/E below 15, while high-growth sectors like software regularly trade above 30. The heatmap makes sector-relative comparison easy: a P/E of 20 is cheap for tech but expensive for utilities.',
      },
      {
        q: 'Why are some P/E tiles gray?',
        a: 'Gray tiles are companies with negative or near-zero earnings — a P/E cannot be computed when EPS is negative. These firms may still be expensive or cheap on other metrics like P/S or EV/EBITDA.',
      },
      {
        q: 'Is a low P/E ratio always a bargain?',
        a: 'No — a low P/E can signal a value trap: earnings collapsing, cyclical peaks, or structural decline. Combine the P/E heatmap with the Piotroski F-score or Altman Z-score views to filter cheap companies that are also financially healthy.',
      },
    ],
  },
  {
    slug: 'forward-pe',
    metric: 'fpe',
    titleTag: 'Forward P/E Heatmap — Stocks by Expected Earnings',
    description:
      'Forward P/E heatmap of US stocks using next-twelve-month earnings estimates. Compare expected valuation across sectors — green tiles are cheap on forward earnings, red tiles expensive.',
    h1: 'Forward P/E Heatmap',
    intro:
      'The forward P/E ratio uses analyst consensus earnings estimates for the next twelve months instead of trailing results, showing what the market pays for expected — not delivered — profit. This heatmap colors every US stock by forward P/E, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles are cheaper on expected earnings, redder tiles are more expensive. Companies with no analyst coverage or negative estimates appear gray.',
    keywords: ['forward pe', 'forward pe stocks', 'expected earnings valuation', 'analyst estimates stocks', 'forward earnings screener'],
    faq: [
      {
        q: 'What is the difference between P/E and forward P/E?',
        a: 'P/E divides price by reported trailing earnings; forward P/E divides by analyst-estimated future earnings. When forward P/E is far below trailing P/E, the market expects rapid earnings growth — when above, it expects a decline.',
      },
      {
        q: 'Are forward P/E estimates reliable?',
        a: 'They are consensus guesses, not facts — estimates cluster near current prices and are regularly revised. Treat them as the market\'s expected trajectory rather than a forecast.',
      },
      {
        q: 'Why do some stocks have a low forward P/E but high trailing P/E?',
        a: 'Analysts expect earnings to jump — common in cyclical recoveries and growth stocks. The gap between the two ratios is itself a signal: large gaps mean high expectations that can disappoint.',
      },
    ],
  },
  {
    slug: 'price-to-sales',
    metric: 'ps',
    titleTag: 'P/S Ratio Heatmap — Stocks by Price-to-Sales',
    description:
      'Price-to-sales heatmap of US stocks. P/S works even for loss-making companies — green tiles trade cheap relative to revenue, red tiles expensive. Sized by market cap, grouped by sector.',
    h1: 'Price-to-Sales (P/S) Heatmap',
    intro:
      'The price-to-sales ratio compares market value to trailing revenue — useful precisely where P/E fails, because every company has sales even when it has no profit. This heatmap colors US stocks by P/S, sized by market cap and grouped by sector, revealing which parts of the market pay most for each revenue dollar.',
    colorNote:
      'Greener tiles trade at lower price-to-sales multiples, redder tiles at higher ones. Software routinely shows double-digit P/S while retailers sit below 1.',
    keywords: ['price to sales', 'ps ratio stocks', 'ps ratio screener', 'revenue valuation', 'cheap sales stocks'],
    faq: [
      {
        q: 'When is P/S more useful than P/E?',
        a: 'For unprofitable companies — early-stage tech, biotech, turnaround stories — where P/E is undefined. P/S also resists accounting manipulation better than earnings-based ratios because revenue is harder to massage than profit.',
      },
      {
        q: 'What P/S ratio is considered cheap?',
        a: 'Below ~1 is traditionally cheap for mature businesses; software companies commonly trade at 5–15× sales. Always compare within a sector — the heatmap groups tiles by sector precisely for that.',
      },
      {
        q: 'Can a low P/S stock still be a bad buy?',
        a: 'Yes — low P/S with negative margins means the company sells a lot but keeps nothing. Pair P/S with the net-margin or FCF-margin heatmap to check whether revenue actually converts to profit.',
      },
    ],
  },
  {
    slug: 'price-to-book',
    metric: 'pb',
    titleTag: 'P/B Ratio Heatmap — Stocks by Price-to-Book',
    description:
      'Price-to-book heatmap of US stocks. Green tiles trade below or near book value — classic value territory for banks, insurers and industrials. Sized by market cap, grouped by sector.',
    h1: 'Price-to-Book (P/B) Heatmap',
    intro:
      'The price-to-book ratio compares market value to accounting book value (assets minus liabilities). It is the classic value-investing yardstick — most informative for asset-heavy sectors like banks, insurers, and industrials, and less meaningful for intangible-driven businesses like software.',
    colorNote:
      'Greener tiles trade closer to or below book value, redder tiles at larger premiums. Negative or meaningless book values appear gray.',
    keywords: ['price to book', 'pb ratio stocks', 'book value screener', 'value stocks', 'stocks below book value'],
    faq: [
      {
        q: 'What does a P/B below 1 mean?',
        a: 'The market values the company below its accounting net assets — potentially a bargain, or a warning that those assets (loans, inventory, goodwill) are worth less than the balance sheet claims.',
      },
      {
        q: 'Why is P/B popular for bank stocks?',
        a: 'Banks\' balance sheets mark most assets near market value, so book value is meaningful. A bank at 0.8× book is cheap if its loan book is sound — the same ratio is nearly useless for an asset-light software firm.',
      },
      {
        q: 'Can P/B be misleading?',
        a: 'Yes — buybacks can shrink or negate book value, and intangibles (brands, IP) never appear on the balance sheet. Cross-check with ROE: high-ROE companies deserve premium P/B.',
      },
    ],
  },
  {
    slug: 'peg-ratio',
    metric: 'peg',
    titleTag: 'PEG Ratio Heatmap — Growth-Adjusted Valuation',
    description:
      'PEG ratio heatmap of US stocks — P/E adjusted for earnings growth. Green tiles look cheap relative to their growth rate. Sized by market cap, grouped by sector.',
    h1: 'PEG Ratio Heatmap',
    intro:
      'The PEG ratio divides the P/E ratio by expected earnings growth — answering "is this P/E justified by the growth?". A PEG around 1 means price roughly matches growth; below 1 suggests growth is underpriced. This heatmap colors US stocks by PEG, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles have lower PEG (growth cheaper), redder tiles higher PEG. Companies without reliable growth estimates appear gray.',
    keywords: ['peg ratio', 'peg ratio stocks', 'growth at reasonable price', 'garp stocks', 'growth adjusted valuation'],
    faq: [
      {
        q: 'What is a good PEG ratio?',
        a: 'Peter Lynch\'s rule of thumb: PEG near 1 is fairly valued, below 1 is attractive, above 2 is expensive. The rule assumes stable growth — very high growth rates compress PEG artificially.',
      },
      {
        q: 'How is PEG calculated here?',
        a: 'Trailing P/E divided by the expected earnings growth rate. Because both inputs are estimates of a moving target, treat PEG as a screening filter, not a verdict.',
      },
      {
        q: 'Why do some cheap P/E stocks have expensive PEG?',
        a: 'Low growth or declining earnings — a P/E of 10 with 3% growth gives a PEG above 3. PEG penalizes slow growers even when they look optically cheap on P/E.',
      },
    ],
  },
  {
    slug: 'ev-ebitda',
    metric: 'evebitda',
    titleTag: 'EV/EBITDA Heatmap — Stocks by Enterprise Value',
    description:
      'EV/EBITDA heatmap of US stocks — valuation including debt. Green tiles are cheap on an enterprise-value basis. Sized by market cap, grouped by sector.',
    h1: 'EV/EBITDA Heatmap',
    intro:
      'EV/EBITDA compares enterprise value (market cap plus net debt) to operating earnings before interest, tax, depreciation and amortization. Unlike P/E it ignores capital structure — essential for comparing leveraged companies. This heatmap colors US stocks by EV/EBITDA, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles are cheaper on EV/EBITDA, redder tiles more expensive. Negative-EBITDA companies appear gray.',
    keywords: ['ev ebitda', 'ev/ebitda stocks', 'enterprise value screener', 'ebitda multiple', 'takeover valuation'],
    faq: [
      {
        q: 'Why use EV/EBITDA instead of P/E?',
        a: 'It includes debt in the price and strips out financing and accounting differences in earnings — the standard metric for comparing companies with different leverage, and the first number acquirers check.',
      },
      {
        q: 'What EV/EBITDA multiple is cheap?',
        a: 'Below ~8 is traditionally cheap for industrials and mature businesses; high-growth sectors justify 15–25+. Compare within the sector column — telecom at 6× is normal, software at 6× is a screaming deal.',
      },
      {
        q: 'What are EV/EBITDA\'s weaknesses?',
        a: 'EBITDA ignores capital expenditure — capital-intensive firms look artificially cheap. Utilities and telecom are the classic trap: fine EV/EBITDA, brutal ongoing capex.',
      },
    ],
  },
  {
    slug: 'dividend-yield',
    metric: 'divyield',
    titleTag: 'Dividend Yield Heatmap — High-Yield US Stocks',
    description:
      'Live dividend yield heatmap of US stocks. Green tiles pay the highest yields — spot income opportunities across sectors. Sized by market cap.',
    h1: 'Dividend Yield Heatmap',
    intro:
      'Dividend yield is the annualized payout divided by share price — the cash return a stock pays just for holding it. This heatmap colors US stocks by trailing dividend yield, sized by market cap and grouped by sector, so high-yield clusters (utilities, REITs, energy) stand out instantly.',
    colorNote:
      'Greener tiles pay higher yields, redder tiles pay little or nothing — including most high-growth tech names that reinvest instead of paying out.',
    keywords: ['dividend yield', 'high dividend stocks', 'dividend yield screener', 'income stocks', 'best dividend stocks'],
    faq: [
      {
        q: 'What is a good dividend yield?',
        a: 'The broad US market yields roughly 1.5–2%. Above 3–4% is high; above ~8% is usually a warning that the market expects a cut rather than a gift. Check the payout against FCF — the FCF-margin heatmap shows who can actually afford the dividend.',
      },
      {
        q: 'Why are the highest yields sometimes dangerous?',
        a: 'Yield = dividend / price — a collapsing price inflates the ratio before the board cuts the payout. Exceptionally green tiles deserve scrutiny, not automatic buying.',
      },
      {
        q: 'Do all large companies pay dividends?',
        a: 'No — many profitable companies (Berkshire, most of big tech historically) prefer buybacks or reinvestment. Red and gray tiles are not necessarily weak businesses.',
      },
    ],
  },
  {
    slug: 'roe',
    metric: 'roe',
    titleTag: 'ROE Heatmap — Stocks by Return on Equity',
    description:
      'Return on equity heatmap of US stocks. Green tiles generate the most profit per dollar of shareholder equity — Buffett\'s favorite quality metric. Sized by market cap, grouped by sector.',
    h1: 'ROE Heatmap — Return on Equity',
    intro:
      'Return on equity measures net income as a percentage of shareholder equity — how effectively management turns owner capital into profit. Sustained high ROE is the hallmark of a compounding business. This heatmap colors US stocks by trailing ROE, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles earn more per equity dollar, redder tiles less — negative-ROE loss-makers sit at the red end.',
    keywords: ['roe stocks', 'high roe stocks', 'return on equity screener', 'quality stocks', 'buffett metric'],
    faq: [
      {
        q: 'What is a good ROE?',
        a: 'Above ~15% is solid, above 20% is excellent, sustained 30%+ is elite territory. Banks and utilities naturally run lower ROE than software or consumer brands — compare within sectors.',
      },
      {
        q: 'Can ROE be too high?',
        a: 'Yes — high leverage inflates ROE mechanically. A company earning 40% ROE on a debt-heavy balance sheet is riskier than the number suggests; check the Altman Z-score view for solvency.',
      },
      {
        q: 'Why do buybacks raise ROE?',
        a: 'Repurchased shares shrink the equity denominator, so the same profit produces a higher ratio. Rising ROE from buybacks is quality-neutral — rising ROE from profit growth is not.',
      },
    ],
  },
  {
    slug: 'net-margin',
    metric: 'netmargin',
    titleTag: 'Net Margin Heatmap — Most Profitable Stocks',
    description:
      'Net profit margin heatmap of US stocks. Green tiles keep the most profit from each revenue dollar. Sized by market cap, grouped by sector.',
    h1: 'Net Margin Heatmap',
    intro:
      'Net margin is net income divided by revenue — the share of each sales dollar that survives as profit after every cost, interest payment and tax. This heatmap colors US stocks by trailing net margin, sized by market cap and grouped by sector, exposing which industries run wide moats and which fight on razor-thin margins.',
    colorNote:
      'Greener tiles keep more profit per revenue dollar, redder tiles less — loss-makers are deep red.',
    keywords: ['net margin', 'profit margin stocks', 'most profitable stocks', 'margin screener', 'high margin companies'],
    faq: [
      {
        q: 'What is a good net margin?',
        a: 'Highly sector-dependent: software and semiconductors run 20–30%+, retailers survive on 2–5%. There is no cross-sector "good" — only "good for the industry", which is why the map is sector-grouped.',
      },
      {
        q: 'Is a high net margin always good?',
        a: 'Mostly, but one-off items (asset sales, tax credits) can inflate a single period. Watch for durable margins — a company at 25% for years has a moat; at 25% once had a windfall.',
      },
      {
        q: 'Margin or growth — which matters more?',
        a: 'Depends on the thesis: high-margin compounders suit quality portfolios, low-margin high-growth names suit momentum. Toggle to the revenue-growth view to see the same map colored by the opposite trait.',
      },
    ],
  },
  {
    slug: 'revenue-growth',
    metric: 'revgrowth',
    titleTag: 'Revenue Growth Heatmap — Fastest Growing Stocks',
    description:
      'Revenue growth heatmap of US stocks. Green tiles grow sales fastest — spot expanding businesses across sectors. Sized by market cap.',
    h1: 'Revenue Growth Heatmap',
    intro:
      'Revenue growth is the top-line expansion rate — before margins, multiples or narratives, it answers "is this business selling more?". This heatmap colors US stocks by revenue growth, sized by market cap and grouped by sector, making genuine growers visible at a glance versus stagnant or shrinking businesses.',
    colorNote:
      'Greener tiles grow revenue faster, redder tiles shrink. Growth through acquisition shows the same color as organic growth — check the filings for the difference.',
    keywords: ['revenue growth stocks', 'fastest growing stocks', 'sales growth screener', 'growth stocks', 'top line growth'],
    faq: [
      {
        q: 'What revenue growth rate is considered strong?',
        a: 'Above ~10% annually is healthy for a large company; above 20% is rapid growth territory. Mature mega-caps growing 15%+ are rare — and priced accordingly.',
      },
      {
        q: 'Why focus on revenue rather than earnings growth?',
        a: 'Revenue is harder to engineer than earnings — buybacks, cost cuts and one-offs can lift EPS without the business actually growing. Top-line growth is the cleaner demand signal.',
      },
      {
        q: 'Can a company grow revenue but destroy value?',
        a: 'Easily — growth bought with discounts or dilutive acquisitions can shrink margins and per-share value. Pair this view with net-margin or FCF-margin to check the quality of the growth.',
      },
    ],
  },
  {
    slug: 'eps-growth',
    metric: 'epsgrowth',
    titleTag: 'EPS Growth Heatmap — Stocks by Earnings Growth',
    description:
      'EPS growth heatmap of US stocks. Green tiles grow earnings per share fastest — the metric most directly linked to long-term stock returns. Sized by market cap, grouped by sector.',
    h1: 'EPS Growth Heatmap',
    intro:
      'Earnings-per-share growth measures how quickly profit attributable to each share is expanding — the single metric most correlated with long-run share prices. This heatmap colors US stocks by EPS growth, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles grow EPS faster, redder tiles see earnings shrink — including companies swinging into losses.',
    keywords: ['eps growth stocks', 'earnings growth', 'growing earnings stocks', 'eps screener', 'profit growth'],
    faq: [
      {
        q: 'What is a strong EPS growth rate?',
        a: 'Sustained 15%+ annual EPS growth is what classic growth investors (the CAN SLIM school) screen for. One-off spikes from a depressed base look identical on the map — check the trend, not a single period.',
      },
      {
        q: 'How does EPS growth differ from revenue growth?',
        a: 'EPS adds the profitability layer — a company can grow revenue 20% while EPS falls if margins collapse. Conversely, buybacks can grow EPS faster than the business itself grows.',
      },
      {
        q: 'Why does high EPS growth sometimes produce red stocks?',
        a: 'When growth is already priced in — the PEG heatmap shows exactly this tension between growth rate and the multiple paid for it.',
      },
    ],
  },
  {
    slug: 'fcf-margin',
    metric: 'fcfmargin',
    titleTag: 'FCF Margin Heatmap — Free Cash Flow Stocks',
    description:
      'Free cash flow margin heatmap of US stocks. Green tiles convert the most revenue into real cash — the cleanest profitability signal. Sized by market cap, grouped by sector.',
    h1: 'Free Cash Flow Margin Heatmap',
    intro:
      'Free cash flow margin shows what share of revenue becomes actual cash after capital expenditures — earnings you can count, not accounting estimates. FCF funds dividends, buybacks and debt repayment. This heatmap colors US stocks by FCF margin, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles convert more revenue into free cash, redder tiles less — cash-burners sit deep red.',
    keywords: ['fcf margin', 'free cash flow stocks', 'fcf yield screener', 'cash generating stocks', 'quality cash flow'],
    faq: [
      {
        q: 'Why is FCF margin better than net margin?',
        a: 'Net income is an opinion (accruals, depreciation schedules, one-offs); free cash flow is a fact. Companies can report profits while bleeding cash — the FCF view exposes them.',
      },
      {
        q: 'What is a good FCF margin?',
        a: 'Above ~10% is healthy; elite compounders (software, payments) exceed 25–30%. Capital-intensive industries (airlines, telecom) structurally run near zero — compare within sectors.',
      },
      {
        q: 'Can high FCF coexist with low earnings?',
        a: 'Yes — companies with big non-cash charges (heavy depreciation, stock comp, impairments) can look worse on EPS than on FCF. Value hunters specifically screen for this gap.',
      },
    ],
  },
  {
    slug: 'relative-volume',
    metric: 'rvol',
    titleTag: 'Relative Volume (RVOL) Heatmap — Unusual Activity',
    description:
      'Relative volume heatmap of US stocks — shares traded vs. their normal pace. Green tiles trade at unusual volume: where the action is right now. Sized by market cap, grouped by sector.',
    h1: 'Relative Volume (RVOL) Heatmap',
    intro:
      'Relative volume compares today\'s trading volume to the stock\'s own average — RVOL of 2 means twice the normal pace, usually with news, earnings or a catalyst behind it. Day traders live on this metric: unusual volume marks where attention and liquidity actually are. This heatmap colors US stocks by RVOL, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles trade far above their normal volume, redder tiles below it — green marks catalysts, red marks quiet drift.',
    keywords: ['relative volume', 'rvol screener', 'unusual volume stocks', 'high volume stocks', 'day trading screener', 'volume movers'],
    faq: [
      {
        q: 'What RVOL is considered unusual?',
        a: 'Day traders typically watch RVOL above 1.5–2 — the stock is doing multiples of its normal business. Above 3 usually means a real catalyst: earnings, guidance, an FDA decision or a short squeeze.',
      },
      {
        q: 'Does high RVOL mean the stock will keep moving?',
        a: 'Not necessarily — volume confirms attention, not direction. RVOL combined with the day-change view shows whether the unusual flow is buying or selling.',
      },
      {
        q: 'Why do traders care about RVOL more than raw volume?',
        a: 'A mega-cap doing 50M shares can be a normal Tuesday; a small-cap doing 2M can be 10× its average. RVOL normalizes each stock against itself, surfacing the genuinely abnormal.',
      },
    ],
  },
  {
    slug: 'beta',
    metric: 'beta',
    titleTag: 'Beta Heatmap — Volatility Map of US Stocks',
    description:
      'Beta heatmap of US stocks — volatility vs. the market. Green tiles are defensive low-beta names, red tiles high-beta movers. Sized by market cap, grouped by sector.',
    h1: 'Beta Heatmap',
    intro:
      'Beta measures how violently a stock moves relative to the market: 1.0 moves with the index, 1.5 amplifies it by half, 0.5 damps it. This heatmap colors US stocks by beta, sized by market cap and grouped by sector — an instant map of where the market\'s calm and its storms live.',
    colorNote:
      'Greener tiles are low-beta defensive names, redder tiles are high-beta amplifiers — utilities and staples green, small tech and cyclicals red.',
    keywords: ['beta stocks', 'high beta stocks', 'low beta stocks', 'volatility screener', 'defensive stocks', 'stock volatility'],
    faq: [
      {
        q: 'What beta value means a stock is defensive?',
        a: 'Below ~0.8 — utilities, consumer staples and healthcare typically live there. In drawdowns they fall less; in rallies they lag. High-beta names above ~1.3 do the opposite.',
      },
      {
        q: 'Is low beta always safer?',
        a: 'Safer against market swings, not against business risk — a low-beta utility can still blow up on its own news. Beta measures market correlation, not company quality.',
      },
      {
        q: 'Why build a portfolio view around beta?',
        a: 'Because it predicts behavior in stress: a book of high-beta names will drop harder in selloffs and bounce harder in recoveries. The map makes a portfolio\'s aggregate sensitivity visible.',
      },
    ],
  },
  {
    slug: 'piotroski-score',
    metric: 'piotroski',
    titleTag: 'Piotroski F-Score Heatmap — Quality Value Stocks',
    description:
      'Piotroski F-score heatmap of US stocks — the 9-point financial strength test. Green tiles pass the most checks. Sized by market cap, grouped by sector.',
    h1: 'Piotroski F-Score Heatmap',
    intro:
      'The Piotroski F-score runs nine accounting tests on profitability, leverage, liquidity and operating efficiency — designed to separate cheap-but-strong value stocks from cheap-but-dying ones. Scores run 0–9; 7+ indicates improving fundamentals. This heatmap colors US stocks by F-score, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles pass more Piotroski checks, redder tiles fail more — the classic value-trap filter made visual.',
    keywords: ['piotroski f score', 'f score stocks', 'piotroski screener', 'value trap filter', 'financial strength stocks'],
    faq: [
      {
        q: 'What is a good Piotroski F-score?',
        a: '7–9 is strong (most checks passed), 4–6 middling, 0–3 weak — Piotroski\'s original research showed low-score "cheap" stocks dramatically underperform high-score ones.',
      },
      {
        q: 'What does the F-score actually test?',
        a: 'Nine binary signals: positive income, cash flow, rising ROA, earnings quality, falling leverage, rising liquidity, no dilution, rising gross margin, rising asset turnover.',
      },
      {
        q: 'How is F-score best used?',
        a: 'As the second filter after a valuation screen — find cheap tiles on the P/E or P/B map, then verify they are green on F-score. Cheap + strong is the strategy; cheap + weak is the trap.',
      },
    ],
  },
  {
    slug: 'altman-z-score',
    metric: 'altman',
    titleTag: 'Altman Z-Score Heatmap — Bankruptcy Risk Map',
    description:
      'Altman Z-score heatmap of US stocks — the classic bankruptcy-prediction model. Green tiles are financially safe, red tiles are in the distress zone. Sized by market cap, grouped by sector.',
    h1: 'Altman Z-Score Heatmap',
    intro:
      'The Altman Z-score blends five balance-sheet and profitability ratios into a single bankruptcy-risk number: above ~3 is safe, 1.8–3 is the gray zone, below ~1.8 flags distress risk. This heatmap colors US stocks by Z-score, sized by market cap and grouped by sector — a solvency map of the whole market.',
    colorNote:
      'Greener tiles are safer on the Z-score model, redder tiles are closer to distress. Financial-sector names score differently by design — read them with sector context.',
    keywords: ['altman z score', 'z score stocks', 'bankruptcy risk stocks', 'distress score', 'solvency screener'],
    faq: [
      {
        q: 'What is the Altman Z-score danger zone?',
        a: 'Below 1.8 is the distress zone in the original model, 1.8–3.0 is gray, above 3.0 is safe. The model was built for manufacturers — financials and utilities need different interpretation.',
      },
      {
        q: 'Can a Z-score predict bankruptcy?',
        a: 'It flagged ~70–80% of failures in backtests a year or two early, with meaningful false positives. Treat it as an early-warning screen, not a verdict.',
      },
      {
        q: 'Why do some great companies have low Z-scores?',
        a: 'The model penalizes high working-capital deficits and leverage — capital-light or buyback-heavy firms can score poorly while being perfectly solvent. Combine with FCF-margin for the fuller picture.',
      },
    ],
  },
  {
    slug: 'beneish-m-score',
    metric: 'beneish',
    titleTag: 'Beneish M-Score Heatmap — Earnings Manipulation Risk',
    description:
      'Beneish M-score heatmap of US stocks — the statistical earnings-manipulation detector. Greener tiles look cleaner, redder tiles show manipulation-risk patterns. Sized by market cap, grouped by sector.',
    h1: 'Beneish M-Score Heatmap',
    intro:
      'The Beneish M-score runs eight forensic ratios on a company\'s filings — receivables vs. sales, margin drift, accruals, asset quality — to estimate the probability that reported earnings are being dressed up. Below ~−1.8 is the clean zone; above it, manipulation risk rises. This heatmap colors US stocks by M-score, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles score cleaner (lower M-score = fewer red flags), redder tiles show more manipulation-risk patterns — a forensic audit of the market in one view.',
    keywords: ['beneish m score', 'earnings manipulation', 'accounting red flags', 'fraud detection stocks', 'forensic accounting'],
    faq: [
      {
        q: 'What M-score signals manipulation risk?',
        a: 'The original model uses roughly −1.8 as the cutoff — scores above it carry elevated manipulation probability. It catches statistical patterns, not proof: a red tile is a reason to read the 10-K, not an accusation.',
      },
      {
        q: 'What red flags does the model look for?',
        a: 'Receivables growing faster than sales, falling gross margins, rising accruals, deteriorating asset quality and soft-asset growth — the classic tell-tales of aggressive revenue recognition and capitalization games.',
      },
      {
        q: 'Can an honest company score badly?',
        a: 'Yes — fast growers and acquisition-heavy firms naturally trip the ratios. High M-score says "verify", not "guilty".',
      },
    ],
  },
  {
    slug: 'weekly-performance',
    metric: 'week',
    titleTag: 'Weekly Performance Heatmap — Best Stocks This Week',
    description:
      '1-week performance heatmap of US stocks — who won and lost this trading week. Green tiles lead the week, red tiles lag. Sized by market cap, grouped by sector.',
    h1: 'Weekly Performance Heatmap',
    intro:
      'One-week performance compares today\'s price to the close five trading sessions ago — the short-term momentum window where earnings reactions, sector rotations and macro moves play out. This heatmap colors US stocks by 1-week return, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles are this week\'s winners, redder tiles its losers — sector-level rotations become visible instantly.',
    keywords: ['weekly stock performance', 'best stocks this week', 'weekly gainers', 'weekly losers', 'short term momentum'],
    faq: [
      {
        q: 'What does the 1-week view capture that daily misses?',
        a: 'Sustained moves — a +3% day is noise, but a week of consecutive gains signals real demand or news flow. Weekly also smooths single-day overreactions.',
      },
      {
        q: 'How do traders use weekly momentum?',
        a: 'Both ways: momentum followers buy the green expecting continuation, mean-reversion traders hunt the red expecting snap-back. The map shows where each crowd will look.',
      },
      {
        q: 'Why do whole sectors go red together?',
        a: 'Macro rotation — rates, oil, risk appetite move sectors as a block. Sector-wide red with one green tile usually marks company-specific strength worth investigating.',
      },
    ],
  },
  {
    slug: 'monthly-performance',
    metric: 'month',
    titleTag: 'Monthly Performance Heatmap — 1-Month Stock Returns',
    description:
      '1-month performance heatmap of US stocks — the medium-term momentum window. Green tiles lead the month, red tiles lag. Sized by market cap, grouped by sector.',
    h1: 'Monthly Performance Heatmap',
    intro:
      'One-month performance tracks the medium-term trend — long enough to filter daily noise, short enough to catch active rotations. This heatmap colors US stocks by ~1-month return, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles lead the month, redder tiles lag — persistent sector trends stand out as color blocks.',
    keywords: ['monthly stock performance', 'best stocks this month', 'monthly gainers', '1 month returns', 'stock momentum'],
    faq: [
      {
        q: 'Why is the 1-month timeframe popular?',
        a: 'Academic momentum research centers on 1–12 month windows — a month is the shortest period where trends are statistically meaningful rather than noise.',
      },
      {
        q: 'What does a divergent tile inside a red sector mean?',
        a: 'Company-specific strength — something (earnings beat, contract win, upgrade) is fighting the sector tide. Divergence in either direction is usually the interesting tile.',
      },
      {
        q: 'Does monthly performance predict future returns?',
        a: 'Weakly — intermediate momentum has a documented edge, but it reverses at turning points and gets crowded. Use it as context, not a signal.',
      },
    ],
  },
  {
    slug: 'ytd',
    metric: 'ytd',
    titleTag: 'YTD Performance Heatmap — Best Stocks of the Year',
    description:
      'Year-to-date performance heatmap of US stocks — 2026 winners and losers at a glance. Green tiles lead the year, red tiles trail. Sized by market cap, grouped by sector.',
    h1: 'YTD Performance Heatmap',
    intro:
      'Year-to-date performance measures return since the first trading day of the year — the scoreboard every fund manager reports against. This heatmap colors US stocks by YTD return, sized by market cap and grouped by sector, so the year\'s real leadership (and its disasters) are visible in one frame.',
    colorNote:
      'Greener tiles are the year\'s winners, redder tiles its losers — the annual leaderboard rendered as a map.',
    keywords: ['ytd performance', 'best stocks ytd', 'year to date gainers', 'top stocks 2026', 'stock performance this year'],
    faq: [
      {
        q: 'Why does YTD performance matter?',
        a: 'It is the universal comparison frame — funds, media and indices all report YTD. Knowing who leads the year explains what the market is currently rewarding.',
      },
      {
        q: 'Do YTD winners keep winning?',
        a: 'Sometimes — momentum is real but mean-reversion is too, especially into year-end when funds rebalance and tax-loss sell the losers.',
      },
      {
        q: 'How should YTD losers be read?',
        a: 'As a filter, not a verdict — some are broken businesses, some are quality names on sale. The Piotroski or FCF-margin views separate the two.',
      },
    ],
  },
  {
    slug: 'one-year-performance',
    metric: 'year',
    titleTag: '1-Year Performance Heatmap — Annual Stock Returns',
    description:
      '1-year performance heatmap of US stocks — the trailing annual leaderboard. Green tiles lead the year, red tiles trail. Sized by market cap, grouped by sector.',
    h1: '1-Year Performance Heatmap',
    intro:
      'One-year performance is the trailing annual return — long enough to reveal durable trends, short enough to stay relevant. This heatmap colors US stocks by 1-year return, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles beat the market over the trailing year, redder tiles trail it.',
    keywords: ['1 year stock performance', 'annual stock returns', 'best stocks past year', 'yearly gainers', 'long term momentum'],
    faq: [
      {
        q: 'How does the 1-year view differ from YTD?',
        a: 'YTD anchors to January 1st; the 1-year view is a rolling twelve months. Mid-year they can disagree sharply — a stock that crashed in December can be YTD-green but 1-year-red.',
      },
      {
        q: 'Is 1-year momentum a buy signal?',
        a: 'Historically the strongest documented factor — but it reverses violently at crashes. It describes where money has been, not where it must go.',
      },
      {
        q: 'Why check the annual view at all?',
        a: 'It answers "who has actually been compounding" — the multi-year winners tend to stay green here long before they make headlines.',
      },
    ],
  },
  {
    slug: 'market-cap-change',
    metric: 'mcap',
    titleTag: 'Market Cap Change Heatmap — Biggest $ Movers',
    description:
      'Market cap change heatmap — today\'s dollar gains and losses, not percentages. See which companies added or destroyed the most market value today. Grouped by sector.',
    h1: 'Market Cap Change Heatmap',
    intro:
      'Market cap change measures today\'s move in absolute dollars — a 2% gain on a mega-cap moves more shareholder value than a 20% spike on a small-cap. This heatmap colors US stocks by daily market-cap change, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles added the most dollar value today, redder tiles destroyed the most.',
    keywords: ['market cap movers', 'biggest market cap gains', 'dollar movers', 'market value change', 'cap weighted movers'],
    faq: [
      {
        q: 'Why look at dollar change instead of percent?',
        a: 'Percentages flatter small-caps — a micro-cap can gain 40% and move the market less than a mega-cap gaining 0.5%. Dollar change shows where shareholder value actually moved.',
      },
      {
        q: 'What does a big green dollar-mover usually mean?',
        a: 'A genuine event at scale — earnings surprise, guidance raise, or a sector-wide re-rating concentrated in the largest names.',
      },
      {
        q: 'How does this differ from the day-change view?',
        a: 'Same colors, different denominator — percent answers "who moved most relative to size", dollar answers "who moved the most value".',
      },
    ],
  },
  {
    slug: 'movers-z-score',
    metric: 'zscore',
    titleTag: 'Movers Z-Score Heatmap — Statistically Unusual Stocks',
    description:
      'Z-score heatmap of US stocks — moves measured in standard deviations, not raw percent. Green tiles are statistically unusual movers today. Sized by market cap, grouped by sector.',
    h1: 'Movers Z-Score Heatmap',
    intro:
      'The movers Z-score expresses today\'s move in standard deviations of the stock\'s own history — a 2% move is normal for a volatile name but extraordinary for a sleepy one. Z-score filters the noise: green tiles are moving abnormally for them. This heatmap colors US stocks by Z-score, sized by market cap and grouped by sector.',
    colorNote:
      'Greener tiles are positive outliers, redder tiles negative outliers — both are statistically unusual, not just big movers.',
    keywords: ['z score stocks', 'unusual movers', 'statistical outliers stocks', 'abnormal moves', 'sigma movers'],
    faq: [
      {
        q: 'What Z-score counts as unusual?',
        a: 'Beyond ±2 is a ~95th-percentile move for that stock; beyond ±3 is rare. Unlike raw percent, it respects each stock\'s own volatility profile.',
      },
      {
        q: 'Why is Z-score better than percent change for screening?',
        a: 'A 5% move on a boring utility is more informative than 5% on a biotech — the first is a signal, the second is Tuesday. Z-score normalizes for that.',
      },
      {
        q: 'What causes a high Z-score?',
        a: 'Earnings surprises, guidance changes, analyst actions, sector shocks or company news — a genuine outlier move almost always has a catalyst behind it.',
      },
    ],
  },
];

const BY_SLUG = new Map(METRIC_PAGES.map((p) => [p.slug, p]));

export function getMetricPage(slug: string): MetricPageDef | undefined {
  return BY_SLUG.get(slug);
}

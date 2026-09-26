import { MetadataRoute } from 'next';
import { getProjectTickers } from '@/data/defaultTickers';
import { getDateET } from '@/lib/utils/dateET';
import { prisma } from '@/lib/db/prisma';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { getEligibleValuationTickers } from '@/lib/seo/eligibleValuation';
import { getEligibleFinancialsTickers } from '@/lib/seo/eligibleFinancials';
import { LEADERBOARDS } from '@/lib/seo/leaderboards';
import { METRIC_PAGES } from '@/lib/heatmap/metricPages';

// Never prerender at build time: CI builds have no DB, so a static bake would
// ship a gutted sitemap as the ISR baseline (and the outage guard below would
// then keep serving it as "last good version"). Per-request generation keeps
// the sitemap always built against real data; crawler traffic is low-volume.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://premarketprice.com';
  const currentDate = new Date().toISOString().split('T')[0];

  // -------------------------------------------------------
  // 1. MAIN STATIC PAGES — high-value canonical URLs
  // -------------------------------------------------------
  const mainPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 1.0,
      alternates: {
        languages: {
          en: baseUrl,
          'zh-CN': `${baseUrl}/zh`,
          'x-default': baseUrl,
        },
      },
    },
    {
      url: `${baseUrl}/heatmap`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    ...METRIC_PAGES.map((p) => ({
      url: `${baseUrl}/heatmap/${p.slug}`,
      lastModified: currentDate,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/earnings`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/premarket-movers`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
      alternates: {
        languages: {
          en: `${baseUrl}/premarket-movers`,
          'zh-CN': `${baseUrl}/zh/premarket-movers`,
          'x-default': `${baseUrl}/premarket-movers`,
        },
      },
    },
    {
      url: `${baseUrl}/premarket-movers/weekly`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/premarket-gainers`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/premarket-losers`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/unusual-volume`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/gainers`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/losers`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sectors`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/screener`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/capex-tracker`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/stocks`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    // Curated leaderboard screens — /screener/[slug]
    ...LEADERBOARDS.map((l) => ({
      url: `${baseUrl}/screener/${l.slug}`,
      lastModified: currentDate,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/disclaimer`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Chinese pilot pages — target Baidu/Sogou/Bing CN queries
    {
      url: `${baseUrl}/zh`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.7,
      alternates: {
        languages: {
          en: baseUrl,
          'zh-CN': `${baseUrl}/zh`,
          'x-default': baseUrl,
        },
      },
    },
    {
      url: `${baseUrl}/zh/premarket-movers`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.8,
      alternates: {
        languages: {
          en: `${baseUrl}/premarket-movers`,
          'zh-CN': `${baseUrl}/zh/premarket-movers`,
          'x-default': `${baseUrl}/premarket-movers`,
        },
      },
    },
  ];

  // Retry wrapper — eligible* helpers swallow DB errors (catch→[]) and the
  // app's single SQLite connection can time out under load. An empty result
  // here is virtually always transient; prod always has hundreds of tickers.
  const fill = async <T>(fn: () => Promise<T[]>, tries = 4): Promise<T[]> => {
    for (let i = 0; i < tries; i++) {
      const r = await fn();
      if (r.length > 0) return r;
      if (i < tries - 1) await new Promise((res) => setTimeout(res, 1500));
    }
    return [];
  };

  // -------------------------------------------------------
  // 2. ANALYSIS PAGES — /analysis/[ticker] — SEO gold
  //    These are proper canonical pages (not query params!)
  //    Covers ALL eligible tickers (AnalysisCache required) for programmatic SEO.
  // -------------------------------------------------------
  const allTickers = await fill(() => getEligibleAnalysisTickers());

  // Fetch lastUpdated timestamps from DB for analysis pages
  const tickerUpdates = new Map<string, string>();
  try {
    const tickersFromDB = await prisma.ticker.findMany({
      where: { symbol: { in: allTickers } },
      select: { symbol: true, updatedAt: true }
    });
    for (const t of tickersFromDB) {
      if (t.updatedAt) {
        const ts = t.updatedAt.toISOString().split('T')[0];
        if (ts) tickerUpdates.set(t.symbol, ts);
      }
    }
  } catch {
    // Fallback: use currentDate for all
  }

  const analysisPages: MetadataRoute.Sitemap = allTickers.map((ticker) => ({
    url: `${baseUrl}/analysis/${ticker}`,
    lastModified: tickerUpdates.get(ticker) || currentDate,
    changeFrequency: 'daily' as const,
    // Top 50 tickers get higher priority
    priority: allTickers.indexOf(ticker) < 50 ? 0.85 : 0.7,
  }));

  // -------------------------------------------------------
  // 3a. VALUATION PAGES — /valuation/[ticker]
  //     Only include tickers with ≥20 PE AND ≥20 PS observations.
  //     Tickers with insufficient data get noindex on the page itself.
  // -------------------------------------------------------
  const eligibleValuationTickers = await fill(() => getEligibleValuationTickers());
  const valuationPages: MetadataRoute.Sitemap = eligibleValuationTickers.map((ticker) => ({
    url: `${baseUrl}/valuation/${ticker}`,
    lastModified: tickerUpdates.get(ticker) || currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // -------------------------------------------------------
  // 3b. FINANCIALS PAGES — /financials/[ticker]
  //     Only include tickers with ≥4 FinancialStatement rows
  //     with all 5 key fields non-null (revenue, netIncome,
  //     totalAssets, totalLiabilities, totalEquity).
  // -------------------------------------------------------
  const eligibleFinancialsTickers = await fill(() => getEligibleFinancialsTickers());
  const financialsPages: MetadataRoute.Sitemap = eligibleFinancialsTickers.map((ticker) => ({
    url: `${baseUrl}/financials/${ticker}`,
    lastModified: tickerUpdates.get(ticker) || currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // -------------------------------------------------------
  // 3c. MOVER PAGES — /movers/[ticker]
  //     Only include tickers with enough significant moves (quality filter).
  //     A page with 0-2 moves is thin content → noindex on the page itself
  //     and excluded from sitemap to avoid wasting crawl budget.
  // -------------------------------------------------------
  const moverPages: MetadataRoute.Sitemap = [];
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Count significant moves (|zScore| >= 2.0) per ticker in last 30 days
    const moveCounts = await prisma.sessionPrice.groupBy({
      by: ['symbol'],
      where: {
        symbol: { in: allTickers },
        date: { gte: since },
        OR: [
          { zScore: { gte: 2.0 } },
          { zScore: { lte: -2.0 } },
        ],
      },
      _count: { _all: true },
    });

    // Filter in JS — only tickers with >= 3 significant moves (quality threshold)
    for (const row of moveCounts) {
      if (row._count._all >= 3) {
        moverPages.push({
          url: `${baseUrl}/premarket/${row.symbol}`,
          lastModified: currentDate,
          changeFrequency: 'daily' as const,
          priority: 0.75,
        });
      }
    }
  } catch {
    // Fallback: no mover pages if DB unavailable
  }

  // Outage guard — if ALL dynamic ticker sections are empty, the DB layer is
  // almost certainly down (prod always has hundreds of eligible tickers).
  // Throw so ISR keeps serving the previous good sitemap instead of caching
  // a gutted one (eligible* helpers silently fall back to [] on errors).
  // Skip during build prerender — CI builds have no real DB, empty sections
  // are expected there (ISR regenerates with real data on first request).
  if (
    process.env.NEXT_PHASE !== 'phase-production-build' &&
    (allTickers.length === 0 ||
      valuationPages.length === 0 ||
      financialsPages.length === 0)
  ) {
    throw new Error(
      `sitemap: ticker sections empty (analysis=${allTickers.length} valuation=${valuationPages.length} financials=${financialsPages.length}) — refusing to cache a gutted sitemap`,
    );
  }

  // -------------------------------------------------------
  // 4. SECTOR PAGES — /sectors/[sector]
  // -------------------------------------------------------
  const sectors = [
    'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
    'Industrials', 'Communication Services', 'Consumer Defensive',
    'Energy', 'Utilities', 'Real Estate', 'Basic Materials',
  ];

  const sectorPages: MetadataRoute.Sitemap = sectors.map((sector) => ({
    url: `${baseUrl}/sectors/${encodeURIComponent(sector)}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // -------------------------------------------------------
  // 5. DATE-BASED ARCHIVE PAGES — past 30 days
  // -------------------------------------------------------
  const archivePages: MetadataRoute.Sitemap = [];
  const earningsPages: MetadataRoute.Sitemap = [];

  try {
    const todayET = getDateET(new Date());

    // Past 30 days: premarket-gainers & premarket-losers archives — but only
    // dates that actually have data. Weekend/holiday dates render noindex;
    // listing them in the sitemap would contradict the robots signal.
    const since30 = new Date(todayET + 'T00:00:00Z');
    since30.setUTCDate(since30.getUTCDate() - 30);
    const datesWithData = await prisma.sessionPrice.findMany({
      where: { session: 'pre', date: { gte: since30 } },
      select: { date: true },
      distinct: ['date'],
    });
    const dateSet = new Set(
      datesWithData.map((r) => r.date.toISOString().split('T')[0]),
    );
    for (const dateStr of dateSet) {
      if (!dateStr) continue;
      const isFresh = dateStr === todayET;
      archivePages.push(
        {
          url: `${baseUrl}/premarket-gainers/${dateStr}`,
          lastModified: currentDate,
          changeFrequency: (isFresh ? 'hourly' : 'monthly') as 'hourly' | 'monthly',
          priority: isFresh ? 0.8 : 0.5,
        },
        {
          url: `${baseUrl}/premarket-losers/${dateStr}`,
          lastModified: currentDate,
          changeFrequency: (isFresh ? 'hourly' : 'monthly') as 'hourly' | 'monthly',
          priority: isFresh ? 0.8 : 0.5,
        },
      );
    }

    // Future 30 days: earnings calendar — only dates that actually have
    // earnings rows (empty dates render noindex; listing them here would
    // contradict the robots signal).
    const end = new Date(todayET + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 30);
    const endStr = end.toISOString().split('T')[0] ?? '';
    const earningDates = await prisma.earningsCalendar.findMany({
      where: {
        date: {
          gte: new Date(todayET + 'T00:00:00Z'),
          lte: new Date(endStr + 'T23:59:59Z'),
        },
      },
      select: { date: true },
      distinct: ['date'],
    });
    for (const row of earningDates) {
      const dateStr = row.date.toISOString().split('T')[0];
      earningsPages.push({
        url: `${baseUrl}/earnings/date/${dateStr}`,
        lastModified: currentDate,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      });
    }
  } catch (e) {
    // Build prerender has no DB — empty sections are expected there. At runtime
    // rethrow: silently dropping date/earnings URLs lets ISR cache a gutted
    // sitemap, while a throw keeps the last good version (ticker-guard rule).
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.warn('[sitemap] date sections skipped during build prerender');
    } else {
      throw e;
    }
  }

  // -------------------------------------------------------
  // 5. BLOG PAGES — /blog + /blog/[date]
  // -------------------------------------------------------
  const blogPages: MetadataRoute.Sitemap = [{
    url: `${baseUrl}/blog`,
    lastModified: currentDate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }];

  try {
    const snapshots = await prisma.dailyBlogSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 60,
      select: { date: true },
    });
    for (const snap of snapshots) {
      blogPages.push({
        url: `${baseUrl}/blog/${snap.date}`,
        lastModified: new Date(snap.date).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: snap.date.startsWith('weekly-') ? 0.75 : 0.7,
      });
    }
  } catch (e) {
    // Same rule as the archive/earnings block above.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.warn('[sitemap] blog date pages skipped during build prerender');
    } else {
      throw e;
    }
  }

  return [
    ...mainPages,
    ...analysisPages,
    ...valuationPages,
    ...financialsPages,
    ...moverPages,
    ...sectorPages,
    ...archivePages,
    ...earningsPages,
    ...blogPages,
  ];
}

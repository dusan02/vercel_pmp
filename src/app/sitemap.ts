import { MetadataRoute } from 'next';
import { getProjectTickers } from '@/data/defaultTickers';
import { getDateET } from '@/lib/utils/dateET';

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
    },
    {
      url: `${baseUrl}/stocks`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/heatmap`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
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
  ];

  // -------------------------------------------------------
  // 2. ALL TICKERS — /stock/[ticker] canonical pages
  // -------------------------------------------------------
  const allTickers = getProjectTickers('pmp');

  const stockPages: MetadataRoute.Sitemap = allTickers.map((ticker) => ({
    url: `${baseUrl}/stock/${ticker}`,
    lastModified: currentDate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // -------------------------------------------------------
  // 3. ANALYSIS PAGES — /analysis/[ticker] — SEO gold
  //    These are proper canonical pages (not query params!)
  //    Covers ALL tickers (300+) for programmatic SEO.
  // -------------------------------------------------------
  const analysisPages: MetadataRoute.Sitemap = allTickers.map((ticker) => ({
    url: `${baseUrl}/analysis/${ticker}`,
    lastModified: currentDate,
    changeFrequency: 'daily' as const,
    // Top 50 tickers get higher priority
    priority: allTickers.indexOf(ticker) < 50 ? 0.85 : 0.7,
  }));

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

    // Past 30 days: premarket-gainers & premarket-losers archives
    for (let i = 0; i < 30; i++) {
      const date = new Date(todayET);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const isFresh = i === 0;
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

    // Future 30 days: earnings calendar
    for (let i = 0; i < 30; i++) {
      const date = new Date(todayET);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      earningsPages.push({
        url: `${baseUrl}/earnings/${dateStr}`,
        lastModified: currentDate,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      });
    }
  } catch (e) {
    // Fallback: ignore date pages if the date util or DB fails
  }

  return [
    ...mainPages,
    ...stockPages,
    ...analysisPages,
    ...sectorPages,
    ...archivePages,
    ...earningsPages,
  ];
}

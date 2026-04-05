import { MetadataRoute } from 'next';
import { getProjectTickers } from '@/data/defaultTickers';
import { getEarningsForDate } from '@/lib/server/earningsService';
import { getDateET } from '@/lib/utils/dateET';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://premarketprice.com';
  const currentDate = new Date().toISOString().split('T')[0];

  // Main pages
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

  // Tab-based dynamic pages (important for SEO)
  const tabPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/?tab=movers`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/?tab=earnings`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/?tab=heatmap`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/?tab=analysis`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/?tab=portfolio`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/?tab=favorites`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/?tab=allStocks`,
      lastModified: currentDate,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
  ];

  // Company pages for all project stocks
  const topTickers = getProjectTickers('pmp');
  const companyPages: MetadataRoute.Sitemap = topTickers.map((ticker) => ({
    url: `${baseUrl}/stock/${ticker}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Analysis pages for major tickers (SEO gold)
  const analysisPages: MetadataRoute.Sitemap = topTickers.slice(0, 50).map((ticker) => ({
    url: `${baseUrl}/?tab=analysis&ticker=${ticker}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Sector pages
  const sectors = [
    'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
    'Industrials', 'Communication Services', 'Consumer Defensive',
    'Energy', 'Utilities', 'Real Estate', 'Basic Materials'
  ];

  const sectorPages: MetadataRoute.Sitemap = sectors.map((sector) => ({
    url: `${baseUrl}/sectors/${encodeURIComponent(sector)}`,
    lastModified: currentDate,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Date-based archive pages (past 30 days) — programmatic SEO
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
          changeFrequency: isFresh ? 'hourly' : 'monthly',
          priority: isFresh ? 0.8 : 0.5,
        },
        {
          url: `${baseUrl}/premarket-losers/${dateStr}`,
          lastModified: currentDate,
          changeFrequency: isFresh ? 'hourly' : 'monthly',
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
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  } catch (e) {
    // Fallback: ignore date pages if API fails
  }

  return [
    ...mainPages,
    ...tabPages,
    ...companyPages,
    ...analysisPages,
    ...sectorPages,
    ...archivePages,
    ...earningsPages,
  ];
}

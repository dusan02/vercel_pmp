import { MetadataRoute } from 'next';
import { getProjectTickers } from '@/data/defaultTickers';

export default function sitemap(): MetadataRoute.Sitemap {
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
  ];

  // Company pages for top 200 stocks
  const topTickers = getProjectTickers('pmp', 200);
  const companyPages: MetadataRoute.Sitemap = topTickers.map((ticker) => ({
    url: `${baseUrl}/company/${ticker}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...mainPages, ...companyPages];
}



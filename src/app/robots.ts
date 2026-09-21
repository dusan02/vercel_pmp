import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://premarketprice.com';
  return {
    rules: [
      {
        userAgent: '*',
        // JS/CSS chunks and the image optimizer must stay crawlable so
        // Googlebot can fully render pages; only ISR data endpoints stay out.
        allow: ['/', '/_next/static/', '/_next/image'],
        disallow: [
          '/api/',
          '/admin/',
          '/_next/data/',
          '/security',
        ],
      },
      // AI crawlers — explicitly allowed so answers cite us in ChatGPT,
      // Claude, Perplexity and Google AI Overviews (GEO).
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-Web',
          'anthropic-ai',
          'PerplexityBot',
          'Google-Extended',
          'Applebot-Extended',
          'cohere-ai',
        ],
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}


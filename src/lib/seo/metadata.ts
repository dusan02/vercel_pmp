import type { Metadata } from 'next';
import { getCompanyName } from '@/lib/companyNames';

const baseUrl = 'https://premarketprice.com';
const siteName = 'PreMarketPrice';

interface CompanyMetadataParams {
  ticker: string;
  companyName?: string;
  price?: number;
  percentChange?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

interface PageMetadataParams {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  type?: 'website' | 'article';
}

/**
 * Generate metadata for company pages
 */
export function generateCompanyMetadata({
  ticker,
  companyName,
  price,
  percentChange,
  marketCap,
  sector,
  industry,
}: CompanyMetadataParams): Metadata {
  const displayName = companyName || getCompanyName(ticker);
  const priceText = price ? `$${price.toFixed(2)}` : '';
  const changeText = percentChange !== undefined 
    ? `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`
    : '';
  const marketCapText = marketCap 
    ? `Market Cap: $${(marketCap / 1e9).toFixed(2)}B`
    : '';

  const title = `${displayName} (${ticker}) Stock Price & Analysis | ${siteName}`;
  const description = `Real-time stock data for ${displayName} (${ticker}). ${priceText ? `Current price: ${priceText}` : ''} ${changeText ? `(${changeText})` : ''} ${marketCapText ? `- ${marketCapText}` : ''}. Track pre-market movements, earnings calendar, and comprehensive stock analysis.${sector ? ` Sector: ${sector}.` : ''}${industry ? ` Industry: ${industry}.` : ''}`;

  const keywords = [
    ticker,
    displayName,
    `${ticker} stock`,
    `${ticker} price`,
    `${displayName} stock price`,
    'stock market',
    'pre-market',
    'earnings',
    'stock analysis',
    ...(sector ? [sector.toLowerCase()] : []),
    ...(industry ? [industry.toLowerCase()] : []),
  ].filter(Boolean).join(', ');

  const url = `${baseUrl}/company/${ticker}`;
  const ogImage = `${baseUrl}/og-image.png`;

  return {
    title,
    description,
    keywords,
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${displayName} (${ticker}) Stock Data`,
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      creator: '@premarketprice',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

/**
 * Generate metadata for regular pages
 */
export function generatePageMetadata({
  title,
  description,
  path,
  keywords = [],
  image,
  type = 'website',
}: PageMetadataParams): Metadata {
  const fullTitle = `${title} | ${siteName}`;
  const url = `${baseUrl}${path}`;
  const ogImage = image || `${baseUrl}/og-image.png`;

  const defaultKeywords = [
    'US stocks',
    'NYSE stocks',
    'NASDAQ stocks',
    'pre-market',
    'pre-market live prices',
    'earnings',
    'US stock market',
    'trading',
    'real-time data',
    ...keywords,
  ];

  return {
    title: fullTitle,
    description,
    keywords: defaultKeywords.join(', '),
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_US',
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
      creator: '@premarketprice',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

/**
 * Generate breadcrumb structured data
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}


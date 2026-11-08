import type { Metadata } from 'next';
import { getCompanyName } from '@/lib/companyNames';

const baseUrl = 'https://premarketprice.com';
const siteName = 'PreMarketPrice';

/**
 * Shorten a company name for use in <title> and OG metadata.
 * Strips ADS/share descriptions and common legal suffixes.
 * "Meta Platforms, Inc. Class A Common Stock" → "Meta Platforms"
 * "British American Tobacco p.l.c. American Depositary Shares…" → "British American Tobacco"
 */
export function shortName(name: string): string {
  // Remove everything from "American Depositary" onwards
  let s = name.replace(/\s*American Depositary[\s\S]*$/i, '');
  // Remove par-value share descriptions (", par value $0.001 per share")
  s = s.replace(/[\s,]+par value[\s\S]*$/i, '');
  // Remove parenthetical share descriptions
  s = s.replace(/\s*\(.*(?:Share|Stock|Ordinary|Unit|Depositary)[^)]*\)\s*/gi, ' ');
  // Remove trailing share class / type descriptions
  s = s.replace(/[\s,]+(Class\s+[A-Z]\s+)?(Common\s+(Stock|Units?|Shares?)|Ordinary\s+Shares?|Preferred\s+Stock|Common\s+Units?[\s\S]*|Shares?[\s\S]*|Depositary\s+Units?)[\s.]*$/i, '');
  // Remove legal entity suffixes at the end
  s = s.replace(/[\s,]+(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLC|L\.L\.C\.|PLC|P\.L\.C\.|plc|S\.A\.?|N\.V\.?|AG|SE|Co\.?|Company|Group|Holdings?|Holding)\s*$/i, '');
  // Clean up leftover punctuation
  s = s.replace(/[\s,.]+$/, '').trim();
  // If we stripped too much, return the original
  return s.length >= 2 ? s : name.trim();
}

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
  /** hreflang alternates, e.g. { 'en': '/premarket-movers', 'zh-CN': '/zh/premarket-movers' } */
  languages?: Record<string, string>;
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
  const short = shortName(displayName);
  const priceText = price ? `$${price.toFixed(2)}` : '';
  const changeText = percentChange !== undefined 
    ? `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`
    : '';
  const marketCapText = marketCap && marketCap > 0.01
    ? `Market Cap: $${marketCap.toFixed(1)}B`
    : '';

  // CTR-optimized title: balances "Stock Analysis" (high volume queries) and
  // "Premarket" (our key ranking differentiator) while staying strictly <= 60 chars.
  // maxTitleLen: 60 total minus " | PreMarketPrice" suffix (17 chars) = 43 chars budget.
  const maxTitleLen = 60 - ` | ${siteName}`.length;
  const compactPrice = price ? `$${Math.round(price)}` : '';

  const withAnalysisAndPrice = priceText
    ? `${ticker} Analysis & Premarket ${priceText} — ${short}`
    : '';
  const withCompactPrice = compactPrice
    ? `${ticker} Analysis & Premarket ${compactPrice} — ${short}`
    : '';
  const withAnalysisNoPrice = `${ticker} Stock Analysis & Premarket — ${short}`;
  const withAnalysisPriceOnly = priceText
    ? `${ticker} Analysis & Premarket ${priceText}`
    : '';
  const genericAnalysis = `${ticker} Stock Analysis & Premarket Price`;
  const fallbackShort = `${ticker} Stock Analysis — ${short}`;

  const title = (withAnalysisAndPrice && withAnalysisAndPrice.length <= maxTitleLen)
    ? withAnalysisAndPrice
    : (withCompactPrice && withCompactPrice.length <= maxTitleLen)
      ? withCompactPrice
      : (withAnalysisNoPrice.length <= maxTitleLen)
        ? withAnalysisNoPrice
        : (withAnalysisPriceOnly && withAnalysisPriceOnly.length <= maxTitleLen)
          ? withAnalysisPriceOnly
          : (genericAnalysis.length <= maxTitleLen)
            ? genericAnalysis
            : (fallbackShort.length <= maxTitleLen)
              ? fallbackShort
              : `${ticker} Stock Analysis`;
  const fullTitle = `${title} | ${siteName}`;

  // Keyword-rich description matching search intent
  const descParts = [
    `${short} (${ticker}) stock price${priceText ? `: ${priceText}` : ''}${changeText ? ` ${changeText}` : ''}.`,
    marketCapText ? `${marketCapText}.` : '',
    sector ? `Sector: ${sector}.` : '',
    'Real-time pre-market price, earnings calendar, financial health score, valuation metrics (P/E, P/S, Altman Z-Score),',
    'and analyst estimates. Free stock analysis for NYSE & NASDAQ.',
  ].filter(Boolean);
  const description = descParts.join(' ').replace(/\s+/g, ' ').trim();

  const keywords = [
    ticker,
    displayName,
    `${ticker} stock`,
    `${ticker} stock price`,
    `${ticker} stock price today`,
    `${displayName} stock price`,
    `${ticker} premarket`,
    `${ticker} pre market`,
    `${ticker} analysis`,
    `${ticker} earnings`,
    `${ticker} valuation`,
    `${ticker} financial health`,
    'stock market',
    'pre-market',
    'earnings',
    'stock analysis',
    ...(sector ? [sector.toLowerCase()] : []),
    ...(industry ? [industry.toLowerCase()] : []),
  ].filter(Boolean).join(', ');

  const url = `${baseUrl}/analysis/${ticker}`;
  const ogImage = `${baseUrl}/analysis/${ticker}/opengraph-image`;

  return {
    title,
    description,
    keywords,
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
          alt: `${short} (${ticker}) Stock Data`,
        },
      ],
      locale: 'en_US',
      type: 'website',
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
 * Generate metadata for regular pages
 */
export function generatePageMetadata({
  title,
  description,
  path,
  keywords = [],
  image,
  type = 'website',
  languages,
}: PageMetadataParams): Metadata {
  const fullTitle = title;
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
      ...(languages
        ? {
            languages: Object.fromEntries(
              Object.entries(languages).map(([k, v]) => [k, v.startsWith('http') ? v : `${baseUrl}${v}`]),
            ),
          }
        : {}),
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


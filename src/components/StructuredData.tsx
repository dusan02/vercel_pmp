'use client';

import { StockData } from '@/lib/types';
import { getCompanyName } from '@/lib/companyNames';

interface StructuredDataProps {
  stocks?: StockData[];
  pageType?: 'home' | 'company' | 'earnings' | 'heatmap';
  companyData?: {
    ticker: string;
    name: string;
    price: number;
    marketCap: number;
    sector?: string;
    industry?: string;
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
}

export function StructuredData({ 
  stocks, 
  pageType = 'home', 
  companyData,
  breadcrumbs 
}: StructuredDataProps) {
  const baseUrl = 'https://premarketprice.com';

  // Generate breadcrumb schema if provided
  const breadcrumbSchema = breadcrumbs && breadcrumbs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  } : null;

  if (pageType === 'company' && companyData) {
    // Company-specific structured data
    const companySchema = {
      '@context': 'https://schema.org',
      '@type': 'Corporation',
      name: companyData.name,
      tickerSymbol: companyData.ticker,
      price: companyData.price,
      priceCurrency: 'USD',
      marketCap: companyData.marketCap,
      ...(companyData.sector && { sector: companyData.sector }),
      ...(companyData.industry && { industry: companyData.industry }),
      url: `${baseUrl}/company/${companyData.ticker}`,
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(companySchema),
          }}
        />
        {breadcrumbSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(breadcrumbSchema),
            }}
          />
        )}
      </>
    );
  }

  if (pageType === 'home' && stocks && stocks.length > 0) {
    // Homepage with stock data - create ItemList
    const stockItems = stocks.slice(0, 50).map((stock, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'FinancialProduct',
        name: getCompanyName(stock.ticker),
        tickerSymbol: stock.ticker,
        price: stock.currentPrice,
        priceCurrency: 'USD',
        ...(stock.marketCap && { marketCap: stock.marketCap }),
        ...(stock.sector && { sector: stock.sector }),
        ...(stock.industry && { industry: stock.industry }),
      },
    }));

    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Top US Stock Market Data',
      description: 'Real-time pre-market live stock prices and market data for top US companies traded on NYSE, NASDAQ, and other US exchanges',
      numberOfItems: Math.min(stocks.length, 50),
      itemListElement: stockItems,
    };

    // Use provided breadcrumbs or default homepage breadcrumb
    const defaultBreadcrumb = breadcrumbSchema || {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: baseUrl,
        },
      ],
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(defaultBreadcrumb),
          }}
        />
      </>
    );
  }

  // For other page types (earnings, heatmap), just return breadcrumbs if provided
  if (breadcrumbSchema) {
    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />
    );
  }

  return null;
}


'use client';

import { StockData } from '@/lib/types';
import { getCompanyName } from '@/lib/companyNames';

interface StructuredDataProps {
  stocks?: StockData[];
  pageType?: 'home' | 'company' | 'earnings';
  companyData?: {
    ticker: string;
    name: string;
    price: number;
    marketCap: number;
    sector?: string;
    industry?: string;
  };
}

export function StructuredData({ stocks, pageType = 'home', companyData }: StructuredDataProps) {
  if (pageType === 'company' && companyData) {
    // Company-specific structured data
    const companySchema = {
      '@context': 'https://schema.org',
      '@type': 'Corporation',
      name: companyData.name,
      tickerSymbol: companyData.ticker,
      price: companyData.price,
      marketCap: companyData.marketCap,
      ...(companyData.sector && { sector: companyData.sector }),
      ...(companyData.industry && { industry: companyData.industry }),
    };

    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companySchema),
        }}
      />
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
      name: 'Top Stock Market Data',
      description: 'Real-time stock prices and market data for top companies',
      numberOfItems: Math.min(stocks.length, 50),
      itemListElement: stockItems,
    };

    // Breadcrumbs for homepage
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://premarketprice.com',
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
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />
      </>
    );
  }

  return null;
}


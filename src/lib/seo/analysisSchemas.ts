const baseUrl = 'https://premarketprice.com';

interface StockSchemaInput {
  ticker: string;
  companyName: string;
  description: string | null | undefined;
  sector: string | null | undefined;
}

/** schema.org FinancialProduct for /analysis/[ticker]. */
export function buildStockSchema({ ticker, companyName, description, sector }: StockSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: ticker,
    description:
      description ||
      `Real-time pre-market stock data and analysis for ${companyName} (${ticker}). Track price, % change, market cap, earnings and more.`,
    ...(sector ? { category: sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };
}

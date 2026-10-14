const baseUrl = 'https://premarketprice.com';

interface StockSchemaInput {
  ticker: string;
  companyName: string;
  description: string | null | undefined;
  sector: string | null | undefined;
  price?: number | null | undefined;
  marketCapB?: number | null | undefined;
  peRatio?: number | null | undefined;
  healthScore?: number | null | undefined;
  valuationScore?: number | null | undefined;
}

/** schema.org FinancialProduct for /analysis/[ticker] — enriched with
 *  structured PropertyValue facts for search engines and AI answers (GEO). */
export function buildStockSchema({
  ticker,
  companyName,
  description,
  sector,
  price,
  marketCapB,
  peRatio,
  healthScore,
  valuationScore,
}: StockSchemaInput) {
  const props: Array<{ '@type': 'PropertyValue'; name: string; value: string | number }> = [];
  if (marketCapB != null && Number.isFinite(marketCapB) && marketCapB > 0) {
    props.push({ '@type': 'PropertyValue', name: 'Market Capitalization (USD Billions)', value: Number(marketCapB.toFixed(2)) });
  }
  if (peRatio != null && Number.isFinite(peRatio) && peRatio > 0) {
    props.push({ '@type': 'PropertyValue', name: 'P/E Ratio (TTM)', value: Number(peRatio.toFixed(2)) });
  }
  if (healthScore != null && Number.isFinite(healthScore)) {
    props.push({ '@type': 'PropertyValue', name: 'PMP Financial Health Score (0-100)', value: Math.round(healthScore) });
  }
  if (valuationScore != null && Number.isFinite(valuationScore)) {
    props.push({ '@type': 'PropertyValue', name: 'PMP Valuation Score (0-100)', value: Math.round(valuationScore) });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} (${ticker}) Stock`,
    tickerSymbol: ticker,
    url: `${baseUrl}/analysis/${ticker}`,
    description:
      description ||
      `Real-time pre-market stock data and fundamental analysis for ${companyName} (${ticker}). Track price, % change, market cap, six-pillar scores, valuation history, and earnings.`,
    ...(sector ? { category: sector } : {}),
    ...(price != null && Number.isFinite(price) && price > 0
      ? {
          offers: {
            '@type': 'Offer',
            price: Number(price.toFixed(2)),
            priceCurrency: 'USD',
          },
        }
      : {}),
    ...(props.length > 0 ? { additionalProperty: props } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };
}

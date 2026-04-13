import { Metadata } from 'next';
import { getProjectTickers } from '@/data/defaultTickers';
import { getCompanyName } from '@/lib/companyNames';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getStocksData } from '@/lib/server/stockService';
import Link from 'next/link';
import { generateBreadcrumbSchema } from '@/lib/seo/metadata';

const baseUrl = 'https://premarketprice.com';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 300; // 5 min cache

// Pre-generate static params for top tickers (SEO gold)
export async function generateStaticParams() {
  const tickers = getProjectTickers('pmp');
  return tickers.map((ticker) => ({ ticker: ticker.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const companyName = getCompanyName(tickerUpper);

  try {
    const { data } = await getStocksData([tickerUpper], 'pmp');
    const stock = data[0];

    if (stock) {
      return generateCompanyMetadata({
        ticker: tickerUpper,
        ...(stock.companyName ? { companyName: stock.companyName } : {}),
        ...(stock.currentPrice !== undefined && stock.currentPrice > 0 ? { price: stock.currentPrice } : {}),
        ...(stock.percentChange !== undefined ? { percentChange: stock.percentChange } : {}),
        ...(stock.marketCap !== undefined && stock.marketCap > 0 ? { marketCap: stock.marketCap } : {}),
        ...(stock.sector ? { sector: stock.sector } : {}),
        ...(stock.industry ? { industry: stock.industry } : {}),
      });
    }
  } catch (e) {
    // fallback below
  }

  // Fallback metadata (no live data)
  const title = `${companyName} (${tickerUpper}) Stock Analysis & Pre-Market Price`;
  const description = `View pre-market price, technical analysis, and financial data for ${companyName} (${tickerUpper}). Track ${tickerUpper} live price changes, earnings, market cap, and more.`;

  return {
    title,
    description,
    keywords: [
      tickerUpper,
      companyName,
      `${tickerUpper} stock`,
      `${tickerUpper} stock price`,
      `${tickerUpper} analysis`,
      `${tickerUpper} pre-market`,
      `${companyName} stock analysis`,
      'pre-market price',
      'stock analysis',
      'US stocks',
    ].join(', '),
    alternates: {
      canonical: `${baseUrl}/analysis/${tickerUpper}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/analysis/${tickerUpper}`,
      siteName: 'PreMarketPrice',
      images: [{ url: `${baseUrl}/og-image.png`, width: 1200, height: 630, alt: `${companyName} stock analysis` }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

export default async function AnalysisTickerPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  // Fetch live data for SSR rendering
  let stock: any = null;
  try {
    const { data } = await getStocksData([tickerUpper], 'pmp');
    stock = data[0] || null;
  } catch (e) {
    // continue without live data
  }

  const companyName = stock?.companyName || getCompanyName(tickerUpper);
  const price = stock?.currentPrice || null;
  const percentChange = stock?.percentChange ?? null;
  const marketCap = stock?.marketCap || null;
  const sector = stock?.sector || null;
  const industry = stock?.industry || null;
  const changeColor = percentChange !== null ? (percentChange >= 0 ? '#16a34a' : '#dc2626') : '#6b7280';

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Stock Analysis', url: `${baseUrl}/analysis` },
    { name: `${companyName} (${tickerUpper})`, url: `${baseUrl}/analysis/${tickerUpper}` },
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumbs */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" aria-label="Breadcrumb">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Home
            </Link>
            <span className="text-gray-400">/</span>
            <Link href="/stocks" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Stocks
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {companyName} ({tickerUpper}) Analysis
            </span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
            {companyName} ({tickerUpper}) — Stock Analysis
          </h1>
          {sector && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {sector}{industry ? ` · ${industry}` : ''}
            </p>
          )}
        </div>

        {/* Live price card (SSR) */}
        {price !== null && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Price</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">${price.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Pre-Market Change</p>
              <p className="text-2xl font-bold" style={{ color: changeColor }}>
                {percentChange !== null ? `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%` : '—'}
              </p>
            </div>
            {marketCap && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Market Cap</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${marketCap.toFixed(1)}B
                </p>
              </div>
            )}
            <div className="flex items-end">
              <Link
                href={`/?tab=analysis&ticker=${tickerUpper}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Open Full Analysis →
              </Link>
            </div>
          </div>
        )}

        {/* SEO text content */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6 max-w-4xl">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            About {companyName} ({tickerUpper}) Pre-Market Analysis
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3 leading-relaxed">
            <p>
              <strong>{companyName}</strong> ({tickerUpper}) is tracked in real-time on PreMarketPrice across all US trading sessions — pre-market (4:00–9:30 AM ET), regular session (9:30 AM–4:00 PM ET), and after-hours. Use the interactive analysis panel to explore price trends, momentum signals, earnings history, and valuation metrics.
            </p>
            <p>
              Pre-market prices for {tickerUpper} reflect trades occurring before the NYSE/NASDAQ open and can differ significantly from the prior closing price due to overnight news, earnings reports, analyst upgrades/downgrades, or macroeconomic events.
            </p>
            {sector && (
              <p>
                {tickerUpper} operates in the <strong>{sector}</strong>{industry ? ` sector, specifically in <strong>{industry}</strong>` : ' sector'}. Use the{' '}
                <Link href="/heatmap" className="text-blue-600 dark:text-blue-400 hover:underline">Market Heatmap</Link> to compare {tickerUpper} against peers in the same sector by percentage change or market cap movement.
              </p>
            )}
            <p>
              For a full list of pre-market movers today, visit the <Link href="/premarket-movers" className="text-blue-600 dark:text-blue-400 hover:underline">Premarket Movers</Link> page, or explore the{' '}
              <Link href="/stocks" className="text-blue-600 dark:text-blue-400 hover:underline">All Stocks</Link> list to compare {tickerUpper} with 300+ tracked companies.
            </p>
          </div>
        </section>

        {/* CTA to full analysis */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              View Full Interactive Analysis for {tickerUpper}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Live charts, technical indicators, earnings calendar, valuation scores, and more.
            </p>
          </div>
          <Link
            href={`/?tab=analysis&ticker=${tickerUpper}`}
            className="flex-shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Open Analysis →
          </Link>
        </div>

        {/* Internal navigation */}
        <nav aria-label="Related pages">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Explore More</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href={`/stock/${tickerUpper}`}>
              {tickerUpper} Stock Page
            </Link>
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/premarket-movers">
              Premarket Movers
            </Link>
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/heatmap">
              Market Heatmap
            </Link>
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/earnings">
              Earnings Calendar
            </Link>
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/gainers">
              Top Gainers
            </Link>
            <Link className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" href="/stocks">
              All Stocks
            </Link>
          </div>
        </nav>
      </main>

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FinancialProduct',
            name: `${companyName} (${tickerUpper}) Stock`,
            description: `Pre-market stock analysis and price data for ${companyName} (${tickerUpper}).`,
            url: `${baseUrl}/analysis/${tickerUpper}`,
            tickerSymbol: tickerUpper,
            ...(price ? { offers: { '@type': 'Offer', price, priceCurrency: 'USD' } } : {}),
            provider: {
              '@type': 'Organization',
              name: 'PreMarketPrice',
              url: baseUrl,
            },
          }),
        }}
      />
    </div>
  );
}

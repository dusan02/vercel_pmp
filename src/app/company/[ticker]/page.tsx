import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStocksData } from '@/lib/server/stockService';
import { getCompanyName } from '@/lib/companyNames';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';

const baseUrl = 'https://premarketprice.com';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

// Force dynamic to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  try {
    const { data } = await getStocksData([tickerUpper], 'pmp');
    const stock = data[0];

    if (!stock) {
      return {
        title: `${tickerUpper} | ${getCompanyName(tickerUpper)} | PreMarketPrice`,
        description: `Stock information for ${tickerUpper}`,
      };
    }

    return generateCompanyMetadata({
      ticker: tickerUpper,
      ...(stock.companyName ? { companyName: stock.companyName } : {}),
      ...(stock.currentPrice !== undefined && stock.currentPrice > 0 ? { price: stock.currentPrice } : {}),
      ...(stock.percentChange !== undefined ? { percentChange: stock.percentChange } : {}),
      ...(stock.marketCap !== undefined && stock.marketCap > 0 ? { marketCap: stock.marketCap } : {}),
      ...(stock.sector ? { sector: stock.sector } : {}),
      ...(stock.industry ? { industry: stock.industry } : {}),
    });
  } catch (error) {
    console.error(`Error generating metadata for ${tickerUpper}:`, error);
    return {
      title: `${tickerUpper} | PreMarketPrice`,
      description: `Stock information for ${tickerUpper}`,
    };
  }
}

export default async function CompanyPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  let stock = null;
  try {
    const { data } = await getStocksData([tickerUpper], 'pmp');
    stock = data[0];
  } catch (error) {
    console.error(`Error fetching stock data for ${tickerUpper}:`, error);
  }

  if (!stock) {
    notFound();
  }

  const companyName = stock.companyName || getCompanyName(tickerUpper);
  const price = stock.currentPrice || 0;
  const percentChange = stock.percentChange || 0;
  const marketCap = stock.marketCap || 0;
  const changeColor = percentChange >= 0 ? 'text-green-500' : 'text-red-500';
  const changeSymbol = percentChange >= 0 ? '+' : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumbs */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center space-x-2 text-sm">
            <Link 
              href="/" 
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Home
            </Link>
            <span className="text-gray-400">/</span>
            <Link 
              href="/stocks" 
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Stocks
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {companyName} ({tickerUpper})
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {companyName}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {tickerUpper}
            </p>
          </div>

          {/* Stock Price Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${price.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Change</p>
              <p className={`text-2xl font-bold ${changeColor}`}>
                {changeSymbol}{percentChange.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Market Cap</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${(marketCap / 1e9).toFixed(2)}B
              </p>
            </div>
          </div>

          {/* Additional Info */}
          {(stock.sector || stock.industry) && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {stock.sector && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sector</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {stock.sector}
                    </p>
                  </div>
                )}
                {stock.industry && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Industry</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {stock.industry}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Back Link */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/"
              className="inline-flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>

      {/* Structured Data */}
      <StructuredData
        pageType="company"
        companyData={{
          ticker: tickerUpper,
          name: companyName,
          price,
          marketCap,
          ...(stock.sector ? { sector: stock.sector } : {}),
          ...(stock.industry ? { industry: stock.industry } : {}),
        }}
        breadcrumbs={[
          { name: 'Home', url: baseUrl },
          { name: 'Stocks', url: `${baseUrl}/stocks` },
          { name: `${companyName} (${tickerUpper})`, url: `${baseUrl}/company/${tickerUpper}` },
        ]}
      />
    </div>
  );
}


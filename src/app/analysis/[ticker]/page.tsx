import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { getProjectTickers } from '@/data/defaultTickers';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

async function getTickerData(symbol: string) {
  try {
    return await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        description: true,
        employees: true,
        websiteUrl: true,
        headquarters: true,
        logoUrl: true,
        latestPrevClose: true,
      },
    });
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const tickers = getProjectTickers('pmp');
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  return generateCompanyMetadata({
    ticker: tickerUpper,
    companyName,
    ...(data?.lastPrice != null ? { price: data.lastPrice } : {}),
    ...(data?.lastChangePct != null ? { percentChange: data.lastChangePct } : {}),
    ...(data?.lastMarketCap != null ? { marketCap: data.lastMarketCap } : {}),
    ...(data?.sector ? { sector: data.sector } : {}),
    ...(data?.industry ? { industry: data.industry } : {}),
  });
}

export default async function AnalysisPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);

  if (!data && !getCompanyName(tickerUpper)) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;
  const price = data?.lastPrice;
  const changePct = data?.lastChangePct;
  const marketCap = data?.lastMarketCap;
  const isPositive = (changePct ?? 0) >= 0;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/stocks` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper})`, item: `${baseUrl}/analysis/${tickerUpper}` },
    ],
  };

  const stockSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: tickerUpper,
    description: data?.description || `Real-time pre-market stock data and analysis for ${companyName} (${tickerUpper}). Track price, % change, market cap, earnings and more.`,
    ...(data?.sector ? { category: data.sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(stockSchema) }} />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-400">/</li>
              <li><Link href="/stocks" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Stocks</Link></li>
              <li className="text-gray-400">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* SSR Hero — indexable by Google */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {companyName} <span className="text-gray-400 dark:text-gray-500">({tickerUpper})</span>
                </h1>
                {(data?.sector || data?.industry) && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {data.sector && (
                      <Link href={`/sectors/${encodeURIComponent(data.sector)}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                        {data.sector}
                      </Link>
                    )}
                    {data.sector && data.industry && <span className="mx-1">·</span>}
                    {data.industry && <span>{data.industry}</span>}
                  </p>
                )}
              </div>

              <div className="flex items-end gap-4">
                {price != null && (
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      ${price.toFixed(2)}
                    </div>
                    {changePct != null && (
                      <div className={`text-lg font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Key stats row */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              {marketCap != null && marketCap > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Market Cap</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                    ${marketCap >= 1000 ? `${(marketCap / 1000).toFixed(2)}T` : `${marketCap.toFixed(1)}B`}
                  </p>
                </div>
              )}
              {data?.sector && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sector</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{data.sector}</p>
                </div>
              )}
              {data?.employees != null && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Employees</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{data.employees.toLocaleString()}</p>
                </div>
              )}
              {data?.headquarters && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Headquarters</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{data.headquarters}</p>
                </div>
              )}
            </div>

            {data?.description && (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-700 pt-4">
                {data.description}
              </p>
            )}
          </div>

          {/* Full interactive analysis (client-side) */}
          <AnalysisTabClient ticker={tickerUpper} hideSearch />

          {/* SEO: Related stocks */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Explore More Stocks</h2>
            <div className="flex flex-wrap gap-2">
              {['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'V']
                .filter((t) => t !== tickerUpper)
                .map((t) => (
                  <Link
                    key={t}
                    href={`/analysis/${t}`}
                    className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              <Link href="/stocks" className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors">
                View all stocks →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

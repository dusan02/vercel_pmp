import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { formatSectorName } from '@/lib/utils/format';
import { StructuredData } from '@/components/StructuredData';
import { sectorDescriptions, defaultSectorDescription } from '@/lib/seo/sectorDescriptions';

// Revalidate every hour
export const revalidate = 3600;

interface PageProps {
    params: Promise<{ sector: string }>;
}

async function getSectorData(sectorSlug: string) {
    // Decode URL format (e.g. "Consumer%20Cyclical" -> "Consumer Cyclical")
    const decodedSector = decodeURIComponent(sectorSlug);

    const tickers = await prisma.ticker.findMany({
        where: {
            sector: decodedSector,
            lastPrice: { gt: 0 }
        },
        orderBy: [
            { lastChangePct: 'desc' }
        ],
        take: 50,
        select: {
            symbol: true,
            lastPrice: true,
            lastChangePct: true,
            lastMarketCap: true,
            name: true,
            industry: true,
            latestPrevClose: true, // Correct field
            lastMarketCapDiff: true
        }
    });

    return { sector: decodedSector, tickers };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { sector } = await params;
    const decodedSector = decodeURIComponent(sector);
    const formattedSector = formatSectorName(decodedSector);

    return generatePageMetadata({
        title: `${formattedSector} Stocks - Top Movers & Prices`,
        description: `Real-time pre-market and live prices for ${formattedSector} stocks. View top gainers, losers, and active stocks in the ${formattedSector} sector.`,
        path: `/sectors/${sector}`,
        keywords: [
            `${formattedSector} stocks`,
            `${formattedSector} sector`,
            `${formattedSector} pre-market`,
            'sector analysis',
            'stock market sectors'
        ]
    });
}

export default async function SectorPage({ params }: PageProps) {
    const { sector } = await params;
    const { sector: sectorName, tickers } = await getSectorData(sector);

    if (!tickers.length) {
        notFound();
    }

    const formattedSector = formatSectorName(sectorName);

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
                            href="/sectors"
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            Sectors
                        </Link>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                            {formattedSector}
                        </span>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {formattedSector} Stocks
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400">
                        Top performing stocks in the {formattedSector} sector
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Symbol
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Price
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Change
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                                        Market Cap
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                                        Industry
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {tickers.map((ticker) => {
                                    const changeColor = (ticker.lastChangePct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

                                    return (
                                        <tr key={ticker.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Link href={`/company/${ticker.symbol}`} className="flex flex-col">
                                                    <span className="font-medium text-gray-900 dark:text-white">{ticker.symbol}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                                                        {ticker.name}
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                                                ${ticker.lastPrice?.toFixed(2)}
                                            </td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${changeColor}`}>
                                                {(ticker.lastChangePct ?? 0) >= 0 ? '+' : ''}{(ticker.lastChangePct ?? 0).toFixed(2)}%
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                                ${((ticker.lastMarketCap ?? 0) / 1e9).toFixed(2)}B
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                                {ticker.industry}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SEO Description Section */}
                <div className="mt-12 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        About {formattedSector} Pre-market & Live Data
                    </h2>
                    <div className="prose prose-blue dark:prose-invert max-w-none text-gray-600 dark:text-gray-400 leading-relaxed">
                        <p>
                            {sectorDescriptions[sectorName] || defaultSectorDescription}
                        </p>
                        <p className="mt-4 text-sm italic border-t border-gray-100 dark:border-gray-700 pt-4">
                            Data provided by Polygon.io and Finnhub. Pre-market sessions are critical for identifying early momentum and institutional positioning before the 9:30 AM ET opening bell.
                        </p>
                    </div>
                </div>
            </main>

            <StructuredData
                pageType="home" // Using 'home' type list structure as it fits well for lists of stocks
                stocks={tickers.map(t => ({
                    ticker: t.symbol,
                    currentPrice: t.lastPrice ?? 0,
                    percentChange: t.lastChangePct ?? 0,
                    marketCap: t.lastMarketCap ?? 0,
                    companyName: t.name ?? '',
                    sector: sectorName,
                    industry: t.industry ?? '',
                    closePrice: t.latestPrevClose ?? 0, // Corrected field
                    marketCapDiff: t.lastMarketCapDiff ?? 0
                }))}
                breadcrumbs={[
                    { name: 'Home', url: 'https://premarketprice.com' },
                    { name: 'Sectors', url: 'https://premarketprice.com/sectors' },
                    { name: formattedSector, url: `https://premarketprice.com/sectors/${sector}` }
                ]}
            />
        </div>
    );
}

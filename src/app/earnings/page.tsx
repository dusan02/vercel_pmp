import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';
import { StructuredData } from '@/components/StructuredData';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const baseUrl = 'https://premarketprice.com';

// Dynamically import the earnings component (client component)
// Note: ssr: false removed - component will be client-side only by default
const TodaysEarningsFinnhub = dynamic(
  () => import('@/components/TodaysEarningsFinnhub'),
  { loading: () => <div className="p-4">Loading earnings data...</div> }
);

export const metadata: Metadata = generatePageMetadata({
  title: 'Earnings Calendar',
  description: 'Track today\'s earnings calendar and upcoming earnings reports for S&P 500 companies. Get real-time earnings announcements, EPS estimates, and revenue forecasts. Stay ahead with comprehensive earnings data.',
  path: '/earnings',
  keywords: [
    'earnings calendar',
    'earnings reports',
    'earnings announcements',
    'EPS',
    'earnings per share',
    'quarterly earnings',
    'earnings date',
    'earnings schedule',
  ],
});

export default function EarningsPage() {
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
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              Earnings Calendar
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Earnings Calendar
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Track today&apos;s earnings announcements and upcoming earnings reports
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <TodaysEarningsFinnhub />
        </div>
      </main>

      {/* Structured Data */}
      <StructuredData
        pageType="earnings"
        breadcrumbs={[
          { name: 'Home', url: baseUrl },
          { name: 'Earnings Calendar', url: `${baseUrl}/earnings` },
        ]}
      />
    </div>
  );
}


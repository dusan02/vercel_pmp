import { Metadata } from 'next';
import Link from 'next/link';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'About Us',
  description: 'Learn about PreMarketPrice, our mission to provide real-time stock data, and the technology behind our platform.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-6">
            About PreMarketPrice
          </h1>
          
          <div className="prose prose-blue dark:prose-invert max-w-none">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
              PreMarketPrice was founded with a simple mission: to democratize access to real-time pre-market stock data.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Our Mission</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              In the fast-paced world of stock trading, the period before the market opens is critical. Yet, real-time data for this session is often locked behind expensive paywalls. We provide traders and investors with the tools they need to track market movements before the bell rings.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Real-Time Data</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              We leverage advanced API integrations to bring you life-like updates on price action, volume, and market capitalization changes. Our platform is designed for speed and reliability, ensuring you never miss a mover.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Technical Excellence</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Built on modern web technologies, PreMarketPrice offers a seamless experience across desktop and mobile devices. Our proprietary heatmaps and ranking algorithms help you spot opportunities at a glance.
            </p>
            
            <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
              <h3 className="text-blue-800 dark:text-blue-300 font-semibold mb-2">Need to reach us?</h3>
              <p className="text-blue-700 dark:text-blue-400 mb-4">
                Have questions about our data or want to suggest a feature?
              </p>
              <Link 
                href="/contact" 
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

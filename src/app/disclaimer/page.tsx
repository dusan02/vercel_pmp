import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'Disclaimer',
  description: 'Financial and data disclaimer for PreMarketPrice. Learn about the risks and limitations of our stock data.',
  path: '/disclaimer',
});

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-6">
            Financial & Data Disclaimer
          </h1>
          
          <div className="prose prose-blue dark:prose-invert max-w-none">
            <p className="text-gray-600 dark:text-gray-300 mb-6 font-medium">
              Last updated: March 26, 2026
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">No Financial Advice</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              The information provided on PreMarketPrice.com is for informational purposes only and does not constitute financial, investment, or legal advice. We do not recommend buying or selling any security, and any investment decisions you make are solely your own responsibility.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Data Accuracy & Delays</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              While we strive to provide real-time data, market data can be volatile and subject to delays or technical errors. PreMarketPrice does not guarantee the accuracy, completeness, or timeliness of the information provided. Pre-market and after-hours trading sessions often have lower liquidity and higher volatility, which can lead to rapid price swings.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Risk of Trading</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Trading stocks, especially in the pre-market session, involves significant risk. You should be aware of the risks and be willing to accept them in order to invest in the stock market. Never trade with money you cannot afford to lose.
            </p>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-8 mb-4">Data Sources</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Our data is aggregated from various sources, including institutional feeds and public market APIs. We are not responsible for any losses incurred due to data inaccuracies from our providers.
            </p>
            
            <div className="mt-12 p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
              <p className="text-amber-800 dark:text-amber-300 text-sm italic">
                By using PreMarketPrice.com, you agree to these terms and acknowledge the risks associated with stock market trading.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Metadata } from 'next';
import { generatePageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = generatePageMetadata({
  title: 'Contact Us',
  description: 'Get in touch with the PreMarketPrice team for support, feedback, or business inquiries.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-6">
            Contact Us
          </h1>
          
          <div className="prose prose-blue dark:prose-invert max-w-none">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
              We value your feedback and are here to help with any questions you may have about our platform or data.
            </p>
            
            <div className="mt-10">
              <div className="p-6 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 inline-block">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Support</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  For technical issues, bug reports, or help using the platform.
                </p>
                <a 
                  href="mailto:support@premarketprice.com" 
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  support@premarketprice.com
                </a>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-12 mb-4">Response Time</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Our team typically responds to all inquiries within 24-48 business hours. We appreciate your patience and look forward to hearing from you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

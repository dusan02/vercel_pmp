import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import ErrorBoundaryWrapper from '@/components/ErrorBoundaryWrapper'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import { Providers } from './providers'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'PreMarketPrice.com - Real-time Stock Data & Earnings Calendar',
    template: '%s | PreMarketPrice.com',
  },
  description: 'Track pre-market movements and earnings calendar of 300+ global companies. Real-time stock data, market analysis, portfolio tracking, and comprehensive earnings calendar. Get live stock prices, market cap changes, and earnings reports for S&P 500 companies.',
  keywords: [
    'stocks',
    'pre-market',
    'premarket',
    'earnings',
    'earnings calendar',
    'stock market',
    'trading',
    'portfolio',
    'real-time data',
    'stock prices',
    'market cap',
    'S&P 500',
    'stock analysis',
    'financial data',
    'stock tracker',
    'market movers',
    'stock screener',
    'investment',
    'trading tools',
    'stock quotes',
  ].join(', '),
  authors: [{ name: 'PreMarketPrice Team' }],
  creator: 'PreMarketPrice.com',
  publisher: 'PreMarketPrice.com',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://premarketprice.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PreMarketPrice.com - Real-time Stock Data & Earnings Calendar',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies. Real-time stock data, market analysis, and portfolio tracking.',
    url: 'https://premarketprice.com',
    siteName: 'PreMarketPrice.com',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 1630,
        alt: 'PreMarketPrice.com - Real-time Stock Data & Earnings Calendar Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PreMarketPrice.com - Real-time Stock Data & Earnings Calendar',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies. Real-time stock data, market analysis, and portfolio tracking.',
    images: ['/og-image.png'],
    creator: '@premarketprice',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // Google verification - replace with actual verification code from Google Search Console
  // verification: {
  //   google: 'your-google-verification-code',
  // },
  // PWA specific metadata
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PreMarketPrice',
  },
  applicationName: 'PreMarketPrice',
  category: 'finance',
  classification: 'Business',
  referrer: 'origin-when-cross-origin',
  other: {
    'geo.region': 'US',
    'geo.placename': 'United States',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#2563eb',
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="PreMarketPrice" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PreMarketPrice" />
        <meta name="description" content="Track pre-market movements and earnings calendar of 300+ global companies" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#2563eb" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon.png" />

        {/* Favicons */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

        {/* Resource Hints - Preconnect to external APIs */}
        <link rel="preconnect" href="https://api.polygon.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://finnhub.io" crossOrigin="anonymous" />
        
        {/* Cache Clear Utility - Development Only */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Make cache clear utility available in console
                window.clearAllCaches = async function() {
                  // NOTE: We cannot dynamic-import TS source files in the browser under Next/Turbopack.
                  // Do the clear directly here (Cache Storage + SW + storage), then reload.
                  const keep = [];
                  try {
                    // Clear Cache Storage
                    if (typeof caches !== 'undefined' && caches.keys) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map((k) => caches.delete(k)));
                    }
                  } catch (e) {
                    console.warn('clearAllCaches: caches API failed', e);
                  }

                  try {
                    // Unregister Service Workers
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map((r) => r.unregister()));
                    }
                  } catch (e) {
                    console.warn('clearAllCaches: serviceWorker unregister failed', e);
                  }

                  try {
                    // Clear storage (keep allowlist)
                    if (keep.length === 0) {
                      localStorage.clear();
                    } else {
                      const preserved = {};
                      keep.forEach((k) => {
                        const v = localStorage.getItem(k);
                        if (v !== null) preserved[k] = v;
                      });
                      localStorage.clear();
                      Object.keys(preserved).forEach((k) => localStorage.setItem(k, preserved[k]));
                    }
                    sessionStorage.clear();
                  } catch (e) {
                    console.warn('clearAllCaches: storage clear failed', e);
                  }

                  // Reload
                  try {
                    location.reload();
                  } catch {
                    location.href = location.href;
                  }
                };
                console.log('%c🧹 Cache Clear', 'color: #3b82f6; font-weight: bold;', 'Available: window.clearAllCaches()');
              `,
            }}
          />
        )}
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${inter.className}`}>
        <Providers>
          {/* Structured Data - Organization */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'PreMarketPrice.com',
                url: 'https://premarketprice.com',
                logo: 'https://premarketprice.com/og-image.png',
                description: 'Real-time stock data, pre-market movements, and earnings calendar for 300+ global companies.',
                sameAs: [
                  'https://twitter.com/premarketprice',
                  'https://www.linkedin.com/company/premarketprice',
                ],
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'Customer Service',
                  email: 'support@premarketprice.com',
                },
              }),
            }}
          />
          {/* Structured Data - WebSite */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'PreMarketPrice.com',
                url: 'https://premarketprice.com',
                description: 'Track pre-market movements and earnings calendar of 300+ global companies. Real-time stock data, market analysis, and portfolio tracking.',
                potentialAction: {
                  '@type': 'SearchAction',
                  target: {
                    '@type': 'EntryPoint',
                    urlTemplate: 'https://premarketprice.com/?search={search_term_string}',
                  },
                  'query-input': 'required name=search_term_string',
                },
              }),
            }}
          />
          <ErrorBoundaryWrapper>
            {children}
          </ErrorBoundaryWrapper>
          <ScrollToTopButton />
        </Providers>
      </body>
    </html>
  )
}
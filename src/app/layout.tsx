import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import '../styles/mobile-optimizations.css'
import ErrorBoundaryWrapper from '@/components/ErrorBoundaryWrapper'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import { Providers } from './providers'
import { AuthProvider } from '@/components/AuthProvider'
import { GAListener } from '@/components/GAListener'
import { ChunkLoadRecovery } from '@/components/ChunkLoadRecovery'
import { WebVitalsReporter } from '@/components/WebVitalsReporter'
import { GA_ID } from '@/lib/ga'

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
    default: 'PreMarketPrice - Real-time Stock Data & Earnings Calendar',
    template: '%s | PreMarketPrice',
  },
  description: 'Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements, earnings calendar, and market analysis for 300+ US companies. Get live stock prices, market cap changes, and earnings reports for S&P 500 companies.',
  keywords: [
    'US stocks',
    'NYSE stocks',
    'NASDAQ stocks',
    'pre-market',
    'premarket',
    'pre-market live prices',
    'US stock market',
    'earnings',
    'earnings calendar',
    'stock market',
    'trading',
    'portfolio',
    'real-time data',
    'stock prices',
    'live stock prices',
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
    'US exchanges',
  ].join(', '),
  authors: [{ name: 'PreMarketPrice Team' }],
  creator: 'PreMarketPrice',
  publisher: 'PreMarketPrice',
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
    title: 'PreMarketPrice - Real-time Stock Data & Earnings Calendar',
    description: 'Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements, earnings calendar, and market analysis for 300+ US companies.',
    url: 'https://premarketprice.com',
    siteName: 'PreMarketPrice',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 1630,
        alt: 'PreMarketPrice - Real-time Stock Data & Earnings Calendar Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PreMarketPrice - Real-time Stock Data & Earnings Calendar',
    description: 'Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements, earnings calendar, and market analysis for 300+ US companies.',
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
  // Google verification - Google Search Console
  verification: {
    google: 'dmxIfnpvrtoVo9gNUq_eNM64TH7W7yUM4FnBpOL6vIs',
  },
  // PWA specific metadata
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PreMarketPrice',
  },
  applicationName: 'PreMarketPrice',
  icons: {
    icon: [
      { url: '/favicon.svg?v=4', type: 'image/svg+xml' },
      // favicon.ico removed - using SVG only to avoid 404 errors
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
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
  maximumScale: 5, // Allow zoom for accessibility
  userScalable: true, // Allow zoom for accessibility
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
        <meta name="description" content="Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements and earnings calendar of 300+ US companies." />
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

        {/* Favicons - SVG only (modern browsers support SVG favicons) */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" />

        {/* Resource Hints - Preconnect to external APIs */}
        <link rel="preconnect" href="https://api.polygon.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://finnhub.io" crossOrigin="anonymous" />
        {/* Preconnect to Google Analytics for faster loading */}
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        {/* DNS prefetch pre API endpoints (rýchlejšie načítanie) */}
        <link rel="dns-prefetch" href="/api" />
        {/* Prefetch heatmap API for faster desktop loading */}
        <link rel="prefetch" href="/api/heatmap?timeframe=day&metric=percent" as="fetch" crossOrigin="anonymous" />

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
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${inter.className} lg:mb-0 mb-16`}>
        {/* Global recovery for deploy-time chunk 404s (stale cached HTML/SW) */}
        <ChunkLoadRecovery />
        {/* RUM: Core Web Vitals reporting (sampled) */}
        <WebVitalsReporter />
        {/* Google Analytics 4 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            const debugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
            gtag('config', '${GA_ID}', {
              send_page_view: false,
              anonymize_ip: true,
              debug_mode: debugMode
            });
          `}
        </Script>
        <GAListener />
        <Providers>
          <AuthProvider>
            {/* Structured Data - Organization */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'Organization',
                  name: 'PreMarketPrice',
                  url: 'https://premarketprice.com',
                  logo: 'https://premarketprice.com/og-image.png',
                  description: 'Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements, earnings calendar, and market analysis for 300+ US companies.',
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
                  name: 'PreMarketPrice',
                  url: 'https://premarketprice.com',
                  description: 'Real-time pre-market live stock prices for US stocks traded on NYSE, NASDAQ, and other US exchanges. Track pre-market movements, earnings calendar, and market analysis for 300+ US companies.',
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
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}
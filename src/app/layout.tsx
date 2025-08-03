import type { Metadata } from 'next'
import './globals.css'
import { initializePreloading } from '@/lib/preload'
import { initializePWA } from '@/lib/sw-register'
import { blogScheduler } from '@/lib/blogScheduler'

export const metadata: Metadata = {
  title: 'Pre-Market Stock Tracking & Earnings Calendar | 300+ Global Companies - PreMarketPrice',
  description: 'Track pre-market movements and earnings calendar of 300+ global companies. Monitor EPS estimates, revenue reports, market cap changes and build your watchlist free.',
  keywords: 'pre-market stocks, earnings calendar, earnings reports, stock tracking, market cap, stock prices, global stocks, stock portfolio, pre-market trading, stock analysis, market movements, EPS tracking, revenue estimates, pre-market earnings, after-market earnings',
  authors: [{ name: 'PreMarketPrice.com' }],
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
    title: 'Pre-Market Stock Tracking & Earnings Calendar | 300+ Global Companies - PreMarketPrice',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies. Monitor EPS estimates, revenue reports, market cap changes and build your watchlist free.',
    url: 'https://premarketprice.com',
    siteName: 'PreMarketPrice.com',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PreMarketPrice.com - Stock Tracking Dashboard',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pre-Market Stock Tracking & Earnings Calendar | 300+ Global Companies - PreMarketPrice',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies. Monitor EPS estimates, revenue reports, market cap changes and build your watchlist free.',
    images: ['/og-image.png'],
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
  verification: {
    google: 'your-google-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Initialize preloading optimizations and PWA features
  if (typeof window !== 'undefined') {
    initializePreloading();
    initializePWA();
  }

  // Initialize blog scheduler (server-side only)
  if (typeof window === 'undefined') {
    blogScheduler.start();
  }

  return (
    <html lang="en">
      <head>
        {/* Preload critical resources */}
        <link rel="preload" href="/favicon.ico" as="image" type="image/x-icon" />
        <link rel="preload" href="/og-image.png" as="image" type="image/png" />
        <link rel="preload" href="https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600;700;800&display=swap" as="style" crossOrigin="anonymous" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://logo.clearbit.com" />
        <link rel="preconnect" href="https://ui-avatars.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        
        {/* Standard meta tags */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        
        {/* Structured Data - JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "PreMarketPrice.com",
              "description": "Track pre-market movements and earnings calendar of 300+ global companies. Monitor EPS estimates, revenue reports, market cap changes and build your watchlist free.",
              "url": "https://premarketprice.com",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Organization",
                "name": "PreMarketPrice.com"
              },
              "publisher": {
                "@type": "Organization",
                "name": "PreMarketPrice.com"
              },
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://premarketprice.com/?search={search_term_string}",
                "query-input": "required name=search_term_string"
              },
              "hasPart": [
                {
                  "@type": "DataCatalog",
                  "name": "Stock Market Data",
                  "description": "Real-time stock prices and market data for 300+ global companies",
                  "dataset": [
                    {
                      "@type": "Dataset",
                      "name": "Pre-market Stock Prices",
                      "description": "Pre-market trading data and price movements"
                    },
                    {
                      "@type": "Dataset", 
                      "name": "Earnings Calendar",
                      "description": "Earnings reports, EPS estimates, and revenue data"
                    }
                  ]
                }
              ]
            })
          }}
        />
      </head>
      <body>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet" />
        {children}
      </body>
    </html>
  )
} 
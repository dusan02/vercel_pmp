import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PreMarketPrice.com - Real-time Stock Data & Earnings Calendar',
  description: 'Track pre-market movements and earnings calendar of 300+ global companies. Real-time stock data, market analysis, and portfolio tracking.',
  keywords: 'stocks, pre-market, earnings, stock market, trading, portfolio, real-time data',
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
    title: 'PreMarketPrice.com - Real-time Stock Data',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies',
    url: 'https://premarketprice.com',
    siteName: 'PreMarketPrice.com',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PreMarketPrice.com - Stock Data Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PreMarketPrice.com - Real-time Stock Data',
    description: 'Track pre-market movements and earnings calendar of 300+ global companies',
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
  // PWA specific metadata
  manifest: '/manifest.json',
  themeColor: '#2563eb',
  colorScheme: 'light dark',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PreMarketPrice',
  },
  applicationName: 'PreMarketPrice',
  category: 'finance',
  classification: 'Business',
  referrer: 'origin-when-cross-origin',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
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
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="mask-icon" href="/icon-192.png" color="#2563eb" />
        <link rel="shortcut icon" href="/favicon.ico" />
        
        {/* PWA Splash Screens */}
        <link rel="apple-touch-startup-image" href="/apple-touch-icon.png" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
        <div className="pwa-app-shell">
          <div className="pwa-app-content">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
} 
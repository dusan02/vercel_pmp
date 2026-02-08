import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Environment configuration
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.polygon.io',
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
      {
        protocol: 'https',
        hostname: 'finnhub.io',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com', // For favicons
      },
      {
        protocol: 'https',
        hostname: 'icons.duckduckgo.com',
      },
    ],
  },

  // Experimental features for better performance
  experimental: {
    // optimizeCss: true, // Temporarily disabled due to critters module issue
    optimizePackageImports: ['lucide-react', 'd3-hierarchy', 'd3-scale'],
  },

  // Removed webpackDevMiddleware config - may interfere with webpack runtime

  // Turbopack configuration - disabled SVG loader to prevent webpack require issues
  // SVG handling is done via webpack config instead
  // turbopack: {
  //   rules: {
  //     '*.svg': {
  //       loaders: ['@svgr/webpack'],
  //       as: '*.js',
  //     },
  //   },
  // },

  // Fix Turbopack workspace root inference when repo contains multiple lockfiles.
  // Without this, Turbopack may scan the monorepo root and slow down dev/build.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Compression and optimization
  compress: true,
  poweredByHeader: false,
  generateEtags: false,

  // Headers for CDN and caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      // CRITICAL: Service worker script must NOT be cached long-term.
      // If /sw.js is cached as immutable, clients can keep an old SW after deploy and hit "Failed to load chunk" on navigation.
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // PWA manifest should also revalidate quickly.
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // IMPORTANT: Override global /api caching specifically for heatmap.
      // This MUST come after '/api/(.*)' so it wins when both rules match.
      {
        source: '/api/heatmap',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=10, stale-while-revalidate=30',
          },
        ],
      },
      {
        source: '/:path*.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.(webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Vary',
            value: 'Accept',
          },
        ],
      },
    ];
  },

  // Webpack configuration - REMOVED to avoid Turbopack/Webpack conflict
  // If using --turbopack, webpack config is ignored anyway
  // If not using --turbopack, Next.js handles webpack internally
  // webpack: (config, { isServer }) => { ... },

  // Output configuration for static optimization
  // output: 'standalone', // Disabled for development
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig; 
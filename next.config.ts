import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
        port: '',
        pathname: '/api/**',
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
        port: '',
        pathname: '/s2/favicons/**',
      },
      {
        protocol: 'https',
        hostname: 'icons.duckduckgo.com',
        port: '',
        pathname: '/ip3/**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Experimental features for better performance
  experimental: {
    // optimizeCss: true, // Temporarily disabled due to critters module issue
    optimizePackageImports: ['lucide-react'],
  },

  // External packages (don't bundle server-side Node.js modules)
  serverExternalPackages: ['redis', '@redis/client', 'better-sqlite3'],

  // Turbopack config (empty — silences Next.js 16 warning when webpack config is present)
  turbopack: {},

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
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
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

  // Webpack configuration for optimization
  webpack: (config, { dev, isServer }) => {
    // Fix: Redis client imports node: built-in modules which webpack can't bundle
    if (isServer) {
      config.externals = config.externals || [];
      const nodeBuiltins = [
        'node:net', 'node:tls', 'node:fs', 'node:dns', 'node:stream',
        'node:events', 'node:util', 'node:crypto', 'node:child_process',
        'node:os', 'node:path', 'node:url', 'node:zlib', 'node:http',
        'node:https', 'node:assert', 'node:buffer', 'node:querystring',
        'node:diagnostics_channel', 'node:perf_hooks', 'node:timers/promises',
      ];
      for (const mod of nodeBuiltins) {
        config.externals.push({ [mod]: `commonjs ${mod}` });
      }
    }

    // Optimize bundle size
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true,
          },
        },
      };
    }

    // SVG optimization — exclude app icons (Next.js metadata loader handles those)
    config.module.rules.push({
      test: /\.svg$/,
      exclude: /src\/app\/(icon|apple-icon|opengraph-image|twitter-image)\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },

  // Output configuration for static optimization
  output: 'standalone',
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig; 
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Environment configuration
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Image optimization for local logos
  images: {
    // No remote patterns needed - all logos are local now
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year for local assets
    unoptimized: false,
  },

  // Experimental features for better performance
  experimental: {
    // optimizeCss: true, // Temporarily disabled due to critters module issue
    optimizePackageImports: ['lucide-react'],
  },

  // Removed webpackDevMiddleware config - may interfere with webpack runtime

  // Turbopack configuration (moved from experimental)
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
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
  webpack: (config, { isServer, dev }) => {
    // Fix HMR issues in development
    if (dev && !isServer) {
      config.optimization = config.optimization || {};
      // Ensure HMR works properly
      config.watchOptions = {
        ...config.watchOptions,
        poll: false,
        ignored: /node_modules/,
      };
    }
    
    // Only add fallbacks for Node.js modules - DO NOT modify optimization.runtimeChunk
    // Modifying runtimeChunk can break Next.js webpack runtime initialization
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
      
      // Add alias for useWebSocket to prevent webpack resolution issues
      /*
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/hooks/useWebSocket': path.resolve(__dirname, 'src/lib/stubs/useWebSocket.ts'),
      };
      */
    }
    
    // Mark socket.io-client as external on server to prevent webpack from analyzing it
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('socket.io-client');
      } else if (typeof config.externals === 'object') {
        config.externals['socket.io-client'] = 'socket.io-client';
      }
    }

    // Note: Removed custom splitChunks configuration
    // Next.js handles CSS/JS chunking automatically and custom config can cause
    // MIME type errors (CSS files being loaded as scripts)
    // Next.js default splitChunks is optimized and should be used instead

    // SVG optimization
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },

  // Output configuration for static optimization
  // output: 'standalone', // Disabled for development
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig; 
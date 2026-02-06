import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Note: Cannot use Redis in edge runtime, using in-memory rate limiting instead
// import { checkRateLimit, getClientIP } from './lib/redisRateLimiter';
// Temporarily disable rateLimiter import to test if it causes Edge Runtime issues
import { rateLimit } from '@/lib/api/rateLimiter';

// Simple IP extraction for edge runtime
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIP = forwarded.split(',')[0];
    if (firstIP) {
      return firstIP.trim();
    }
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

// Static allowed origins (Edge Runtime compatible)
// Note: process.env is not available at module level in Edge Runtime
// Dynamic origins would need to be accessed inside middleware function
const ALLOWED_ORIGINS = [
  'https://premarketprice.com',
  'https://www.premarketprice.com',
  'https://capmovers.com',
  'https://gainerslosers.com',
  'https://stockcv.com',
  'http://localhost:3000'
];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // CORS headers
  // Note: In Edge Runtime, we can't use process.env at module level
  // For dynamic origins, we'd need to use Edge Config or similar
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Don't expose version info
  response.headers.delete('X-Powered-By');

  // Rate limiting for API routes (Edge-safe, in-memory best effort).
  // Exempt internal/sensitive operational endpoints that are already protected via CRON auth.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const path = request.nextUrl.pathname;

    const exempt =
      path.startsWith('/api/cron/') ||
      path.startsWith('/api/health') ||
      path.startsWith('/api/metrics') ||
      path.startsWith('/api/websocket');

    if (!exempt) {
      try {
        const ip = getClientIP(request);
        const isLocalhost =
          ip === '127.0.0.1' ||
          ip === '::1' ||
          ip === 'unknown' ||
          request.nextUrl.hostname === 'localhost';

        // Heatmap endpoint has higher limits (DB-heavy, but no external API calls)
        const isHeatmapEndpoint = path === '/api/heatmap';

        let maxRequests: number;
        if (isHeatmapEndpoint) {
          maxRequests = isLocalhost ? 1000 : 500; // per minute
        } else {
          maxRequests = isLocalhost ? 300 : 120; // per minute
        }
        const windowMs = 60_000;

        const isAllowed = rateLimit(`${ip}:${path.split('/').slice(0, 3).join('/')}`, { maxRequests, windowMs });

        if (!isAllowed) {
          return NextResponse.json(
            {
              success: false,
              error: 'Rate limit exceeded',
              message: `Too many requests. Limit: ${maxRequests} per minute.`
            },
            {
              status: 429,
              headers: {
                'Retry-After': '60',
                'X-RateLimit-Limit': maxRequests.toString(),
                'X-RateLimit-Remaining': '0'
              }
            }
          );
        }
      } catch {
        // If rate limiting fails, allow request (best-effort).
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};


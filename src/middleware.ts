import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Note: Cannot use Redis in edge runtime, using in-memory rate limiting instead
// import { checkRateLimit, getClientIP } from './lib/redisRateLimiter';
import { rateLimit } from './lib/rateLimiter';

// Simple IP extraction for edge runtime
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

// Allowed origins for CORS (from environment variable)
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
  }
  
  // Fallback to default origins if not configured
  return [
    'https://premarketprice.com',
    'https://www.premarketprice.com',
    'https://capmovers.com',
    'https://gainerslosers.com',
    'https://stockcv.com',
    'http://localhost:3000'
  ];
}

const ALLOWED_ORIGINS = getAllowedOrigins();

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // CORS headers
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

  // Rate limiting for API routes - using in-memory rate limiter (edge runtime compatible)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    try {
      const ip = getClientIP(request);
      const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'unknown' || request.nextUrl.hostname === 'localhost';
      
      // Higher limits for localhost/development
      const maxRequests = isLocalhost ? 300 : 100; // 300/min for localhost, 100/min for production
      const windowMs = 60000; // 1 minute
      
      const isAllowed = rateLimit(ip, { maxRequests, windowMs });
      
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
    } catch (error) {
      // If rate limiting fails, allow request but log error
      console.error('Rate limiting error:', error);
      // Continue with request
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


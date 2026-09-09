import { NextRequest, NextResponse } from 'next/server';
import { validateRequest, getClientIP, detectSuspiciousActivity, logSecurityEvent, securityHeaders } from '../security/security';

// Rate limiting store (in-memory for now, should use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${ip}:${windowMs}`;
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

export function middleware(request: NextRequest) {
  const ip = getClientIP(request);
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Apply security headers
  const response = NextResponse.next();

  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  // CORS headers
  response.headers.set('Access-Control-Allow-Origin',
    process.env.NODE_ENV === 'production'
      ? 'https://premarketprice.com'
      : 'http://localhost:3002'
  );
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  response.headers.set('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response;
  }

  // Detect suspicious activity
  if (detectSuspiciousActivity(request)) {
    const userAgent = request.headers.get('User-Agent');
    const event: any = {
      type: 'suspicious_activity',
      ip,
      endpoint: request.url
    };
    if (userAgent) {
      event.userAgent = userAgent;
    }
    logSecurityEvent(event);

    // Return 403 for suspicious requests
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Rate limiting for different endpoints
  let rateLimitPassed = true;

  if (pathname.startsWith('/api/auth/')) {
    // Auth endpoints: 5 requests per 15 minutes
    rateLimitPassed = checkRateLimit(ip, 5, 15 * 60 * 1000);
  } else if (pathname.startsWith('/api/background/')) {
    // Background service endpoints: 10 requests per minute
    rateLimitPassed = checkRateLimit(ip, 10, 60 * 1000);
  } else if (pathname.startsWith('/api/')) {
    // General API endpoints: 100 requests per 15 minutes
    rateLimitPassed = checkRateLimit(ip, 100, 15 * 60 * 1000);
  } else if (pathname === '/') {
    // Main page: 200 requests per 15 minutes
    rateLimitPassed = checkRateLimit(ip, 200, 15 * 60 * 1000);
  }

  if (!rateLimitPassed) {
    const userAgent2 = request.headers.get('User-Agent');
    const event2: any = {
      type: 'rate_limit_exceeded',
      ip,
      endpoint: request.url
    };
    if (userAgent2) {
      event2.userAgent = userAgent2;
    }
    logSecurityEvent(event2);

    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': '900', // 15 minutes
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }
    });
  }

  // API key validation for protected endpoints
  if (pathname.startsWith('/api/background/') || pathname.startsWith('/api/admin/')) {
    const validation = validateRequest(request);

    if (!validation.isValid) {
      const userAgent3 = request.headers.get('User-Agent');
      const event3: any = {
        type: 'invalid_api_key',
        ip,
        endpoint: request.url
      };
      if (userAgent3) {
        event3.userAgent = userAgent3;
      }
      logSecurityEvent(event3);

      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  // Add rate limit headers to response
  const key = `${ip}:${15 * 60 * 1000}`;
  const record = rateLimitStore.get(key);

  if (record) {
    response.headers.set('X-RateLimit-Limit', '100');
    response.headers.set('X-RateLimit-Remaining', Math.max(0, 100 - record.count).toString());
    response.headers.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
  }

  return response;
}

// NOTE: This file is not a Next.js `middleware.ts` entrypoint (it's not located at `src/middleware.ts`).
// Keeping a `config` export here can confuse newer Next.js builds that validate "segment configuration exports".
// If this module is ever reused, prefer exporting plain helpers instead of Next special exports.
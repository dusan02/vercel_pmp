import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { NextRequest, NextResponse } from 'next/server';

// Rate limiting configuration
export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100, // limit each IP to 100 requests per windowMs
    message: options.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: options.standardHeaders !== false, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: options.legacyHeaders !== false, // Disable the `X-RateLimit-*` headers
  });
};

// Specific rate limiters for different endpoints
export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.',
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts from this IP, please try again later.',
});

export const backgroundServiceLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 background service requests per minute
  message: 'Too many background service requests from this IP, please try again later.',
});

// CORS configuration
export const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://premarketprice.com', 'https://www.premarketprice.com']
    : ['http://localhost:3000', 'http://localhost:3002', 'http://127.0.0.1:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
};

// API Key validation
const VALID_API_KEYS = new Set([
  process.env.ADMIN_API_KEY,
  process.env.PARTNER_API_KEY,
  process.env.MONITORING_API_KEY,
].filter(Boolean));

export function validateApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false;
  return VALID_API_KEYS.has(apiKey);
}

// Security headers middleware
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': process.env.NODE_ENV === 'production' 
    ? 'max-age=31536000; includeSubDomains; preload' 
    : undefined,
};

// Request validation middleware for Next.js API routes
export function validateRequest(request: NextRequest): {
  isValid: boolean;
  error?: string;
  apiKey?: string;
} {
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  // Check if API key is required for this endpoint
  const url = new URL(request.url);
  const isProtectedEndpoint = url.pathname.startsWith('/api/background/') || 
                             url.pathname.startsWith('/api/admin/') ||
                             url.pathname.includes('/control');

  if (isProtectedEndpoint && !validateApiKey(apiKey)) {
    return {
      isValid: false,
      error: 'Invalid or missing API key',
    };
  }

  return {
    isValid: true,
    apiKey,
  };
}

// IP address extraction (handles proxy headers)
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('X-Forwarded-For');
  const realIP = request.headers.get('X-Real-IP');
  const cfConnectingIP = request.headers.get('CF-Connecting-IP');
  
  if (cfConnectingIP) return cfConnectingIP;
  if (realIP) return realIP;
  if (forwarded) return forwarded.split(',')[0].trim();
  
  return 'unknown';
}

// Request logging for security monitoring
export function logSecurityEvent(event: {
  type: 'rate_limit_exceeded' | 'invalid_api_key' | 'suspicious_activity' | 'auth_failure';
  ip: string;
  endpoint: string;
  userAgent?: string;
  details?: any;
}) {
  const timestamp = new Date().toISOString();
  console.log(`[SECURITY] ${timestamp} - ${event.type.toUpperCase()}:`, {
    ip: event.ip,
    endpoint: event.endpoint,
    userAgent: event.userAgent,
    details: event.details,
  });

  // Store event in memory for API access
  try {
    const { addSecurityEvent } = require('@/lib/security-events');
    addSecurityEvent(event);
  } catch (error) {
    console.error('Failed to store security event:', error);
  }
}

// DDoS protection - simple request pattern detection
export function detectSuspiciousActivity(request: NextRequest): boolean {
  const userAgent = request.headers.get('User-Agent') || '';
  const ip = getClientIP(request);
  
  // Check for common bot patterns
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious) {
    logSecurityEvent({
      type: 'suspicious_activity',
      ip,
      endpoint: request.url,
      userAgent,
      details: { pattern: 'suspicious_user_agent' },
    });
  }
  
  return isSuspicious;
}

// Export CORS function for Next.js
export function corsMiddleware() {
  return cors(corsOptions);
} 
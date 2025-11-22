import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { redisClient } from '@/lib/redis/client';
import { getLogoUrl } from '@/lib/utils/getLogoUrl';

/**
 * Logo Proxy API - Caches and optimizes logo loading
 */

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<NextResponse>>();

// Helper to check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Generate ETag from buffer
function generateETag(buffer: Buffer): string {
  return `"${createHash('md5').update(buffer).digest('hex').substring(0, 16)}"`;
}

// Logo URL patterns (adjust based on your logo source)
const LOGO_URLS = {
  // Clearbit logo API
  clearbit: (symbol: string) => `https://logo.clearbit.com/${symbol.toLowerCase()}.com`,
  // Alternative: Polygon logo (if available)
  polygon: (symbol: string) => `https://api.polygon.io/v2/reference/tickers/${symbol}/logo`,
  // Your CDN (if you host logos)
  cdn: (symbol: string) => `https://cdn.yoursite.com/logos/${symbol.toLowerCase()}.png`
};

// Default logo source
const DEFAULT_SOURCE = 'clearbit';

/**
 * Generate SVG placeholder
 */
function generatePlaceholderSVG(symbol: string, size: number): string {
  const initial = symbol.charAt(0).toUpperCase();
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  const fontSize = Math.max(8, size * 0.4);

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${color}" rx="4"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" 
          fill="white" text-anchor="middle" dominant-baseline="central">${initial}</text>
  </svg>`;
}

// Helper to create response with ETag
function createResponse(
  body: string | Buffer,
  headers: Record<string, string>,
  etag?: string
): NextResponse {
  const response = new NextResponse(body as any, { headers });

  if (etag) {
    response.headers.set('ETag', etag);
  }

  return response;
}

// Check ETag and return 304 if unchanged
function checkETag(req: NextRequest, etag: string, cacheControl?: string): NextResponse | null {
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': cacheControl || 'public, max-age=86400'
      }
    });
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();

  try {
    const { symbol: symbolParam } = await params;
    const symbol = symbolParam?.toUpperCase();

    // Parse size parameter (default: 32, clamp between 16-64)
    const url = new URL(req.url);
    const sizeParam = parseInt(url.searchParams.get('s') || '32', 10);
    const size = Math.max(16, Math.min(64, sizeParam));

    // Create cache key for deduplication
    const cacheKey = `logo:${symbol}:${size}`;

    // Check if request is already in-flight
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)!;
    }

    // Validate symbol
    if (!symbol || symbol.length === 0 || symbol.length > 10) {
      const placeholder = generatePlaceholderSVG('?', size);
      const svgBuffer = Buffer.from(placeholder);
      const etag = generateETag(svgBuffer);

      const notModified = checkETag(req, etag, 'public, max-age=86400, stale-while-revalidate=86400');
      if (notModified) return notModified;

      return createResponse(placeholder, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
        'X-Logo-Status': 'placeholder',
        'X-Logo-Size': size.toString(),
        'X-Logo-Duration-ms': (Date.now() - startTime).toString()
      }, etag);
    }

    // Create promise for this request
    const requestPromise = (async (): Promise<NextResponse> => {
      try {
        // 1. Try static file first
        const staticPath = join(process.cwd(), 'public', 'logos', `${symbol.toLowerCase()}-${size}.webp`);
        if (await fileExists(staticPath)) {
          const fileBuffer = await readFile(staticPath);
          const etag = generateETag(fileBuffer);

          const notModified = checkETag(req, etag, 'public, max-age=31536000, immutable');
          if (notModified) return notModified;

          return createResponse(fileBuffer, {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Logo-Status': 'static',
            'X-Logo-Size': size.toString(),
            'X-Logo-Format': 'webp',
            'X-Logo-Duration-ms': (Date.now() - startTime).toString()
          }, etag);
        }

        // 2. Try Redis cache for binary image
        if (redisClient && redisClient.isOpen) {
          try {
            const redisKey = `logo:img:${symbol}:${size}`;
            const cachedBuffer = await redisClient.get(redisKey);
            if (cachedBuffer) {
              // Handle both Buffer and string responses from Redis
              const buffer = Buffer.isBuffer(cachedBuffer)
                ? cachedBuffer
                : Buffer.from(cachedBuffer);
              const etag = generateETag(buffer);

              const notModified = checkETag(req, etag, 'public, max-age=86400, stale-while-revalidate=86400');
              if (notModified) return notModified;

              return createResponse(buffer, {
                'Content-Type': 'image/webp',
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
                'X-Logo-Status': 'redis',
                'X-Logo-Size': size.toString(),
                'X-Logo-Format': 'webp',
                'X-Logo-Duration-ms': (Date.now() - startTime).toString()
              }, etag);
            }
          } catch (redisError) {
            // Redis error, continue to external fetch
            console.warn(`Redis cache miss for ${symbol}:${size}:`, redisError);
          }
        }

        // 3. Try Redis cache for URL
        let logoUrl: string | null = null;
        if (redisClient && redisClient.isOpen) {
          try {
            const urlKey = `logo:url:${symbol}`;
            const cachedUrl = await redisClient.get(urlKey);
            if (cachedUrl) {
              logoUrl = cachedUrl.toString();
            }
          } catch (redisError) {
            // Continue to resolve URL
          }
        }

        // 4. Resolve logo URL if not cached
        if (!logoUrl) {
          logoUrl = getLogoUrl(symbol);
          // Cache URL for 24h
          if (redisClient && redisClient.isOpen) {
            try {
              await redisClient.setEx(`logo:url:${symbol}`, 86400, logoUrl);
            } catch (redisError) {
              // Ignore cache errors
            }
          }
        }

        // 5. Fetch from external API with retry
        try {
          let response;
          let lastError;

          // Try up to 2 times
          for (let i = 0; i < 2; i++) {
            try {
              response = await fetch(logoUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; PreMarketPrice/1.0)'
                },
                signal: AbortSignal.timeout(8000) // Increased to 8s
              });

              if (response.ok) break;
            } catch (e) {
              lastError = e;
              // Wait 500ms before retry
              if (i === 0) await new Promise(r => setTimeout(r, 500));
            }
          }

          if (response && response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            const imageBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(imageBuffer);

            // Cache in Redis for 24h
            if (redisClient && redisClient.isOpen) {
              try {
                await redisClient.setEx(`logo:img:${symbol}:${size}`, 86400, buffer);
              } catch (redisError) {
                // Ignore cache errors
              }
            }

            const etag = generateETag(buffer);
            const notModified = checkETag(req, etag, 'public, max-age=86400, stale-while-revalidate=86400');
            if (notModified) return notModified;

            const contentType = response.headers.get('content-type') || 'image/png';
            return createResponse(buffer, {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
              'X-Logo-Status': 'external',
              'X-Logo-Source': 'api',
              'X-Logo-Size': size.toString(),
              'X-Logo-Format': contentType.split('/')[1] || 'unknown',
              'X-Logo-Duration-ms': (Date.now() - startTime).toString()
            }, etag);
          } else if (lastError) {
            throw lastError;
          }
        } catch (fetchError) {
          console.warn(`Failed to fetch logo for ${symbol} from external API:`, fetchError);
        }

        // 6. Fallback: return placeholder SVG
        const placeholder = generatePlaceholderSVG(symbol, size);
        const svgBuffer = Buffer.from(placeholder);
        const etag = generateETag(svgBuffer);

        const notModified = checkETag(req, etag, 'public, max-age=3600, stale-while-revalidate=86400');
        if (notModified) return notModified;

        return createResponse(placeholder, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'X-Logo-Status': 'fallback',
          'X-Logo-Size': size.toString(),
          'X-Logo-Format': 'svg',
          'X-Logo-Duration-ms': (Date.now() - startTime).toString()
        }, etag);

      } catch (error) {
        console.error(`Error processing logo for ${symbol}:${size}:`, error);
        throw error;
      }
    })();

    // Store promise for deduplication
    inFlightRequests.set(cacheKey, requestPromise);

    // Clean up after request completes
    requestPromise.finally(() => {
      inFlightRequests.delete(cacheKey);
    });

    return requestPromise;

  } catch (error) {
    const { symbol: symbolParam } = await params;
    console.error(`Error in logo API for ${symbolParam}:`, error);

    // Return error placeholder
    const placeholder = generatePlaceholderSVG('?', 32);
    return createResponse(placeholder, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=60',
      'X-Logo-Status': 'error',
      'X-Logo-Duration-ms': (Date.now() - startTime).toString()
    });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { redisClient } from '@/lib/redis/client';
import { getLogoCandidates } from '@/lib/utils/getLogoUrl';
import { prisma } from '@/lib/db/prisma';

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
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  const pad = Math.max(2, Math.round(size * 0.12));
  const stroke = Math.max(1.5, Math.round(size * 0.07));
  const radius = Math.max(3, Math.round(size * 0.18));

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${color}" rx="${radius}"/>
    <!-- simple "building" glyph to avoid text-based placeholders -->
    <g opacity="0.95" fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M ${pad} ${size - pad} H ${size - pad}" />
      <path d="M ${Math.round(size * 0.25)} ${size - pad} V ${Math.round(size * 0.32)}" />
      <path d="M ${Math.round(size * 0.25)} ${Math.round(size * 0.32)} H ${Math.round(size * 0.72)} V ${size - pad}" />
      <path d="M ${Math.round(size * 0.40)} ${Math.round(size * 0.46)} V ${Math.round(size * 0.86)}" />
      <path d="M ${Math.round(size * 0.56)} ${Math.round(size * 0.46)} V ${Math.round(size * 0.86)}" />
    </g>
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

        // 3. Try Redis cache for preferred URL
        let cachedPreferredUrl: string | null = null;
        if (redisClient && redisClient.isOpen) {
          try {
            const urlKey = `logo:url:${symbol}`;
            const cachedUrl = await redisClient.get(urlKey);
            if (cachedUrl) {
              cachedPreferredUrl = cachedUrl.toString();
            }
          } catch (redisError) {
            // Continue to resolve URL
          }
        }

        // 4. DB-backed logoUrl (best source if we have it)
        let dbLogoUrl: string | null = null;
        try {
          const row = await prisma.ticker.findUnique({
            where: { symbol },
            select: { logoUrl: true }
          });
          dbLogoUrl = (row?.logoUrl ?? '').trim() || null;
        } catch {
          // DB not available or not configured; ignore
        }

        // 4a. Finnhub (Preferred external source - High Quality)
        let finnhubLogoUrl: string | null = null;
        const finnhubKey = process.env.FINNHUB_API_KEY;
        if (finnhubKey) {
          try {
            const fhUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${finnhubKey}`;
            const r = await fetch(fhUrl, { signal: AbortSignal.timeout(5000) });
            if (r.ok) {
              const j: any = await r.json();
              // Finnhub logos are often nice squared icons
              if (j && j.logo && typeof j.logo === 'string' && j.logo.startsWith('http')) {
                // Fix: Finnhub returns http:// sometimes, force https
                finnhubLogoUrl = j.logo.replace(/^http:\/\//i, 'https://');

                // Persist to DB (update if better)
                try {
                  await prisma.ticker.upsert({
                    where: { symbol },
                    update: { logoUrl: finnhubLogoUrl },
                    create: { symbol, logoUrl: finnhubLogoUrl }
                  });
                } catch { }
              }
            }
          } catch (e) {
            // ignore finnhub errors
          }
        }

        // 5. Polygon branding fallback (for SP500 tickers without domain mapping)
        let polygonLogoUrl: string | null = null;
        let derivedDomain: string | null = null;
        const polygonKey = process.env.POLYGON_API_KEY;
        if (!dbLogoUrl && polygonKey) {
          try {
            const refUrl = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${polygonKey}`;
            const r = await fetch(refUrl, { signal: AbortSignal.timeout(5000) });
            if (r.ok) {
              const j: any = await r.json();
              const res = j?.results;
              const branding = res?.branding;
              const homepageUrl = (res?.homepage_url ?? res?.homepageUrl ?? '') as string;
              // Prefer icon_url for table/list usage (wordmark logo_url often becomes unreadable at small sizes)
              const rawLogo = (branding?.icon_url ?? branding?.logo_url ?? '') as string;

              if (homepageUrl) {
                try {
                  const u = new URL(homepageUrl);
                  derivedDomain = u.hostname.replace(/^www\./i, '') || null;
                } catch {
                  // ignore
                }
              }

              if (rawLogo) {
                let normalized = rawLogo.trim();
                if (normalized.startsWith('//')) normalized = `https:${normalized}`;
                // If polygon-hosted URL requires key, append it (server-side only)
                if (normalized.includes('api.polygon.io') && !normalized.includes('apiKey=') && polygonKey) {
                  normalized += (normalized.includes('?') ? '&' : '?') + `apiKey=${polygonKey}`;
                }
                polygonLogoUrl = normalized;

                // Persist into DB for future (best-effort)
                try {
                  await prisma.ticker.upsert({
                    where: { symbol },
                    update: { logoUrl: polygonLogoUrl },
                    create: { symbol, logoUrl: polygonLogoUrl }
                  });
                } catch {
                  // ignore DB write errors
                }
              }
            }
          } catch {
            // ignore polygon errors
          }
        }

        // 6. Resolve logo URLs (candidates)
        const domainCandidates = derivedDomain
          ? [
            `https://logo.clearbit.com/${derivedDomain}?size=${size}`,
            `https://www.google.com/s2/favicons?domain=${derivedDomain}&sz=${size}`,
            `https://icons.duckduckgo.com/ip3/${derivedDomain}.ico`,
          ]
          : [];

        const logoCandidates = Array.from(
          new Set(
            [
              ...(cachedPreferredUrl ? [cachedPreferredUrl] : []),
              ...(finnhubLogoUrl ? [finnhubLogoUrl] : []),
              ...(dbLogoUrl ? [dbLogoUrl] : []),
              ...(polygonLogoUrl ? [polygonLogoUrl] : []),
              ...domainCandidates,
              ...getLogoCandidates(symbol, size),
            ].filter(Boolean)
          )
        );

        // 7. Try each candidate URL until one works
        try {
          let response;
          let lastError;
          let successUrl = null;

          for (let candidateUrl of logoCandidates) {
            // If candidate is polygon-hosted and missing apiKey, append (server-side only)
            if (candidateUrl.includes('api.polygon.io') && !candidateUrl.includes('apiKey=') && polygonKey) {
              candidateUrl += (candidateUrl.includes('?') ? '&' : '?') + `apiKey=${polygonKey}`;
            }
            // Try up to 2 times per candidate
            for (let i = 0; i < 2; i++) {
              try {
                // If we already found a working URL in previous iterations, no need to continue (logic handled by break outer loop)

                // Skip ui-avatars fallback here, we handle fallback separately at the end (or we can let it be fetched if it's the last candidate)
                // Actually, fetch ui-avatars is fine if it's in the list.

                response = await fetch(candidateUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; PreMarketPrice/1.0)'
                  },
                  signal: AbortSignal.timeout(5000) // 5s timeout per attempt
                });

                if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
                  successUrl = candidateUrl;
                  break; // Break retry loop
                }
              } catch (e) {
                lastError = e;
                // Wait 200ms before retry
                if (i === 0) await new Promise(r => setTimeout(r, 200));
              }
            }

            if (successUrl) break; // Break candidate loop
          }

          if (response && response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            const imageBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(imageBuffer);

            // Cache in Redis for 24h
            if (redisClient && redisClient.isOpen) {
              try {
                await redisClient.setEx(`logo:img:${symbol}:${size}`, 86400, buffer);
                // Also cache the working URL so we can skip candidate resolution next time (optional optimization)
                if (successUrl) {
                  await redisClient.setEx(`logo:url:${symbol}`, 86400, successUrl);
                }
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
              'X-Logo-Source': successUrl?.includes('clearbit') ? 'clearbit' : (successUrl?.includes('google') ? 'google' : 'other'),
              'X-Logo-Size': size.toString(),
              'X-Logo-Format': contentType.split('/')[1] || 'unknown',
              'X-Logo-Duration-ms': (Date.now() - startTime).toString()
            }, etag);
          } else if (lastError) {
            // Log only if all candidates failed
            console.warn(`Failed to fetch logo for ${symbol} from all candidates. Last error:`, lastError);
          }
        } catch (fetchError) {
          console.warn(`Unexpected error fetching logo for ${symbol}:`, fetchError);
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


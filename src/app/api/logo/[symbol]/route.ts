
import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import { redisClient } from '@/lib/redis/client';
import { prisma } from '@/lib/db/prisma';
import { LogoFetcher } from '@/lib/services/logoFetcher';

const logoFetcher = new LogoFetcher(prisma);

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

// Check ETag
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

function createResponse(body: string | Buffer, headers: Record<string, string>, etag?: string): NextResponse {
  const response = new NextResponse(body as any, { headers });
  if (etag) response.headers.set('ETag', etag);
  return response;
}

function generatePlaceholderSVG(symbol: string, size: number): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  const radius = Math.max(3, Math.round(size * 0.18));
  const fontSize = Math.round(size * 0.4);

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${color}" rx="${radius}"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${fontSize}" fill="white">${symbol.substring(0, 2)}</text>
  </svg>`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const startTime = Date.now();

  try {
    const { symbol: symbolParam } = await params;
    const symbol = symbolParam?.toUpperCase();

    const url = new URL(req.url);
    const sizeParam = parseInt(url.searchParams.get('s') || '32', 10);
    const size = Math.max(16, Math.min(64, sizeParam));

    const cacheKey = `logo:${symbol}:${size}`;

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)!;
    }

    if (!symbol || symbol.length > 10) {
      // Invalid symbol fallback
      const placeholder = generatePlaceholderSVG('?', size);
      return createResponse(placeholder, { 'Content-Type': 'image/svg+xml' });
    }

    const requestPromise = (async (): Promise<NextResponse> => {
      // 1. Static File (Fastest)
      const staticPath = join(process.cwd(), 'public', 'logos', `${symbol.toLowerCase()}-${size}.webp`);
      if (await fileExists(staticPath)) {
        const buffer = await readFile(staticPath);
        const etag = generateETag(buffer);
        const notModified = checkETag(req, etag, 'public, max-age=31536000, immutable');
        if (notModified) return notModified;
        return createResponse(buffer, {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Logo-Source': 'static'
        }, etag);
      }

      // 2. Redis Cache
      if (redisClient?.isOpen) {
        const cached = await redisClient.get(`logo:img:${symbol}:${size}`);
        if (cached) {
          const buffer = Buffer.isBuffer(cached) ? cached : Buffer.from(cached);
          const etag = generateETag(buffer);
          const notModified = checkETag(req, etag);
          if (notModified) return notModified;
          return createResponse(buffer, {
            'Content-Type': 'image/webp', // Assuming we cache webp/png
            'Cache-Control': 'public, max-age=86400',
            'X-Logo-Source': 'redis'
          }, etag);
        }
      }

      // 3. DB URL (if valid URL, direct redirect or proxy? Here we proxy to keep it simple/consistent)
      const dbRow = await prisma.ticker.findUnique({ where: { symbol }, select: { logoUrl: true } });
      if (dbRow?.logoUrl && dbRow.logoUrl.startsWith('/logos/')) {
        // Only redirect if it's a local path we somehow missed (shouldn't happen if static check passed)
        return NextResponse.redirect(new URL(dbRow.logoUrl, req.url));
      }

      // 4. Live Fetch (LogoFetcher)
      try {
        const result = await logoFetcher.fetchBuffer(symbol);
        if (result) {
          const etag = generateETag(result.buffer);

          // Cache in Redis
          if (redisClient?.isOpen) {
            await redisClient.setEx(`logo:img:${symbol}:${size}`, 86400, result.buffer);
          }

          return createResponse(result.buffer, {
            'Content-Type': result.contentType,
            'Cache-Control': 'public, max-age=86400',
            'X-Logo-Source': `live-${result.source}`
          }, etag);
        }
      } catch (e) {
        console.error(`Live fetch failed for ${symbol}:`, e);
      }

      // 5. Fallback Placeholder
      const placeholder = generatePlaceholderSVG(symbol, size);
      const svgBuffer = Buffer.from(placeholder);
      const etag = generateETag(svgBuffer);
      return createResponse(placeholder, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
        'X-Logo-Source': 'fallback'
      }, etag);

    })();

    inFlightRequests.set(cacheKey, requestPromise);
    requestPromise.finally(() => inFlightRequests.delete(cacheKey));
    return requestPromise;

  } catch (e) {
    console.error(`Error in logo API:`, e);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

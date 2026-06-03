
import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, access } from 'fs/promises';
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

      // 1b. Static SVG file (from simple-icons, saved on previous live fetch)
      const staticSvgPath = join(process.cwd(), 'public', 'logos', `${symbol.toLowerCase()}.svg`);
      if (await fileExists(staticSvgPath)) {
        const content = await readFile(staticSvgPath, 'utf8');
        return createResponse(content, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Logo-Source': 'static-svg'
        });
      }

      // 2. Redis Cache (base64-encoded to avoid binary corruption)
      if (redisClient?.isOpen) {
        const cached = await redisClient.get(`logo:b64:${symbol}`);
        if (cached) {
          const buffer = Buffer.from(cached, 'base64');
          const etag = generateETag(buffer);
          const notModified = checkETag(req, etag);
          if (notModified) return notModified;
          const isSvg = cached.startsWith('PHN2Zy') || cached.startsWith('PHN2'); // base64 of '<svg'
          return createResponse(isSvg ? buffer.toString('utf8') : buffer, {
            'Content-Type': isSvg ? 'image/svg+xml' : 'image/webp',
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
          const isSvg = result.contentType.includes('svg');

          // Cache in Redis as base64 (binary-safe)
          if (redisClient?.isOpen) {
            await redisClient.setEx(`logo:b64:${symbol}`, 86400 * 7, result.buffer.toString('base64'));
          }

          // Persist to static file so future requests skip Redis/live fetch entirely
          if (isSvg) {
            // Save SVG directly (e.g. simple-icons result)
            const svgPath = join(process.cwd(), 'public', 'logos', `${symbol.toLowerCase()}.svg`);
            writeFile(svgPath, result.buffer.toString('utf8')).catch(() => {});
          } else {
            // Save bitmap as WebP (fire-and-forget)
            logoFetcher.saveBufferPublic(symbol, result.buffer).catch(() => {});
          }

          return createResponse(isSvg ? result.buffer.toString('utf8') : result.buffer, {
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

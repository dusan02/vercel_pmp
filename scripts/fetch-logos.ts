#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import * as si from 'simple-icons';
import { PrismaClient } from '@prisma/client';

// Minimal .env loader
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = await fs.readFile(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('✅ Loaded .env file');
  } catch (e) {
    console.warn('⚠️ Could not load .env file:', e);
  }
}

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');
const BATCH_SIZE = 5; // Conservative batch size for external APIs
const TIMEOUT = 10000;

// API Keys (will be populated after loadEnv)
let POLYGON_API_KEY: string | undefined;
let FINNHUB_API_KEY: string | undefined;

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function fetchWithTimeout(url: string, timeout = TIMEOUT, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PMPLogoBot/1.0)',
        ...headers
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function saveBufferToWebP(buffer: Buffer, ticker: string): Promise<string> {
  const size = 32;
  const filename = `${ticker.toLowerCase()}-${size}.webp`;
  const filepath = path.join(LOGOS_DIR, filename);

  const sizeLarge = 64;
  const filenameLarge = `${ticker.toLowerCase()}-${sizeLarge}.webp`;
  const filepathLarge = path.join(LOGOS_DIR, filenameLarge);

  try {
    // Save 32px
    await sharp(buffer)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(filepath);

    // Save 64px
    await sharp(buffer)
      .resize(sizeLarge, sizeLarge, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(filepathLarge);

    return `/logos/${filename}`;
  } catch (e) {
    console.error(`Error saving image for ${ticker}:`, e);
    throw e;
  }
}

// ------------------------------------------------------------------
// Fetch Strategies
// ------------------------------------------------------------------

// 1. Polygon API
async function fetchFromPolygon(ticker: string): Promise<{ buffer: Buffer, domain?: string } | null> {
  if (!POLYGON_API_KEY) return null;

  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results;
    if (!results) return null;

    // Get domain if available
    let domain: string | undefined;
    if (results.homepage_url) {
      try {
        domain = new URL(results.homepage_url).hostname.replace(/^www\./, '');
      } catch { }
    }

    // Try to get icon/logo
    const branding = results.branding;
    const logoUrl = branding?.icon_url || branding?.logo_url;

    if (logoUrl) {
      let normalizedUrl = logoUrl.trim();
      if (normalizedUrl.startsWith('//')) normalizedUrl = `https:${normalizedUrl}`;
      if (normalizedUrl.includes('api.polygon.io') && !normalizedUrl.includes('apiKey=')) {
        normalizedUrl += (normalizedUrl.includes('?') ? '&' : '?') + `apiKey=${POLYGON_API_KEY}`;
      }

      const imgRes = await fetchWithTimeout(normalizedUrl);
      if (imgRes.ok && imgRes.headers.get('content-type')?.startsWith('image/')) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        return { buffer, domain };
      }
    }

    return domain ? { buffer: Buffer.alloc(0), domain } : null; // Return domain even if no image
  } catch (e) {
    return null;
  }
}

// 2. Finnhub API
async function fetchFromFinnhub(ticker: string): Promise<{ buffer: Buffer, domain?: string } | null> {
  if (!FINNHUB_API_KEY) return null;

  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || (!data.logo && !data.weburl)) return null;

    let domain: string | undefined;
    if (data.weburl) {
      try {
        domain = new URL(data.weburl).hostname.replace(/^www\./, '');
      } catch { }
    }

    if (data.logo) {
      const imgRes = await fetchWithTimeout(data.logo);
      if (imgRes.ok && imgRes.headers.get('content-type')?.startsWith('image/')) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        return { buffer, domain };
      }
    }

    return domain ? { buffer: Buffer.alloc(0), domain } : null;
  } catch (e) {
    return null;
  }
}

// 3. Domain-based (Clearbit, Google, etc.)
async function fetchFromDomain(domain: string, ticker: string): Promise<Buffer | null> {
  if (!domain) return null;

  // Try Simple Icons first using ticker or domain slug
  try {
    const slug = domain.split('.')[0]?.toLowerCase();
    // @ts-ignore
    const icon = Object.values(si).find((i: any) =>
      i.slug === slug || i.title.toLowerCase() === ticker.toLowerCase() || i.slug === ticker.toLowerCase()
    ) as any;

    if (icon) {
      const coloredSvg = icon.svg.replace('<svg', `<svg fill="#${icon.hex}"`);
      const svgBuffer = Buffer.from(coloredSvg);
      return await sharp(svgBuffer).resize(128, 128).png().toBuffer();
    }
  } catch { }

  const sources = [
    `https://logo.clearbit.com/${domain}?size=128`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  ];

  for (const url of sources) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
        const buffer = Buffer.from(await res.arrayBuffer());
        // Filter out tiny 1x1 pixels or error images from Clearbit/Google
        if (buffer.length > 500) {
          return buffer;
        }
      }
    } catch { }
  }

  return null;
}

// ------------------------------------------------------------------
// Main Fetch Logic
// ------------------------------------------------------------------

async function processTicker(ticker: string): Promise<string | null> {
  // 1. Try Polygon
  const polygonResult = await fetchFromPolygon(ticker);
  if (polygonResult?.buffer && polygonResult.buffer.length > 0) {
    // console.log(`✅ ${ticker}: Found via Polygon`);
    return await saveBufferToWebP(polygonResult.buffer, ticker);
  }

  // 2. Try Finnhub
  const finnhubResult = await fetchFromFinnhub(ticker);
  if (finnhubResult?.buffer && finnhubResult.buffer.length > 0) {
    // console.log(`✅ ${ticker}: Found via Finnhub`);
    return await saveBufferToWebP(finnhubResult.buffer, ticker);
  }

  // 3. Fallback: Use Domain from Polygon/Finnhub or guess
  const domain = polygonResult?.domain || finnhubResult?.domain || `${ticker.toLowerCase()}.com`;

  if (domain) {
    const domainBuffer = await fetchFromDomain(domain, ticker);
    if (domainBuffer) {
      // console.log(`✅ ${ticker}: Found via Domain (${domain})`);
      return await saveBufferToWebP(domainBuffer, ticker);
    }
  }

  return null;
}

async function main() {
  await loadEnv();
  POLYGON_API_KEY = process.env.POLYGON_API_KEY;
  FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

  console.log('🚀 Starting Robust Logo Fetcher (DB Source)...');
  console.log('🔑 API Keys status:', {
    POLYGON: !!POLYGON_API_KEY ? 'Set' : 'Missing',
    FINNHUB: !!FINNHUB_API_KEY ? 'Set' : 'Missing'
  });

  await ensureDir(LOGOS_DIR);

  // Get all tickers from DB (Source of Truth)
  const allTickersRaw = await prisma.ticker.findMany({
    select: { symbol: true, logoUrl: true }
  });
  const allTickers = allTickersRaw.map(t => t.symbol);

  const dbTickerMap = new Map(allTickersRaw.map(t => [t.symbol, t.logoUrl]));

  const missingTickers = [];
  for (const ticker of allTickers) {
    const localPath = path.join(LOGOS_DIR, `${ticker.toLowerCase()}-32.webp`);
    try {
      await fs.access(localPath);
      // If locally exists, check if DB needs update
      if (!dbTickerMap.get(ticker)) {
        // Update DB only
        await prisma.ticker.update({
          where: { symbol: ticker },
          data: { logoUrl: `/logos/${ticker.toLowerCase()}-32.webp` }
        });
      }
    } catch {
      // File missing, needs fetch
      missingTickers.push(ticker);
    }
  }

  console.log(`📋 Found ${missingTickers.length} missing logos out of ${allTickers.length} total.`);

  // Process batch
  for (let i = 0; i < missingTickers.length; i += BATCH_SIZE) {
    const batch = missingTickers.slice(i, i + BATCH_SIZE);
    process.stdout.write(`\r📦 Processing ${i + 1}-${Math.min(i + BATCH_SIZE, missingTickers.length)} of ${missingTickers.length}... `);

    await Promise.all(batch.map(async (ticker) => {
      try {
        const logoPath = await processTicker(ticker);
        if (logoPath) {
          await prisma.ticker.upsert({
            where: { symbol: ticker },
            update: { logoUrl: logoPath },
            create: { symbol: ticker, logoUrl: logoPath }
          });
        }
      } catch (e) {
        console.error(`Error on ${ticker}:`, e);
      }
    }));

    // Rate limit buffer
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n🎉 Logo fetch complete!');
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(async () => {
      await prisma.$disconnect();
    });
}

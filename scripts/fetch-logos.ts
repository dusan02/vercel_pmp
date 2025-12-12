#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import * as si from 'simple-icons';
import { PrismaClient } from '@prisma/client';
import { getAllProjectTickers } from '../src/data/defaultTickers';

// Initialize Prisma with logging
const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

// Domain mappings
const TICKER_DOMAINS: Record<string, string> = {
  'NVDA': 'nvidia.com', 'MSFT': 'microsoft.com', 'AAPL': 'apple.com', 'AMZN': 'amazon.com',
  'GOOGL': 'google.com', 'GOOG': 'google.com', 'META': 'meta.com', 'AVGO': 'broadcom.com',
  'TSLA': 'tesla.com', 'JPM': 'jpmorganchase.com', 'WMT': 'walmart.com', 'LLY': 'lilly.com',
  'V': 'visa.com', 'MA': 'mastercard.com', 'NFLX': 'netflix.com', 'XOM': 'exxonmobil.com',
  'COST': 'costco.com', 'JNJ': 'jnj.com', 'HD': 'homedepot.com', 'PLTR': 'palantir.com',
  'PG': 'pg.com', 'BAC': 'bankofamerica.com', 'ABBV': 'abbvie.com', 'CVX': 'chevron.com',
  'KO': 'coca-cola.com', 'AMD': 'amd.com', 'GE': 'ge.com', 'CSCO': 'cisco.com',
  'PEP': 'pepsi.com', 'ADBE': 'adobe.com', 'CRM': 'salesforce.com', 'DIS': 'disney.com',
  'MCD': 'mcdonalds.com', 'ABT': 'abbott.com', 'DHR': 'danaher.com', 'INTC': 'intel.com',
  'VZ': 'verizon.com', 'CMCSA': 'comcast.com', 'NKE': 'nike.com', 'PFE': 'pfizer.com',
  'WFC': 'wellsfargo.com', 'TMUS': 't-mobile.com', 'INTU': 'intuit.com', 'QCOM': 'qualcomm.com',
  'IBM': 'ibm.com', 'NOW': 'servicenow.com', 'UBER': 'uber.com', 'TXN': 'ti.com',
  'BA': 'boeing.com', 'AMGN': 'amgen.com', 'SPGI': 'spglobal.com', 'HON': 'honeywell.com',
  'UNP': 'up.com', 'CAT': 'caterpillar.com', 'LMT': 'lockheedmartin.com', 'RTX': 'rtx.com',
  'GS': 'goldmansachs.com', 'MS': 'morganstanley.com', 'BLK': 'blackrock.com',
  'C': 'citigroup.com', 'AXP': 'americanexpress.com', 'RY': 'rbc.com', 'TD': 'td.com',
  'SHOP': 'shopify.com', 'SONY': 'sony.com', 'BABA': 'alibaba.com', 'TSM': 'tsmc.com',
  'ASML': 'asml.com', 'SAP': 'sap.com', 'AZN': 'astrazeneca.com', 'NVO': 'novonordisk.com',
  'SHEL': 'shell.com', 'TTE': 'totalenergies.com', 'BP': 'bp.com', 'TM': 'toyota.com'
};

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');
const BATCH_SIZE = 20; // Increased batch size since we handle timeouts well
const TIMEOUT = 5000;

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

function getDomainForTicker(ticker: string): string {
  if (TICKER_DOMAINS[ticker]) return TICKER_DOMAINS[ticker];
  return `${ticker.toLowerCase()}.com`;
}

async function fetchWithTimeout(url: string, timeout = TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMPLogoBot/1.0)' }
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

async function fetchDomainFromPolygon(ticker: string): Promise<string | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${apiKey}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const data = await res.json();
    const homepageUrl = data.results?.homepage_url;

    if (homepageUrl) {
      try {
        const hostname = new URL(homepageUrl).hostname;
        return hostname.replace(/^www\./, '');
      } catch (e) {
        return null;
      }
    }
  } catch (e) {
    // console.warn(`Failed to fetch details for ${ticker}:`, e);
  }
  return null;
}

async function processTicker(ticker: string): Promise<string | null> {
  let domain = getDomainForTicker(ticker);

  // Helper to try fetching logo from a domain
  const tryFetchLogo = async (dom: string) => {
    // Sources - prioritized
    const sources = [
      `https://logo.clearbit.com/${dom}?size=128`,
      `https://unavatar.io/${dom}?fallback=false`
    ];

    // Try Simple Icons first (fastest, local-ish)
    try {
      const slug = dom.split('.')[0]?.toLowerCase() ?? '';
      // @ts-ignore - simple-icons types can be tricky
      const icon = Object.values(si).find((i: any) =>
        i.slug === slug || i.slug === ticker.toLowerCase()
      ) as any;

      if (icon) {
        // Fix: Inject brand color into SVG to avoid black default
        const coloredSvg = icon.svg.replace('<svg', `<svg fill="#${icon.hex}"`);
        const svgBuffer = Buffer.from(coloredSvg);

        const pngBuffer = await sharp(svgBuffer).resize(128, 128).png().toBuffer();
        // console.log(`✅ ${ticker}: Found in Simple Icons`);
        return await saveBufferToWebP(pngBuffer, ticker);
      }
    } catch (e) { }

    // Try External URLs
    for (const url of sources) {
      try {
        const res = await fetchWithTimeout(url);
        if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
          const buffer = Buffer.from(await res.arrayBuffer());
          if (buffer.length > 100) {
            // console.log(`✅ ${ticker}: Found at ${url}`);
            return await saveBufferToWebP(buffer, ticker);
          }
        }
      } catch (e) { }
    }
    return null;
  };

  // 1. Try with guessed/mapped domain
  let logoPath = await tryFetchLogo(domain);
  if (logoPath) return logoPath;

  // 2. If failed, try to get real domain from Polygon
  // console.log(`Build-in domain failed for ${ticker}, querying Polygon...`);
  const polygonDomain = await fetchDomainFromPolygon(ticker);
  if (polygonDomain && polygonDomain !== domain) {
    // console.log(`Polygon found domain for ${ticker}: ${polygonDomain}`);
    logoPath = await tryFetchLogo(polygonDomain);
    if (logoPath) return logoPath;
  }

  return null;
}

async function main() {
  console.log('🚀 Starting logo population (Hardcoded Mode) with Color Fix...');
  await ensureDir(LOGOS_DIR);

  // 1. Get tickers from CODE (definitive list)
  const codeTickers = getAllProjectTickers('pmp');
  console.log(`📋 Target: ${codeTickers.length} tickers from codebase.`);

  // 2. Get tickers from DB to check existing logos
  let dbTickers: Record<string, string | null> = {};
  try {
    const tickersFromDb = await prisma.ticker.findMany({
      select: { symbol: true, logoUrl: true }
    });
    tickersFromDb.forEach(t => {
      dbTickers[t.symbol] = t.logoUrl;
    });
    console.log(`📊 DB state: ${tickersFromDb.length} tickers known.`);
  } catch (e) {
    console.warn("⚠️ Could not read DB state, assuming empty/init.");
  }

  // Filter those needing update
  const toProcess = [];
  for (const ticker of codeTickers) {
    const existingUrl = dbTickers[ticker];
    // Check if file exists
    if (existingUrl) {
      const localPath = path.join(process.cwd(), 'public', existingUrl);
      try {
        await fs.access(localPath);
        continue; // Skip if exists in DB AND on disk
      } catch { }
    }
    toProcess.push(ticker);
  }

  console.log(`🔄 Processing ${toProcess.length} tickers...`);

  // Process in batches
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    process.stdout.write(`\r📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)}: `);

    await Promise.all(batch.map(async (ticker) => {
      try {
        let logoPath = await processTicker(ticker);

        if (logoPath) {
          await prisma.ticker.upsert({
            where: { symbol: ticker },
            update: { logoUrl: logoPath },
            create: { symbol: ticker, logoUrl: logoPath }
          });
        } else {
          await prisma.ticker.upsert({
            where: { symbol: ticker },
            update: {}, // nothing to update
            create: { symbol: ticker }
          });
        }
      } catch (e) {
        console.error(`\nError processing ${ticker}:`, e);
      }
    }));

    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n🎉 Done!');
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(console.error);
}

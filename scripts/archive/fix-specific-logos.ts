import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

/**
 * Script to fix specific logos by downloading from Polygon API or other sources
 * and saving them to public/logos/ directory
 */

const LOGOS_DIR = join(process.cwd(), 'public', 'logos');
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Tickers to fix
const TICKERS_TO_FIX = [
  'TCOM', // Trip.com - wrong logo
  'COIN', // Coinbase - wrong logo
  'MMM',  // 3M - wrong logo
  'NVO',  // Novo Nordisk - low quality
  'HD',   // Home Depot - low quality
  'LYG',  // Lloyds Banking Group - low quality
  'CTSH', // Cognizant - no logo
  'WAB'   // Wabtec - no logo
];

// Alternative sources for logos (if Polygon fails)
const LOGO_SOURCES: Record<string, string[]> = {
  'TCOM': [
    'https://logo.clearbit.com/trip.com?size=128',
    'https://www.google.com/s2/favicons?domain=trip.com&sz=128'
  ],
  'COIN': [
    'https://logo.clearbit.com/coinbase.com?size=128',
    'https://www.google.com/s2/favicons?domain=coinbase.com&sz=128'
  ],
  'MMM': [
    'https://logo.clearbit.com/3m.com?size=128',
    'https://www.google.com/s2/favicons?domain=3m.com&sz=128'
  ],
  'NVO': [
    'https://logo.clearbit.com/novonordisk.com?size=128',
    'https://www.google.com/s2/favicons?domain=novonordisk.com&sz=128'
  ],
  'HD': [
    'https://logo.clearbit.com/homedepot.com?size=128',
    'https://www.google.com/s2/favicons?domain=homedepot.com&sz=128'
  ],
  'LYG': [
    'https://logo.clearbit.com/lloydsbankinggroup.com?size=128',
    'https://www.google.com/s2/favicons?domain=lloydsbankinggroup.com&sz=128'
  ],
  'CTSH': [
    'https://logo.clearbit.com/cognizant.com?size=128',
    'https://www.google.com/s2/favicons?domain=cognizant.com&sz=128'
  ],
  'WAB': [
    'https://logo.clearbit.com/wabtec.com?size=128',
    'https://www.google.com/s2/favicons?domain=wabtec.com&sz=128'
  ]
};

async function fetchFromPolygon(ticker: string): Promise<Buffer | null> {
  if (!POLYGON_API_KEY) {
    console.warn(`⚠️  POLYGON_API_KEY not set, skipping Polygon fetch for ${ticker}`);
    return null;
  }

  try {
    // First, get ticker reference to find logo URL
    const refUrl = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${POLYGON_API_KEY}`;
    const refResponse = await fetch(refUrl, { signal: AbortSignal.timeout(5000) });
    
    if (!refResponse.ok) {
      console.warn(`⚠️  Polygon reference API failed for ${ticker}: ${refResponse.status}`);
      return null;
    }

    const refData: any = await refResponse.json();
    const branding = refData?.results?.branding;
    const logoUrl = branding?.icon_url || branding?.logo_url;

    if (!logoUrl) {
      console.warn(`⚠️  No logo URL in Polygon data for ${ticker}`);
      return null;
    }

    // Fetch the logo image
    let normalizedUrl = logoUrl.trim();
    if (normalizedUrl.startsWith('//')) {
      normalizedUrl = `https:${normalizedUrl}`;
    }

    // Add API key if it's a Polygon-hosted URL
    if (normalizedUrl.includes('api.polygon.io') && !normalizedUrl.includes('apiKey=')) {
      normalizedUrl += (normalizedUrl.includes('?') ? '&' : '?') + `apiKey=${POLYGON_API_KEY}`;
    }

    const logoResponse = await fetch(normalizedUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PreMarketPrice/1.0)'
      }
    });

    if (!logoResponse.ok) {
      console.warn(`⚠️  Failed to fetch logo from Polygon URL for ${ticker}: ${logoResponse.status}`);
      return null;
    }

    const arrayBuffer = await logoResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn(`⚠️  Error fetching from Polygon for ${ticker}:`, error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function fetchFromAlternativeSources(ticker: string): Promise<Buffer | null> {
  const sources = LOGO_SOURCES[ticker];
  if (!sources || sources.length === 0) {
    return null;
  }

  for (const url of sources) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PreMarketPrice/1.0)'
        }
      });

      if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        if (buffer.length > 100) {
          console.log(`✅ ${ticker}: Fetched from ${url}`);
          return buffer;
        }
      }
    } catch (error) {
      // Continue to next source
      continue;
    }
  }

  return null;
}

async function saveLogoAsWebP(buffer: Buffer, ticker: string): Promise<void> {
  const sizes = [32, 64];
  
  for (const size of sizes) {
    const filename = `${ticker.toLowerCase()}-${size}.webp`;
    const filepath = join(LOGOS_DIR, filename);

    try {
      await sharp(buffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 90 })
        .toFile(filepath);
      
      console.log(`✅ ${ticker}: Saved ${filename}`);
    } catch (error) {
      console.error(`❌ ${ticker}: Error saving ${filename}:`, error instanceof Error ? error.message : 'unknown');
    }
  }
}

async function processTicker(ticker: string): Promise<boolean> {
  console.log(`\n🔄 Processing ${ticker}...`);

  // 1. Try Polygon API first (best quality)
  let buffer = await fetchFromPolygon(ticker);
  
  // 2. If Polygon fails, try alternative sources
  if (!buffer) {
    buffer = await fetchFromAlternativeSources(ticker);
  }

  if (!buffer) {
    console.error(`❌ ${ticker}: Failed to fetch logo from all sources`);
    return false;
  }

  // 3. Save as WebP
  await saveLogoAsWebP(buffer, ticker);
  return true;
}

async function main() {
  console.log('🚀 Starting logo fix for specific tickers...\n');
  console.log(`📋 Tickers to fix: ${TICKERS_TO_FIX.join(', ')}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const ticker of TICKERS_TO_FIX) {
    const success = await processTicker(ticker);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n🎉 Done!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
}

if (require.main === module) {
  main().catch(console.error);
}

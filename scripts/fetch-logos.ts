#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { LogoFetcher } from '../src/lib/services/logoFetcher';

// Minimal .env loader
async function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = await fs.readFile(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1]!.trim();
        const value = match[2]!.trim().replace(/^["']|["']$/g, '');
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
const BATCH_SIZE = 5;

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function main() {
  await loadEnv();

  console.log('🚀 Starting Refactored Logo Fetcher...');
  console.log('🔑 API Keys status:', {
    POLYGON: !!process.env.POLYGON_API_KEY ? 'Set' : 'Missing',
    FINNHUB: !!process.env.FINNHUB_API_KEY ? 'Set' : 'Missing'
  });

  await ensureDir(LOGOS_DIR);

  const fetcher = new LogoFetcher(prisma);

  // Get all tickers from DB (Source of Truth)
  const allTickersRaw = await prisma.ticker.findMany({
    select: { symbol: true, logoUrl: true }
  });

  const dbTickerMap = new Map(allTickersRaw.map(t => [t.symbol, t.logoUrl]));

  const missingTickers = [];
  for (const t of allTickersRaw) {
    const ticker = t.symbol;
    const localPath = path.join(LOGOS_DIR, `${ticker.toLowerCase()}-32.webp`);
    try {
      await fs.access(localPath);
      // If locally exists, check if DB needs update
      const currentUrl = dbTickerMap.get(ticker);
      if (!currentUrl || !currentUrl.startsWith('/logos/')) {
        await prisma.ticker.update({
          where: { symbol: ticker },
          data: { logoUrl: `/logos/${ticker.toLowerCase()}-32.webp` }
        });
        console.log(`✅ Updated ${ticker} to local logo path`);
      }
    } catch {
      missingTickers.push(ticker);
    }
  }

  console.log(`📋 Found ${missingTickers.length} missing logos out of ${allTickersRaw.length} total.`);

  // Process batch
  for (let i = 0; i < missingTickers.length; i += BATCH_SIZE) {
    const batch = missingTickers.slice(i, i + BATCH_SIZE);
    process.stdout.write(`\r📦 Processing ${i + 1}-${Math.min(i + BATCH_SIZE, missingTickers.length)} of ${missingTickers.length}... `);

    await Promise.all(batch.map(async (ticker) => {
      try {
        const logoPath = await fetcher.fetchAndSave(ticker);
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

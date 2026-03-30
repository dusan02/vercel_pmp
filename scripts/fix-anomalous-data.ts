/**
 * Fix anomalous prices + remaining sector/industry issues
 *
 * 1. Reset +999.99% percent changes (prevClose = 0 or null)
 * 2. Fix BF.B and NVR sector/industry
 * 3. Fix tickers with "Unknown" or non-standard industry values
 * 4. Remove truly de-listed tickers from universe (SRNE, MNDT, ATVI)
 */

import { prisma } from '../src/lib/db/prisma';
import { redisClient } from '../src/lib/redis';

// ── De-listed / acquired tickers that should be removed from universe ──
// These companies no longer trade (bankrupt, acquired, etc.)
const DELIST_FROM_UNIVERSE = [
  'SRNE',  // Sorrento Therapeutics – bankrupt 2023
  'MNDT',  // Mandiant – acquired by Google 2022
  'ATVI',  // Activision Blizzard – acquired by Microsoft 2023
];

// ── Manual fixes for last remaining bad data ──────────────────────────
const MANUAL_FIXES: Record<string, { sector: string; industry: string }> = {
  'BF.B':  { sector: 'Consumer Defensive', industry: 'Beverages—Alcoholic' },
  'NVR':   { sector: 'Consumer Cyclical',  industry: 'Residential Construction' },
  // Tickers still showing "X - Unknown" industry pattern
  'DFS':   { sector: 'Financial Services', industry: 'Credit Services' },
  'CRWD':  { sector: 'Technology',         industry: 'Software—Application' },
  // Any left over non-standard sectors
  'ATVI':  { sector: 'Communication Services', industry: 'Entertainment' },
  'MNDT':  { sector: 'Technology',         industry: 'Software—Application' },
};

async function fixAll() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Fix: anomalous prices + BF.B/NVR + de-listed tickers');
  console.log('══════════════════════════════════════════════════════\n');

  // ── 1. Fix BF.B, NVR and remaining "Unknown" industry tickers ────────
  console.log('📌 Step 1: Manual sector/industry fixes...');
  let sectorFixed = 0;
  for (const [symbol, fix] of Object.entries(MANUAL_FIXES)) {
    try {
      const ticker = await prisma.ticker.findUnique({ where: { symbol } });
      if (!ticker) { console.log(`  ⚠️  ${symbol} not found in DB`); continue; }
      await prisma.ticker.update({
        where: { symbol },
        data: { sector: fix.sector, industry: fix.industry, updatedAt: new Date() },
      });
      console.log(`  ✅ ${symbol.padEnd(8)} → ${fix.sector} / ${fix.industry}`);
      sectorFixed++;
    } catch (e) {
      console.error(`  ❌ ${symbol}:`, e);
    }
  }

  // ── 2. Fix any remaining non-standard sector values in DB ─────────────
  console.log('\n📌 Step 2: Fixing non-standard sector names...');
  const SECTOR_REMAP: Record<string, string> = {
    'Consumer Discretionary': 'Consumer Cyclical',
    'Consumer Staples':       'Consumer Defensive',
    'Materials':              'Basic Materials',
    'Comm Serv':              'Communication Services',
    'Comm Services':          'Communication Services',
    'Info Tech':              'Technology',
    'International':          null as unknown as string, // Will be handled per-ticker
  };
  let sectorRemapped = 0;
  for (const [oldSector, newSector] of Object.entries(SECTOR_REMAP)) {
    if (!newSector) continue;
    const result = await prisma.ticker.updateMany({
      where: { sector: oldSector },
      data: { sector: newSector, updatedAt: new Date() },
    });
    if (result.count > 0) {
      console.log(`  ✅ Renamed sector "${oldSector}" → "${newSector}" for ${result.count} tickers`);
      sectorRemapped += result.count;
    }
  }

  // ── 3. Fix "X - Unknown" industry patterns ─────────────────────────────
  console.log('\n📌 Step 3: Fixing "X - Unknown" industry values...');
  const allTickers = await prisma.ticker.findMany({
    select: { symbol: true, sector: true, industry: true },
  });
  const unknownIndustry = allTickers.filter(t =>
    t.industry && (
      t.industry.includes('Unknown') ||
      t.industry.includes('- Unknown') ||
      t.industry === t.sector
    )
  );
  console.log(`  Found ${unknownIndustry.length} tickers with Unknown/duplicate industry`);
  let unknownFixed = 0;
  for (const t of unknownIndustry) {
    // Clear bad industry value – it will show as "N/A" which is better than "Technology - Unknown"
    await prisma.ticker.update({
      where: { symbol: t.symbol },
      data: { industry: null, updatedAt: new Date() },
    });
    console.log(`  🔧 ${t.symbol.padEnd(8)} industry cleared (was: "${t.industry}")`);
    unknownFixed++;
  }

  // ── 4. Reset +999.99% anomalous percentChange ──────────────────────────
  console.log('\n📌 Step 4: Resetting anomalous percent changes (>200%)...');
  const anomalous = await prisma.ticker.findMany({
    where: {
      OR: [
        { percentChange: { gt: 200 } },
        { percentChange: { lt: -90 } },
      ]
    },
    select: { symbol: true, percentChange: true, prevClose: true, currentPrice: true },
  });
  console.log(`  Found ${anomalous.length} tickers with anomalous % change`);

  let priceFixed = 0;
  for (const t of anomalous) {
    // If prevClose is missing/zero: percent change is invalid → reset to 0
    const prevClose = t.prevClose ?? 0;
    const shouldReset = prevClose === 0 || prevClose === null;
    if (shouldReset) {
      await prisma.ticker.update({
        where: { symbol: t.symbol },
        data: { percentChange: 0, updatedAt: new Date() },
      });
      console.log(`  🔧 ${t.symbol.padEnd(8)} percentChange=${t.percentChange?.toFixed(2)}% reset to 0 (prevClose=${prevClose})`);
      priceFixed++;
    } else {
      // prevClose exists but change is still >200% – suspicious price data
      console.log(`  ⚠️  ${t.symbol.padEnd(8)} percentChange=${t.percentChange?.toFixed(2)}% (price=${t.currentPrice}, prevClose=${prevClose}) - investigate`);
    }
  }

  // ── 5. Remove truly de-listed tickers from Redis universe ─────────────
  console.log('\n📌 Step 5: Removing de-listed tickers from Redis universe...');
  try {
    const removed = await redisClient.sRem('universe:sp500', DELIST_FROM_UNIVERSE);
    console.log(`  ✅ Removed ${removed} de-listed tickers from universe: ${DELIST_FROM_UNIVERSE.join(', ')}`);
  } catch (e) {
    console.error('  ❌ Redis error:', e);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  ✅ Manual sector/industry fixes:  ${sectorFixed}`);
  console.log(`  ✅ Sector renames:                ${sectorRemapped}`);
  console.log(`  ✅ Unknown industry cleared:      ${unknownFixed}`);
  console.log(`  ✅ Anomalous prices reset:        ${priceFixed}`);
  console.log('══════════════════════════════════════════════════════\n');
}

fixAll()
  .then(() => { redisClient.quit(); prisma.$disconnect(); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });

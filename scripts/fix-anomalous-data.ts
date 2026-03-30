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

  // ── 4. Reset anomalous lastChangePct ─────────────────────────────────
  // Schema fields: lastChangePct (Float?), latestPrevClose (Float?), lastPrice (Float?)
  console.log('\n📌 Step 4: Resetting anomalous lastChangePct (>200% or <-90%)...');

  const allForPrice = await prisma.ticker.findMany({
    select: { symbol: true, lastChangePct: true, latestPrevClose: true, lastPrice: true },
  });

  const anomalous = allForPrice.filter(t =>
    t.lastChangePct !== null &&
    (t.lastChangePct > 200 || t.lastChangePct < -90)
  );
  console.log(`  Found ${anomalous.length} tickers with anomalous lastChangePct`);

  let priceFixed = 0;
  for (const t of anomalous) {
    const prevClose = t.latestPrevClose ?? 0;
    if (prevClose === 0) {
      // No valid prevClose → percent change is meaningless → reset to 0
      await prisma.ticker.update({
        where: { symbol: t.symbol },
        data: { lastChangePct: 0, updatedAt: new Date() },
      });
      console.log(`  🔧 ${t.symbol.padEnd(8)} ${t.lastChangePct?.toFixed(2)}% → 0 (no prevClose, price=${t.lastPrice})`);
      priceFixed++;
    } else {
      // Has prevClose but still >200% – suspicious, log only
      console.log(`  ⚠️  ${t.symbol.padEnd(8)} ${t.lastChangePct?.toFixed(2)}% (price=${t.lastPrice}, prevClose=${prevClose}) - leaving as-is`);
    }
  }

  // Also reset anomalous SessionPrice.changePct values
  console.log('\n📌 Step 4b: Resetting anomalous SessionPrice.changePct...');
  const anomalousSession = await prisma.sessionPrice.findMany({
    where: { date: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
    select: { id: true, symbol: true, changePct: true, session: true },
  });
  const badSessions = anomalousSession.filter(s => s.changePct > 200 || s.changePct < -90);
  console.log(`  Found ${badSessions.length} SessionPrice rows with anomalous changePct`);
  let sessionFixed = 0;
  for (const s of badSessions) {
    await prisma.sessionPrice.update({
      where: { id: s.id },
      data: { changePct: 0 },
    });
    console.log(`  🔧 ${s.symbol.padEnd(8)} [${s.session}] ${s.changePct.toFixed(2)}% → 0`);
    sessionFixed++;
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

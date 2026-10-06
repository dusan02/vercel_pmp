/**
 * Repair logos fetched via naive `${ticker}.com` domain guess that landed on
 * a DIFFERENT company's site (NU → nu.com = Eversource Energy; AA → aa.com =
 * American Airlines). For every ticker whose stored logo file exists AND whose
 * websiteUrl domain differs from the naive guess, re-fetch the correct logo
 * through the fixed pipeline (Polygon → Finnhub → websiteUrl domain) and
 * replace the stored file only when the new image materially differs.
 *
 * Skips curated .svg (simple-icons) files — those are ticker-mapped by hand.
 *
 * Run: npx tsx scripts/repair-domain-logos.ts [--dry-run] [--only SYM,SYM]
 */
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { LogoFetcher } from '../src/services/logoFetcher';

const prisma = new PrismaClient();
const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');
const dryRun = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1].split(',').map(s => s.trim().toUpperCase()) : null;

const naiveDomain = (sym: string) => `${sym.toLowerCase()}.com`;
const hostOf = (url: string | null): string | null => {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, '') || null; } catch { return null; }
};

/** Mean per-pixel absolute difference of two logo images (0 = identical). */
async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  try {
    const ra = await sharp(a).resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).removeAlpha().raw().toBuffer();
    const rb = await sharp(b).resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).removeAlpha().raw().toBuffer();
    if (ra.length !== rb.length) return 1;
    let sum = 0;
    for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i] - rb[i]);
    return sum / (ra.length * 255);
  } catch { return 1; }
}

async function main() {
  const files = await fs.readdir(LOGOS_DIR);
  const fileSyms = [...new Set(
    files.filter(f => f.endsWith('-32.webp')).map(f => f.replace('-32.webp', '').toUpperCase())
  )];
  const tickers = await prisma.ticker.findMany({
    where: { symbol: { in: only ?? fileSyms } },
    select: { symbol: true, name: true, websiteUrl: true },
  });
  const bySym = new Map(tickers.map(t => [t.symbol, t]));

  const fetcher = new LogoFetcher(prisma);
  const redis = createClient({ socket: { host: '127.0.0.1', port: 6380 } });
  await redis.connect().catch(() => null);

  const suspects = fileSyms.filter(s => {
    if (only) return only.includes(s);
    const t = bySym.get(s);
    const host = hostOf(t?.websiteUrl ?? null);
    return !host || host !== naiveDomain(s); // wrong-domain risk or unverifiable
  });

  console.log(`Suspects: ${suspects.length} / ${fileSyms.length} logo files${dryRun ? ' [DRY RUN]' : ''}`);
  let replaced = 0, same = 0, unresolved = 0, skipped = 0;
  const changedSymbols: string[] = [];

  for (const sym of suspects) {
    const t = bySym.get(sym);
    const storedPath = path.join(LOGOS_DIR, `${sym.toLowerCase()}-32.webp`);
    let stored: Buffer;
    try { stored = await fs.readFile(storedPath); } catch { skipped++; continue; }

    // Correct logo via fixed pipeline (websiteUrl domain now authoritative).
    const result = await fetcher.fetchBuffer(sym).catch(() => null);
    if (!result) { unresolved++; continue; }
    // SVG results can't pixel-compare — save directly if content differs.
    let isDifferent = true;
    if (!result.contentType.includes('svg')) {
      const diff = await pixelDiff(stored, result.buffer);
      isDifferent = diff > 0.06; // >6% mean pixel difference = different logo
    } else {
      const storedStr = stored.toString('utf8');
      isDifferent = storedStr !== result.buffer.toString('utf8');
    }
    if (!isDifferent) { same++; continue; }

    if (!dryRun) {
      if (result.contentType.includes('svg')) {
        await fs.writeFile(path.join(LOGOS_DIR, `${sym.toLowerCase()}.svg`), result.buffer.toString('utf8'));
        await fs.unlink(storedPath).catch(() => {});
        await fs.unlink(path.join(LOGOS_DIR, `${sym.toLowerCase()}-64.webp`)).catch(() => {});
      } else {
        await fetcher.saveBufferPublic(sym, result.buffer);
      }
      await redis.del(`logo:b64:${sym}`).catch(() => {});
    }
    replaced++;
    changedSymbols.push(`${sym}(${t?.websiteUrl ? hostOf(t.websiteUrl) : 'no-url'})`);
    console.log(`  ${sym} ${t?.name ?? ''} → ${result.source}${dryRun ? ' [would replace]' : ' replaced'}`);
  }

  console.log(`\n=== ${dryRun ? 'DRY RUN — no changes' : 'Done'} ===`);
  console.log(`Replaced: ${replaced} | Same (already correct): ${same} | Unresolved: ${unresolved} | Skipped: ${skipped}`);
  if (changedSymbols.length) console.log(`Changed: ${changedSymbols.join(', ')}`);
  await prisma.$disconnect();
  try { await redis.quit(); } catch { }
}

main().catch(e => { console.error(e); process.exit(1); });

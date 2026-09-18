/**
 * Sync Ticker.logoUrl with files present in public/logos/{symbol}-32.webp
 * Run: npx tsx scripts/sync-logo-urls.ts
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

loadEnvFromFiles();

const prisma = new PrismaClient();

async function main() {
  const logosDir = path.join(process.cwd(), 'public', 'logos');
  const files = new Set(fs.readdirSync(logosDir).filter((f) => f.endsWith('-32.webp')));

  const tickers = await prisma.ticker.findMany({ select: { symbol: true, logoUrl: true } });
  let updated = 0;
  let cleared = 0;

  for (const t of tickers) {
    const file = `${t.symbol.toLowerCase()}-32.webp`;
    const url = files.has(file) ? `/logos/${file}` : null;
    if (url !== t.logoUrl) {
      await prisma.ticker.update({ where: { symbol: t.symbol }, data: { logoUrl: url } });
      if (url) updated++;
      else cleared++;
    }
  }

  console.log(`✅ logoUrl synced: ${updated} set, ${cleared} cleared, ${tickers.length} tickers, ${files.size} logo files`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

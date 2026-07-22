import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

async function main() {
  for (const sym of ['NVDA', 'AAPL', 'META']) {
    // SessionPrice records
    const sp = await prisma.sessionPrice.findMany({
      where: { symbol: sym, date: { gte: new Date('2026-07-20T00:00:00Z') } },
      orderBy: { lastTs: 'desc' },
      take: 5,
      select: { symbol: true, session: true, lastPrice: true, changePct: true, lastTs: true, date: true }
    });
    console.log(`\n=== ${sym} SessionPrice ===`);
    for (const s of sp) {
      console.log(`  session=${s.session} lastPrice=${s.lastPrice} changePct=${s.changePct} lastTs=${s.lastTs?.toISOString()} date=${s.date.toISOString()}`);
    }

    // DailyRef records
    const dr = await prisma.dailyRef.findMany({
      where: { symbol: sym, date: { gte: new Date('2026-07-20T00:00:00Z') } },
      orderBy: { date: 'desc' },
      take: 5,
      select: { symbol: true, date: true, previousClose: true, regularClose: true }
    });
    console.log(`=== ${sym} DailyRef ===`);
    for (const d of dr) {
      console.log(`  date=${d.date.toISOString()} prevClose=${d.previousClose} regularClose=${d.regularClose}`);
    }

    // Ticker record
    const t = await prisma.ticker.findUnique({
      where: { symbol: sym },
      select: { symbol: true, lastPrice: true, latestPrevClose: true, latestPrevCloseDate: true, lastChangePct: true, lastPriceUpdated: true }
    });
    console.log(`=== ${sym} Ticker ===`);
    console.log(`  lastPrice=${t?.lastPrice} latestPrevClose=${t?.latestPrevClose} latestPrevCloseDate=${t?.latestPrevCloseDate?.toISOString()} lastChangePct=${t?.lastChangePct} lastPriceUpdated=${t?.lastPriceUpdated?.toISOString()}`);
  }

  // Redis prevclose
  const { getPrevClose } = await import('../src/lib/redis/operations');
  const dateStr = '2026-07-22';
  for (const sym of ['NVDA', 'AAPL', 'META']) {
    const pc = await getPrevClose(dateStr, [sym]);
    console.log(`\nRedis prevclose:${dateStr}:${sym} = ${pc.get(sym)}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

/**
 * repair-prevclose-today.ts — restore prevClose values corrupted by the
 * post-close prevDay rollover.
 *
 * After 16:00 ET, Polygon's `prevDay`/`/prev` roll forward to today's bar.
 * Writers that trusted them post-close stamped DailyRef(session).previousClose
 * and Redis `prevclose:{session}:{symbol}` with *today's own close* instead
 * of the previous trading day's close. That flips the evening percentChange
 * basis from "vs yesterday" to "AH drift vs today's close".
 *
 * Repair rule: prevClose(session) := DailyRef(closeRefDay).regularClose —
 * written once by saveRegularClose and never rolled.
 *
 * Usage: npx tsx scripts/repair-prevclose-today.ts [--date YYYY-MM-DD] [--dry]
 */

import { prisma } from '@/lib/db/prisma';
import { redisClient } from '@/lib/redis';
import { setPrevClose } from '@/lib/redis/operations';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getPrevCloseContext } from '@/lib/utils/prevCloseDates';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1];

async function main() {
  const sessionDateStr = dateArg ?? getDateET();
  const ctx = getPrevCloseContext(sessionDateStr);
  const refDayStr = ctx.closeRefDateStr;
  console.log(`Session ${sessionDateStr} → prevClose ref day ${refDayStr}${dryRun ? ' (dry run)' : ''}`);

  // D-1 closes: write-once, rollover-immune source
  const refRows = await prisma.dailyRef.findMany({
    where: { date: ctx.closeRefDay, regularClose: { not: null } },
    select: { symbol: true, regularClose: true },
  });
  const correctBySymbol = new Map(refRows.map(r => [r.symbol, r.regularClose!]));
  console.log(`${correctBySymbol.size} closes loaded for ${refDayStr}`);

  const sessionRows = await prisma.dailyRef.findMany({
    where: { date: ctx.sessionDate },
    select: { symbol: true, previousClose: true },
  });

  let checked = 0, fixed = 0, missing = 0, ok = 0;
  for (const row of sessionRows) {
    const correct = correctBySymbol.get(row.symbol);
    if (!correct) { missing++; continue; } // no ref-day close — can't verify
    checked++;
    const stored = row.previousClose;
    if (stored && Math.abs(stored - correct) < 0.0001) { ok++; continue; }

    if (!dryRun) {
      await prisma.dailyRef.updateMany({
        where: { symbol: row.symbol, date: ctx.sessionDate },
        data: { previousClose: correct },
      });
      if (redisClient?.isOpen) {
        await setPrevClose(sessionDateStr, row.symbol, correct).catch(() => {});
      }
    }
    fixed++;
    if (fixed <= 10) console.log(`  ${row.symbol}: ${stored ?? 'null'} → ${correct}`);
  }

  console.log(`checked=${checked} ok=${ok} fixed=${fixed} missing-ref=${missing}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    if (redisClient?.isOpen) await redisClient.quit();
  });

/**
 * Repair DailyRef regularClose + previousClose from Polygon grouped daily aggs.
 *
 * Background:
 * - saveRegularClose cron was dead ~Sep 10-16 → regularClose missing on weekdays
 * - onDemandPrevClose/dailyIntegrityCheck wrote `previousClose` keyed by
 *   lastTradingDay instead of today → DailyRef(D).previousClose held close(D)
 *   instead of close(previous trading day)
 *
 * For every DailyRef row date in the window:
 * - trading day:   regularClose(D) = close(D), previousClose(D) = close(prevTradingDay)
 * - non-trading day (weekend/holiday rows exist): previousClose(D) = close(last trading day before D)
 *
 * Uses /v2/aggs/grouped (1 request per day) + dbWriteRetry for SQLITE_BUSY.
 *
 * Usage: npx tsx scripts/repair-dailyref-closes.ts [--days=15] [--dry-run]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { createETDate, getDateET } from '../src/lib/utils/dateET';
import { getLastTradingDay, isMarketHoliday } from '../src/lib/utils/timeUtils';
import { toET } from '../src/lib/utils/dateET';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const dryRun = process.argv.includes('--dry-run');
const daysArg = process.argv.find(a => a.startsWith('--days='));
const LOOKBACK_DAYS = daysArg ? parseInt(daysArg.split('=')[1], 10) : 15;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function dbWrite<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  let delayMs = 100;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const busy = msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
      if (!busy || attempt === 10) {
        console.warn(`⚠️ DB write failed (${label}):`, msg);
        return null;
      }
      await sleep(delayMs);
      delayMs = Math.min(2000, delayMs * 2);
    }
  }
  return null;
}

async function fetchGroupedClose(dateStr: string): Promise<Map<string, number>> {
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=false&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url);
  const map = new Map<string, number>();
  if (!res.ok) {
    console.warn(`⚠️ grouped aggs ${dateStr}: HTTP ${res.status}`);
    return map;
  }
  const data = await res.json();
  for (const r of data?.results ?? []) {
    if (r?.T && typeof r.c === 'number' && r.c > 0) map.set(r.T, r.c);
  }
  return map;
}

async function main() {
  if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not configured');
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - LOOKBACK_DAYS);
  cutoff.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.dailyRef.findMany({
    where: { date: { gte: cutoff } },
    select: { symbol: true, date: true, previousClose: true, regularClose: true }
  });
  console.log(`📋 ${rows.length} DailyRef rows in last ${LOOKBACK_DAYS} days`);

  const dateMsSet = [...new Set(rows.map(r => r.date.getTime()))].sort();
  const dateStrs = dateMsSet.map(ms => getDateET(new Date(ms)));

  // Fetch grouped aggs per distinct row date + for each date also the previous
  // trading day (to repair previousClose). Collect all needed trading days.
  const neededDates = new Set<string>();
  const rowDates: { dateStr: string; dateObj: Date; isTrading: boolean; prevTradingDay: Date }[] = [];

  for (const ms of dateMsSet) {
    const dateObj = new Date(ms);
    const dateStr = getDateET(dateObj);
    const w = toET(dateObj).weekday;
    const isTrading = w !== 0 && w !== 6 && !isMarketHoliday(dateObj);
    const prevTradingDay = getLastTradingDay(dateObj); // strictly before
    rowDates.push({ dateStr, dateObj, isTrading, prevTradingDay });
    if (isTrading) neededDates.add(dateStr);
    neededDates.add(getDateET(prevTradingDay));
  }

  console.log(`📥 Fetching grouped aggs for ${neededDates.size} trading days...`);
  const closeByDate = new Map<string, Map<string, number>>();
  for (const d of [...neededDates].sort()) {
    const m = await fetchGroupedClose(d);
    closeByDate.set(d, m);
    console.log(`  ${d}: ${m.size} closes`);
    await sleep(300);
  }

  let rcUpdated = 0, pcUpdated = 0, skipped = 0, missing = 0;
  const rowsByDate = new Map<number, typeof rows>();
  for (const r of rows) {
    const k = r.date.getTime();
    if (!rowsByDate.has(k)) rowsByDate.set(k, []);
    rowsByDate.get(k)!.push(r);
  }

  for (const { dateStr, dateObj, isTrading, prevTradingDay } of rowDates) {
    const prevDateStr = getDateET(prevTradingDay);
    const dayCloses = closeByDate.get(dateStr) ?? new Map<string, number>();
    const prevCloses = closeByDate.get(prevDateStr) ?? new Map<string, number>();
    const dayRows = rowsByDate.get(dateObj.getTime()) ?? [];

    for (const row of dayRows) {
      const updates: { regularClose?: number; previousClose?: number } = {};

      if (isTrading) {
        const rc = dayCloses.get(row.symbol);
        if (rc && rc !== row.regularClose) updates.regularClose = rc;
      }
      const pc = prevCloses.get(row.symbol);
      if (pc && pc !== row.previousClose) updates.previousClose = pc;

      if (Object.keys(updates).length === 0) {
        skipped++;
        continue;
      }
      if (!dayCloses.has(row.symbol) && isTrading) missing++;

      if (!dryRun) {
        const res = await dbWrite(
          () => prisma.dailyRef.update({
            where: { symbol_date: { symbol: row.symbol, date: dateObj } },
            data: { ...updates, updatedAt: new Date() }
          }),
          `repair:${row.symbol}@${dateStr}`
        );
        if (!res) continue;
      }
      if (updates.regularClose) rcUpdated++;
      if (updates.previousClose) pcUpdated++;
    }
    console.log(`  ${dateStr}${isTrading ? '' : ' (non-trading)'}: done (${dayRows.length} rows)`);
  }

  console.log(`\n${dryRun ? '🔍 DRY RUN — ' : ''}✅ Repair complete: regularClose updated ${rcUpdated}, previousClose updated ${pcUpdated}, unchanged ${skipped}, no-close-data ${missing}`);
  process.exit(0);
}

main().catch(e => { console.error('❌ repair failed:', e); process.exit(1); });

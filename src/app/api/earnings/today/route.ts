import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getDateET } from '@/lib/utils/dateET';
import { classifyEarningsTime } from '@/lib/utils/earningsTime';
import { readEarningsDaySqlite } from '@/lib/db/readonlySqlite';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const CACHE_TTL_SEC = 120;
const L1_TTL_MS = 120 * 1000;

interface CachedEarningsToday {
  cachedAt: number;
  data: {
    date: string;
    preMarket: any[];
    afterMarket: any[];
    timeTbd: any[];
  };
  count: number;
}

const l1Cache = new Map<string, CachedEarningsToday>();
const inflight = new Map<string, Promise<CachedEarningsToday>>();

async function loadEarningsForDate(date: string): Promise<CachedEarningsToday> {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);

  const sqliteRes = readEarningsDaySqlite(start, end);
  const earnings = sqliteRes.ok
    ? sqliteRes.data
    : await prisma.earningsCalendar.findMany({
        where: { date: { gte: start, lt: end } },
        orderBy: [{ time: 'asc' }, { ticker: 'asc' }],
      });

  const earningsData = earnings.map((earning) => ({
    ticker: earning.ticker,
    companyName: earning.companyName,
    marketCap: earning.marketCap,
    epsEstimate: earning.epsEstimate,
    epsActual: earning.epsActual,
    revenueEstimate: earning.revenueEstimate,
    revenueActual: earning.revenueActual,
    epsSurprisePercent: earning.epsSurprisePercent,
    revenueSurprisePercent: earning.revenueSurprisePercent,
    percentChange: earning.percentChange,
    marketCapDiff: earning.marketCapDiff,
    time: earning.time,
    date: earning.date.toISOString().split('T')[0],
  }));

  const preMarket = earningsData.filter((e) => classifyEarningsTime(e.time) === 'preMarket');
  const afterMarket = earningsData.filter((e) => classifyEarningsTime(e.time) === 'afterMarket');
  const timeTbd = earningsData.filter((e) => classifyEarningsTime(e.time) === 'timeTbd');

  const entry: CachedEarningsToday = {
    cachedAt: Date.now(),
    data: { date, preMarket, afterMarket, timeTbd },
    count: earningsData.length,
  };
  l1Cache.set(date, entry);
  try {
    await setCachedData(`earnings:today:${date}`, entry, CACHE_TTL_SEC);
  } catch {}
  return entry;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // ET calendar day — a raw UTC ISO shifts US evenings into "tomorrow",
    // which returned an empty earnings list after ~20:00 ET.
    const date = searchParams.get('date') || getDateET();

    // 1. In-memory L1 cache
    const l1 = l1Cache.get(date);
    if (l1 && Date.now() - l1.cachedAt < L1_TTL_MS) {
      return NextResponse.json(
        { success: true, data: l1.data, count: l1.count, timestamp: new Date().toISOString() },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
      );
    }

    // 2. Redis cache
    try {
      const redisEntry = await getCachedData(`earnings:today:${date}`) as CachedEarningsToday | null;
      if (redisEntry && redisEntry.data) {
        l1Cache.set(date, { ...redisEntry, cachedAt: Date.now() });
        return NextResponse.json(
          { success: true, data: redisEntry.data, count: redisEntry.count, timestamp: new Date().toISOString() },
          { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
        );
      }
    } catch {}

    // 3. Single-flight WAL read-only SQLite (or Prisma fallback)
    let pending = inflight.get(date);
    if (!pending) {
      pending = loadEarningsForDate(date).finally(() => inflight.delete(date));
      inflight.set(date, pending);
    }
    const fresh = await pending;

    return NextResponse.json(
      { success: true, data: fresh.data, count: fresh.count, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('❌ Error in earnings today API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

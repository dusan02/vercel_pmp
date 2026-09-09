import { prisma } from '@/lib/db/prisma';

export interface PremarketArchiveRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  zScore: number | null;
  rvol: number | null;
}

/**
 * Fetch pre-market movers for a specific date from PostgreSQL (SessionPrice).
 * This is the reliable source — Redis is optional cache, PostgreSQL is source of truth.
 *
 * @param dateStr  YYYY-MM-DD format (Eastern Time trading date)
 * @param sort     'desc' for gainers (biggest positive first), 'asc' for losers (biggest negative first)
 * @param limit    Max results
 */
export async function getPremarketMoversFromDB(
  dateStr: string,
  sort: 'asc' | 'desc',
  limit: number = 50,
): Promise<PremarketArchiveRow[]> {
  try {
    // SessionPrice.date is stored as epoch ms representing the session start in ET (04:00 ET = 08:00 UTC)
    // But the DB stores it as 04:00 ET which is 08:00 UTC = dateStr + 'T08:00:00Z'
    // However, Prisma stores DateTime as ISO string, so we query with the exact ET date
    // The session start for YYYY-MM-DD is stored as that date at 04:00 ET (08:00 UTC)
    const sessionStart = new Date(dateStr + 'T08:00:00Z');
    // Use a wide window (full day) to catch any timezone edge cases
    const dayStart = new Date(dateStr + 'T00:00:00Z');
    const dayEnd = new Date(dateStr + 'T23:59:59Z');

    const rows = await prisma.sessionPrice.findMany({
      where: {
        session: 'pre',
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
        // changePct is non-nullable in schema (Float, not Float?)
      },
      include: {
        ticker: {
          select: {
            name: true,
            sector: true,
          },
        },
      },
      orderBy: {
        changePct: sort,
      },
      take: limit,
    });

    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.ticker?.name ?? null,
      sector: r.ticker?.sector ?? null,
      price: r.lastPrice ?? null,
      changePct: r.changePct ?? null,
      zScore: r.zScore ?? null,
      rvol: r.rvol ?? null,
    }));
  } catch (error) {
    console.error(`[premarketArchive] Failed to fetch movers for ${dateStr}:`, error);
    return [];
  }
}

/**
 * Get available pre-market dates from SessionPrice (for navigation/linking).
 * Returns sorted array of YYYY-MM-DD strings (most recent first).
 */
export async function getAvailablePremarketDates(maxDays: number = 30): Promise<string[]> {
  try {
    const rows = await prisma.sessionPrice.findMany({
      where: { session: 'pre' },
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'desc' },
      take: maxDays,
    });

    return rows
      .map((r) => {
        const d = new Date(r.date);
        return d.toISOString().split('T')[0] ?? '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get the previous and next available trading dates for navigation.
 */
export async function getAdjacentPremarketDates(
  currentDate: string,
): Promise<{ prev: string | null; next: string | null }> {
  try {
    // Use start of current date as boundary (DB stores 04:00 UTC = 00:00 ET)
    const dayStart = new Date(currentDate + 'T00:00:00Z');

    // Previous date (before current day start)
    const prevRow = await prisma.sessionPrice.findFirst({
      where: {
        session: 'pre',
        date: { lt: dayStart },
      },
      select: { date: true },
      orderBy: { date: 'desc' },
    });

    // Next date (after current day end)
    const dayEnd = new Date(currentDate + 'T23:59:59Z');
    const nextRow = await prisma.sessionPrice.findFirst({
      where: {
        session: 'pre',
        date: { gt: dayEnd },
      },
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    const prev = prevRow
      ? new Date(prevRow.date).toISOString().split('T')[0] ?? null
      : null;
    const next = nextRow
      ? new Date(nextRow.date).toISOString().split('T')[0] ?? null
      : null;

    return { prev, next };
  } catch {
    return { prev: null, next: null };
  }
}

/**
 * Get a summary of pre-market data for a specific date
 * (top gainer, top loser, total tickers) — for archive index/navigation.
 */
export interface PremarketDateSummary {
  date: string;
  totalTickers: number;
  topGainer: { symbol: string; changePct: number } | null;
  topLoser: { symbol: string; changePct: number } | null;
}

export async function getPremarketDateSummaries(
  maxDays: number = 10,
): Promise<PremarketDateSummary[]> {
  try {
    const dates = await getAvailablePremarketDates(maxDays);
    const summaries: PremarketDateSummary[] = [];

    for (const dateStr of dates) {
      const dayStart = new Date(dateStr + 'T00:00:00Z');
      const dayEnd = new Date(dateStr + 'T23:59:59Z');

      const [count, topGainer, topLoser] = await Promise.all([
        prisma.sessionPrice.count({
          where: {
            session: 'pre',
            date: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.sessionPrice.findFirst({
          where: {
            session: 'pre',
            date: { gte: dayStart, lte: dayEnd },
          },
          select: { symbol: true, changePct: true },
          orderBy: { changePct: 'desc' },
        }),
        prisma.sessionPrice.findFirst({
          where: {
            session: 'pre',
            date: { gte: dayStart, lte: dayEnd },
          },
          select: { symbol: true, changePct: true },
          orderBy: { changePct: 'asc' },
        }),
      ]);

      summaries.push({
        date: dateStr,
        totalTickers: count,
        topGainer: topGainer
          ? { symbol: topGainer.symbol, changePct: topGainer.changePct ?? 0 }
          : null,
        topLoser: topLoser
          ? { symbol: topLoser.symbol, changePct: topLoser.changePct ?? 0 }
          : null,
      });
    }

    return summaries;
  } catch {
    return [];
  }
}

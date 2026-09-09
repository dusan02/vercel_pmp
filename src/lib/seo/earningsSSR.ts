import { prisma } from '@/lib/db/prisma';

export interface EarningsSSRRow {
  ticker: string;
  companyName: string;
  date: string; // YYYY-MM-DD
  time: string; // 'bmo' | 'amc' | 'dmt' | 'tbd'
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
  hasReported: boolean;
}

export interface EarningsSSRGroup {
  date: string;
  preMarket: EarningsSSRRow[];
  afterMarket: EarningsSSRRow[];
  timeTbd: EarningsSSRRow[];
  total: number;
}

function normalizeTime(time: string): 'bmo' | 'amc' | 'dmt' | 'tbd' {
  const t = time?.toLowerCase() ?? '';
  if (t === 'bmo' || t === 'before') return 'bmo';
  if (t === 'amc' || t === 'after') return 'amc';
  if (t === 'dmt') return 'dmt';
  return 'tbd';
}

function rowFromDB(e: {
  ticker: string;
  companyName: string;
  date: Date;
  time: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  epsSurprisePercent: number | null;
  revenueSurprisePercent: number | null;
}): EarningsSSRRow {
  const dateStr = new Date(e.date).toISOString().split('T')[0] ?? '';
  return {
    ticker: e.ticker,
    companyName: e.companyName || e.ticker,
    date: dateStr,
    time: normalizeTime(e.time),
    epsEstimate: e.epsEstimate ?? null,
    epsActual: e.epsActual ?? null,
    revenueEstimate: e.revenueEstimate ?? null,
    revenueActual: e.revenueActual ?? null,
    epsSurprisePercent: e.epsSurprisePercent ?? null,
    revenueSurprisePercent: e.revenueSurprisePercent ?? null,
    hasReported: e.epsActual != null || e.revenueActual != null,
  };
}

/**
 * Get earnings for a date range from EarningsCalendar DB table.
 * This is the SSR source — no Redis, no live API calls.
 */
export async function getEarningsRange(
  startDate: string,
  endDate: string,
): Promise<EarningsSSRGroup[]> {
  try {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    const rows = await prisma.earningsCalendar.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { ticker: 'asc' }],
    });

    // Group by date
    const byDate = new Map<string, EarningsSSRRow[]>();
    for (const r of rows) {
      const parsed = rowFromDB(r);
      const existing = byDate.get(parsed.date) ?? [];
      existing.push(parsed);
      byDate.set(parsed.date, existing);
    }

    // Build groups for each date in range
    const groups: EarningsSSRGroup[] = [];
    const current = new Date(startDate + 'T00:00:00Z');
    const endObj = new Date(endDate + 'T00:00:00Z');
    while (current <= endObj) {
      const dateStr = current.toISOString().split('T')[0] ?? '';
      const dayRows = byDate.get(dateStr) ?? [];
      groups.push({
        date: dateStr,
        preMarket: dayRows.filter((r) => r.time === 'bmo'),
        afterMarket: dayRows.filter((r) => r.time === 'amc' || r.time === 'dmt'),
        timeTbd: dayRows.filter((r) => r.time === 'tbd'),
        total: dayRows.length,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return groups;
  } catch (error) {
    console.error('[earningsSSR] Failed to fetch earnings range:', error);
    return [];
  }
}

/**
 * Get upcoming earnings (next N days from today).
 */
export async function getUpcomingEarnings(days: number = 14): Promise<EarningsSSRRow[]> {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0] ?? '';
    const endDate = new Date(today);
    endDate.setUTCDate(endDate.getUTCDate() + days);
    const endStr = endDate.toISOString().split('T')[0] ?? '';

    const groups = await getEarningsRange(todayStr, endStr);
    return groups.flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd]);
  } catch {
    return [];
  }
}

/**
 * Get recently reported earnings (past N days).
 */
export async function getReportedEarnings(days: number = 7): Promise<EarningsSSRRow[]> {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - days);
    const startStr = start.toISOString().split('T')[0] ?? '';
    const endStr = today.toISOString().split('T')[0] ?? '';

    const groups = await getEarningsRange(startStr, endStr);
    return groups
      .flatMap((g) => [...g.preMarket, ...g.afterMarket, ...g.timeTbd])
      .filter((r) => r.hasReported);
  } catch {
    return [];
  }
}

/**
 * Get earnings for a specific ticker (upcoming + recent reported).
 */
export async function getEarningsForTicker(
  ticker: string,
  daysBack: number = 90,
  daysForward: number = 30,
): Promise<{ upcoming: EarningsSSRRow[]; recent: EarningsSSRRow[] }> {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - daysBack);
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + daysForward);

    const rows = await prisma.earningsCalendar.findMany({
      where: {
        ticker: ticker.toUpperCase(),
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'desc' },
    });

    const parsed = rows.map(rowFromDB);
    const todayStr = today.toISOString().split('T')[0] ?? '';

    return {
      upcoming: parsed.filter((r) => r.date >= todayStr),
      recent: parsed.filter((r) => r.date < todayStr),
    };
  } catch {
    return { upcoming: [], recent: [] };
  }
}

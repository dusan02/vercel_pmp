import { prisma } from '@/lib/db/prisma';
import { getDateET } from '@/lib/utils/dateET';

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
  marketCap: number | null;
  percentChange: number | null;
  hasReported: boolean;
  // Enriched at read time (join Ticker/AnalysisCache/EwScoreSnapshot/DailyRef).
  // EarningsCalendar.marketCap/.percentChange columns are never written by
  // the Finnhub sync — these fields are the live replacements.
  sector: string | null;
  stdDev20d: number | null;        // typical daily move proxy (own 20d σ)
  earningsDayMovePct: number | null; // DailyRef-derived move on the report day (bmo) or next session (amc)
  overallScore: number | null;
  valuationScore: number | null;
  growthScore: number | null;
  profitabilityScore: number | null;
  healthScore: number | null;
  qualityScore: number | null;
  ewScore: number | null;
  ewMaxPossible: number | null;
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
  marketCap: number | null;
  percentChange: number | null;
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
    marketCap: e.marketCap ?? null,
    percentChange: e.percentChange ?? null,
    hasReported: e.epsActual != null || e.revenueActual != null,
    sector: null,
    stdDev20d: null,
    earningsDayMovePct: null,
    overallScore: null,
    valuationScore: null,
    growthScore: null,
    profitabilityScore: null,
    healthScore: null,
    qualityScore: null,
    ewScore: null,
    ewMaxPossible: null,
  };
}

/**
 * Read-time enrichment: joins Ticker (marketCap/sector/stdDev20d),
 * AnalysisCache (pillar scores), EwScoreSnapshot (latest), and DailyRef
 * (earnings-day move) onto SSR rows. All batched `IN` queries — bounded
 * by the row count of the requested range, no per-row fetches.
 *
 * Day-move semantics: a BMO report's reaction lands in that day's regular
 * session; an AMC report's lands in the NEXT trading day — we take the
 * first DailyRef strictly after the report date for amc/dmt rows.
 */
async function enrichEarningsRows(
  rows: EarningsSSRRow[],
  rangeStart: string,
  rangeEnd: string,
): Promise<void> {
  if (rows.length === 0) return;
  const symbols = [...new Set(rows.map((r) => r.ticker))];
  // DailyRef window: report dates + up to 5d after range end (amc next-session move).
  const refStart = new Date(rangeStart + 'T00:00:00Z');
  const refEnd = new Date(rangeEnd + 'T00:00:00Z');
  refEnd.setUTCDate(refEnd.getUTCDate() + 5);

  const mcapLookback = new Date(Date.now() - 14 * 86400_000);
  const [tickers, mcaps, caches, ews, dailyRefs] = await Promise.all([
    prisma.ticker.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, sector: true, stdDevReturn20d: true },
    }),
    // DailyValuationHistory is the live market-cap source (Ticker.lastMarketCap
    // and EarningsCalendar.marketCap are both unpopulated).
    prisma.dailyValuationHistory.findMany({
      where: { symbol: { in: symbols }, date: { gte: mcapLookback }, marketCap: { not: null } },
      orderBy: { date: 'desc' },
      select: { symbol: true, marketCap: true },
    }),
    prisma.analysisCache.findMany({
      where: { symbol: { in: symbols } },
      select: {
        symbol: true, overallScore: true, valuationScore: true, growthScore: true,
        profitabilityScore: true, healthScore: true, qualityScore: true,
      },
    }),
    prisma.ewScoreSnapshot.findMany({
      where: { symbol: { in: symbols } },
      orderBy: { asOfDate: 'desc' },
      select: { symbol: true, totalScore: true, maxPossible: true },
    }),
    prisma.dailyRef.findMany({
      where: {
        symbol: { in: symbols },
        regularClose: { not: null },
        date: { gte: refStart, lte: refEnd },
      },
      orderBy: { date: 'asc' },
      select: { symbol: true, date: true, previousClose: true, regularClose: true },
    }),
  ]);

  const tickerBy = new Map(tickers.map((t) => [t.symbol, t]));
  const cacheBy = new Map(caches.map((c) => [c.symbol, c]));
  const ewBy = new Map<string, { totalScore: number; maxPossible: number }>();
  for (const e of ews) {
    if (!ewBy.has(e.symbol)) ewBy.set(e.symbol, e); // desc order — first wins
  }
  const mcapBy = new Map<string, number>();
  for (const m of mcaps) {
    if (!mcapBy.has(m.symbol) && m.marketCap !== null) mcapBy.set(m.symbol, m.marketCap);
  }
  // DailyRef.date is ET-midnight (stored 04:00/05:00 UTC) while
  // EarningsCalendar.date is UTC-midnight — match by ET date string.
  const refsBy = new Map<string, { dateStr: string; previousClose: number; regularClose: number | null }[]>();
  for (const r of dailyRefs) {
    const arr = refsBy.get(r.symbol) ?? [];
    arr.push({ dateStr: getDateET(r.date), previousClose: r.previousClose, regularClose: r.regularClose });
    refsBy.set(r.symbol, arr);
  }

  for (const row of rows) {
    const t = tickerBy.get(row.ticker);
    if (t) {
      row.sector = t.sector;
      row.stdDev20d = t.stdDevReturn20d;
    }
    row.marketCap = row.marketCap ?? mcapBy.get(row.ticker) ?? null;
    const c = cacheBy.get(row.ticker);
    if (c) {
      row.overallScore = c.overallScore;
      row.valuationScore = c.valuationScore;
      row.growthScore = c.growthScore;
      row.profitabilityScore = c.profitabilityScore;
      row.healthScore = c.healthScore;
      row.qualityScore = c.qualityScore;
    }
    const ew = ewBy.get(row.ticker);
    if (ew) {
      row.ewScore = Math.round(ew.totalScore);
      row.ewMaxPossible = Math.round(ew.maxPossible);
    }

    // Earnings-day move only for reported rows.
    if (row.hasReported) {
      const refs = refsBy.get(row.ticker);
      if (refs && refs.length > 0) {
        const afterReport = row.time === 'bmo'
          ? refs.find((r) => r.dateStr === row.date)
          : refs.find((r) => r.dateStr > row.date); // amc/dmt → next session
        if (afterReport && afterReport.previousClose > 0 && afterReport.regularClose !== null) {
          row.earningsDayMovePct =
            ((afterReport.regularClose - afterReport.previousClose) / afterReport.previousClose) * 100;
          row.percentChange = row.percentChange ?? row.earningsDayMovePct;
        }
      }
    }
  }
}

export interface EarningsWeekDay {
  date: string;
  preMarket: EarningsSSRRow[];
  afterMarket: EarningsSSRRow[];
  timeTbd: EarningsSSRRow[];
}

/**
 * Get earnings for a Mon-Sun week as a date-keyed map.
 * Shared by homepage SSR and /api/earnings/week — one data shape for both.
 * weekStartStr: YYYY-MM-DD of Monday.
 */
export async function getEarningsWeekMap(
  weekStartStr: string,
): Promise<Record<string, EarningsWeekDay>> {
  try {
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartStr + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      weekDates.push(d.toISOString().split('T')[0] ?? '');
    }

    const start = new Date(weekDates[0] + 'T00:00:00Z');
    const end = new Date(weekDates[6] + 'T23:59:59Z');

    const rows = await prisma.earningsCalendar.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { ticker: 'asc' }],
    });

    const byDate = new Map<string, EarningsSSRRow[]>();
    for (const r of rows) {
      const parsed = rowFromDB(r);
      const existing = byDate.get(parsed.date) ?? [];
      existing.push(parsed);
      byDate.set(parsed.date, existing);
    }

    const map: Record<string, EarningsWeekDay> = {};
    for (const dateStr of weekDates) {
      const dayRows = byDate.get(dateStr) ?? [];
      map[dateStr] = {
        date: dateStr,
        preMarket: dayRows.filter((r) => r.time === 'bmo'),
        afterMarket: dayRows.filter((r) => r.time === 'amc' || r.time === 'dmt'),
        timeTbd: dayRows.filter((r) => r.time === 'tbd'),
      };
    }
    return map;
  } catch (error) {
    console.error('[earningsSSR] Failed to fetch week map:', error);
    return {};
  }
}

/**
 * Get earnings for a date range from EarningsCalendar DB table.
 * This is the SSR source — no Redis, no live API calls.
 */
export async function getEarningsRange(
  startDate: string,
  endDate: string,
  opts?: { enrich?: boolean },
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
    const allRows: EarningsSSRRow[] = [];
    for (const r of rows) {
      const parsed = rowFromDB(r);
      const existing = byDate.get(parsed.date) ?? [];
      existing.push(parsed);
      byDate.set(parsed.date, existing);
      allRows.push(parsed);
    }

    if (opts?.enrich) {
      try {
        await enrichEarningsRows(allRows, startDate, endDate);
      } catch (e) {
        // Enrichment is additive — never block the earnings list on it.
        console.warn('[earningsSSR] enrichment failed, continuing without:', e);
      }
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
    // Build-time prerender has no DB — return empty there (ISR regenerates
    // with real data on first request). At RUNTIME throw instead of returning
    // [] so a transient DB error can't get ISR-cached as "No earnings
    // scheduled" (keeps last good version / surfaces as 500).
    if (process.env.NEXT_PHASE === 'phase-production-build') return [];
    throw error;
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

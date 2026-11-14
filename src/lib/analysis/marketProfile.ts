import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { dedupeShareClasses } from '@/lib/companyNames';
import { getDateET } from '@/lib/utils/dateET';
import { foreignCutoffMs } from '@/lib/tickerRenames';
import {
  adjustDividendsForSplits,
  buildDividendProfile,
  computePerformance,
  computeRisk,
  exchangeLabel,
  securityTypeLabel,
  type CompanyFacts,
  type DailyClose,
  type DividendProfile,
  type MarketProfile,
  type PeerRow,
  type RawDividend,
  type RawSplit,
} from './marketProfileMath';

const PROFILE_TTL = 3600;        // 1h full assembled profile
const PROFILE_PENDING_TTL = 60;  // 1m short TTL if peers call rate-limited
const DIVS_TTL = 86_400;         // 24h Polygon dividends + splits
const FACTS_TTL = 604_800;       // 7d Polygon reference ticker facts
const PEERS_TTL = 604_800;       // 7d Finnhub industry peers
const DAY_MS = 86_400_000;

interface CachedDividendsPayload {
  currency: string;
  divs: RawDividend[];
  splits: RawSplit[];
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function fetchDailyClosesFromDbOrPolygon(
  symbol: string,
  fromDate: Date,
  polygonKey: string | undefined,
): Promise<DailyClose[]> {
  try {
    const rows = await prisma.dailyValuationHistory.findMany({
      where: { symbol, closePrice: { gt: 0 }, date: { gte: fromDate } },
      orderBy: { date: 'asc' },
      select: { date: true, closePrice: true },
    });
    if (rows.length >= 10) {
      return rows
        .filter((r) => r.closePrice != null && r.closePrice > 0)
        .map((r) => ({ t: r.date.getTime(), c: r.closePrice! }));
    }
  } catch {
    // fall through to Polygon if DB unavailable
  }

  if (!polygonKey || polygonKey.startsWith('dummy')) return [];

  const cacheKey = `polygon:daily5y:v1:${symbol}`;
  try {
    const cached = (await getCachedData(cacheKey)) as DailyClose[] | null;
    if (Array.isArray(cached) && cached.length >= 10) return cached;
  } catch {}

  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = getDateET();
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${polygonKey}`;
  const { ok, data } = await fetchJsonWithTimeout<{ results?: Array<{ t?: number; c?: number }> }>(url, 3500);
  if (!ok || !Array.isArray(data?.results)) return [];

  const raw = data.results
    .filter((b): b is { t: number; c: number } => typeof b.t === 'number' && typeof b.c === 'number' && b.c > 0);
  const cutoff = foreignCutoffMs(symbol, raw);
  const bars = cutoff != null ? raw.filter((b) => b.t >= cutoff) : raw;

  if (bars.length > 0) {
    try { await setCachedData(cacheKey, bars, 3600); } catch {}
  }
  return bars;
}

async function fetchDividendProfileCached(
  symbol: string,
  polygonKey: string | undefined,
  todayET: string,
): Promise<DividendProfile | null> {
  if (!polygonKey || polygonKey.startsWith('dummy')) return null;

  const cacheKey = `polygon:divs:v1:${symbol}`;
  let payload: CachedDividendsPayload | null = null;
  try {
    payload = (await getCachedData(cacheKey)) as CachedDividendsPayload | null;
  } catch {}

  if (!payload) {
    const divsUrl =
      `https://api.polygon.io/v3/reference/dividends?ticker=${encodeURIComponent(symbol)}` +
      `&limit=100&order=desc&sort=ex_dividend_date&apiKey=${polygonKey}`;
    const splitsUrl =
      `https://api.polygon.io/v3/reference/splits?ticker=${encodeURIComponent(symbol)}` +
      `&limit=50&apiKey=${polygonKey}`;

    const [divsRes, splitsRes] = await Promise.all([
      fetchJsonWithTimeout<{ results?: RawDividend[] }>(divsUrl, 3500),
      fetchJsonWithTimeout<{ results?: RawSplit[] }>(splitsUrl, 3500),
    ]);

    if (divsRes.ok && splitsRes.ok) {
      const divs = Array.isArray(divsRes.data?.results) ? divsRes.data!.results! : [];
      const splits = Array.isArray(splitsRes.data?.results) ? splitsRes.data!.results! : [];
      const currency = divs.find((d) => d.currency)?.currency || 'USD';
      payload = { currency, divs, splits };
      try { await setCachedData(cacheKey, payload, DIVS_TTL); } catch {}
    } else if (divsRes.ok) {
      // Partial: still render without caching missing splits so next run retries
      const divs = Array.isArray(divsRes.data?.results) ? divsRes.data!.results! : [];
      payload = { currency: divs.find((d) => d.currency)?.currency || 'USD', divs, splits: [] };
    }
  }

  if (!payload || payload.divs.length === 0) return null;
  const adjusted = adjustDividendsForSplits(payload.divs, payload.splits);
  return buildDividendProfile(adjusted, todayET, payload.currency);
}

async function fetchCompanyFactsCached(
  symbol: string,
  polygonKey: string | undefined,
): Promise<CompanyFacts | null> {
  if (!polygonKey || polygonKey.startsWith('dummy')) return null;

  const cacheKey = `polygon:facts:v1:${symbol}`;
  try {
    const cached = (await getCachedData(cacheKey)) as CompanyFacts | null;
    if (cached) return cached;
  } catch {}

  const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}?apiKey=${polygonKey}`;
  const { ok, data } = await fetchJsonWithTimeout<{
    results?: {
      list_date?: string;
      cik?: string;
      primary_exchange?: string;
      type?: string;
    };
  }>(url, 3000);

  if (!ok || !data?.results) return null;
  const r = data.results;
  const facts: CompanyFacts = {
    listDate: r.list_date || null,
    cik: r.cik || null,
    exchange: exchangeLabel(r.primary_exchange),
    securityType: securityTypeLabel(r.type),
  };
  try { await setCachedData(cacheKey, facts, FACTS_TTL); } catch {}
  return facts;
}

async function fetchFinnhubPeersCached(
  symbol: string,
  finnhubKey: string | undefined,
): Promise<{ peers: string[]; pending: boolean }> {
  if (!finnhubKey) return { peers: [], pending: false };

  const cacheKey = `finnhub:peers:v1:${symbol}`;
  try {
    const cached = (await getCachedData(cacheKey)) as string[] | null;
    if (Array.isArray(cached)) return { peers: cached, pending: false };
  } catch {}

  const url =
    `https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(symbol)}` +
    `&grouping=industry&token=${finnhubKey}`;
  const { ok, data } = await fetchJsonWithTimeout<string[]>(url, 2500);
  if (!ok || !Array.isArray(data)) {
    return { peers: [], pending: true };
  }

  const cleaned = [...new Set(
    data
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.toUpperCase().trim())
      .filter((s) => s !== symbol),
  )];
  try { await setCachedData(cacheKey, cleaned, PEERS_TTL); } catch {}
  return { peers: cleaned, pending: false };
}

async function resolvePeerRows(
  symbol: string,
  selfName: string | null,
  selfSector: string | null,
  selfIndustry: string | null,
  isEtf: boolean,
  finnhubKey: string | undefined,
): Promise<{ peers: PeerRow[]; peersPending: boolean }> {
  if (isEtf) return { peers: [], peersPending: false };

  const { peers: finnhubPeers, pending: peersPending } = await fetchFinnhubPeersCached(symbol, finnhubKey);

  // Filter Finnhub peers against known Tickers in our DB so links work and names resolve
  const candidateSymbols: string[] = [];
  if (finnhubPeers.length > 0) {
    const known = await prisma.ticker.findMany({
      where: {
        symbol: { in: finnhubPeers.slice(0, 25) },
        assetType: { notIn: ['ETF', 'LEVERAGED_ETF'] },
      },
      orderBy: { lastMarketCap: 'desc' },
      select: { symbol: true, name: true },
    });
    // Preserve Finnhub industry-proximity ordering while ensuring share-class dedup against self
    const knownMap = new Map(known.map((k) => [k.symbol, k]));
    const orderedCandidates = finnhubPeers
      .map((sym) => knownMap.get(sym))
      .filter((k): k is { symbol: string; name: string | null } => k != null);
    const deduped = dedupeShareClasses(
      [{ symbol, name: selfName }, ...orderedCandidates],
      6,
    ).filter((x) => x.symbol !== symbol);
    for (const d of deduped) candidateSymbols.push(d.symbol);
  }

  // Fallback to same-industry / same-sector top market-cap tickers when <2 peers found
  if (candidateSymbols.length < 2 && (selfIndustry || selfSector)) {
    const exclude = new Set([symbol, ...candidateSymbols]);
    const fallbackWhere = selfIndustry
      ? { industry: selfIndustry, symbol: { notIn: [...exclude] }, lastMarketCap: { gt: 0 }, assetType: { notIn: ['ETF', 'LEVERAGED_ETF'] } }
      : { sector: selfSector!, symbol: { notIn: [...exclude] }, lastMarketCap: { gt: 0 }, assetType: { notIn: ['ETF', 'LEVERAGED_ETF'] } };
    let dbFallback = await prisma.ticker.findMany({
      where: fallbackWhere,
      orderBy: { lastMarketCap: 'desc' },
      take: 12,
      select: { symbol: true, name: true },
    });
    if (dbFallback.length < 2 && selfIndustry && selfSector) {
      dbFallback = await prisma.ticker.findMany({
        where: { sector: selfSector, symbol: { notIn: [...exclude] }, lastMarketCap: { gt: 0 }, assetType: { notIn: ['ETF', 'LEVERAGED_ETF'] } },
        orderBy: { lastMarketCap: 'desc' },
        take: 12,
        select: { symbol: true, name: true },
      });
    }
    const dedupedFallback = dedupeShareClasses(
      [{ symbol, name: selfName }, ...candidateSymbols.map((s) => ({ symbol: s, name: null })), ...dbFallback],
      6,
    ).filter((x) => x.symbol !== symbol && !exclude.has(x.symbol));
    for (const d of dedupedFallback) {
      if (candidateSymbols.length >= 5) break;
      candidateSymbols.push(d.symbol);
    }
  }

  if (candidateSymbols.length === 0) {
    return { peers: [], peersPending };
  }

  const allSymbols = [symbol, ...candidateSymbols.slice(0, 5)];
  const [tickers, caches, fhMetrics, latestDvh] = await Promise.all([
    prisma.ticker.findMany({
      where: { symbol: { in: allSymbols } },
      select: {
        symbol: true,
        name: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
      },
    }),
    prisma.analysisCache.findMany({
      where: { symbol: { in: allSymbols } },
      select: { symbol: true, overallScore: true, revenueCagr: true },
    }),
    prisma.finnhubMetrics.findMany({
      where: { symbol: { in: allSymbols } },
      select: { symbol: true, peRatio: true, dividendYield: true },
    }),
    Promise.all(
      allSymbols.map((s) =>
        prisma.dailyValuationHistory.findFirst({
          where: { symbol: s, closePrice: { gt: 0 } },
          orderBy: { date: 'desc' },
          select: { symbol: true, peRatio: true, marketCap: true },
        }),
      ),
    ),
  ]);

  const tickerBy = new Map(tickers.map((t) => [t.symbol, t]));
  const cacheBy = new Map(caches.map((c) => [c.symbol, c]));
  const fhBy = new Map(fhMetrics.map((f) => [f.symbol, f]));
  const dvhBy = new Map(latestDvh.filter((d): d is NonNullable<typeof d> => d != null).map((d) => [d.symbol, d]));

  const rows: PeerRow[] = allSymbols
    .filter((s) => tickerBy.has(s))
    .map((s) => {
      const t = tickerBy.get(s)!;
      const c = cacheBy.get(s);
      const f = fhBy.get(s);
      const d = dvhBy.get(s);
      const mcapB =
        t.lastMarketCap != null && t.lastMarketCap > 0
          ? t.lastMarketCap
          : d?.marketCap != null && d.marketCap > 0
            ? d.marketCap / 1e9
            : null;
      return {
        symbol: s,
        name: t.name ?? null,
        price: t.lastPrice ?? null,
        changePct: t.lastChangePct ?? null,
        marketCap: mcapB,
        pe: d?.peRatio ?? f?.peRatio ?? null,
        revenueCagr: c?.revenueCagr ?? null,
        dividendYield: f?.dividendYield ?? null,
        overallScore: c?.overallScore ?? null,
        isSelf: s === symbol,
      };
    });

  return { peers: rows, peersPending };
}

export interface MarketProfileSeed {
  name: string | null;
  assetType: string | null;
  sector: string | null;
  industry: string | null;
  payoutRatio?: number | null;
}

export async function getMarketProfile(rawSymbol: string, seed?: MarketProfileSeed): Promise<MarketProfile> {
  const symbol = rawSymbol.toUpperCase().trim();
  const cacheKey = `market-profile:v1:${symbol}`;
  try {
    const cached = (await getCachedData(cacheKey)) as MarketProfile | null;
    if (cached && !cached.peersPending) return cached;
  } catch {}

  const polygonKey = process.env.POLYGON_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const todayET = getDateET();
  const fiveYearsAgo = new Date(Date.now() - 5.1 * 365 * DAY_MS);

  const selfMeta = seed
    ? {
        name: seed.name,
        assetType: seed.assetType,
        sector: seed.sector,
        industry: seed.industry,
        payoutRatio: seed.payoutRatio ?? null,
      }
    : await prisma.ticker
        .findUnique({
          where: { symbol },
          select: {
            name: true,
            assetType: true,
            sector: true,
            industry: true,
            finnhubMetrics: { select: { payoutRatio: true } },
          },
        })
        .then((t) =>
          t
            ? {
                name: t.name,
                assetType: t.assetType,
                sector: t.sector,
                industry: t.industry,
                payoutRatio: t.finnhubMetrics?.payoutRatio ?? null,
              }
            : null,
        );

  const isEtf = selfMeta?.assetType === 'ETF' || selfMeta?.assetType === 'LEVERAGED_ETF';

  const [stockCloses, spyCloses, dividends, facts, peerData] = await Promise.all([
    fetchDailyClosesFromDbOrPolygon(symbol, fiveYearsAgo, polygonKey),
    symbol === 'SPY'
      ? Promise.resolve<DailyClose[]>([])
      : fetchDailyClosesFromDbOrPolygon('SPY', fiveYearsAgo, polygonKey),
    fetchDividendProfileCached(symbol, polygonKey, todayET),
    fetchCompanyFactsCached(symbol, polygonKey),
    resolvePeerRows(
      symbol,
      selfMeta?.name ?? null,
      selfMeta?.sector ?? null,
      selfMeta?.industry ?? null,
      isEtf,
      finnhubKey,
    ),
  ]);

  const effectiveSpy = symbol === 'SPY' ? [] : spyCloses;
  const perf = computePerformance(stockCloses, effectiveSpy);
  const risk = symbol === 'SPY' ? null : computeRisk(stockCloses, effectiveSpy);

  const profile: MarketProfile = {
    symbol,
    asOf: perf.asOf,
    performance: perf.rows,
    risk,
    dividends,
    payoutRatio: selfMeta?.payoutRatio ?? null,
    facts,
    peers: peerData.peers,
    peersPending: peerData.peersPending,
    generatedAt: new Date().toISOString(),
  };

  try {
    await setCachedData(
      cacheKey,
      profile,
      peerData.peersPending ? PROFILE_PENDING_TTL : PROFILE_TTL,
    );
  } catch {}

  return profile;
}

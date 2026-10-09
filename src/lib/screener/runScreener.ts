import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { downsampleSeries, RANGE_FILTERS } from '@/lib/utils/screener';

const SCREENER_CACHE_TTL = 600; // 10 minutes

/**
 * Shared screener pipeline — used by /api/analysis/screener (HTTP layer adds
 * NextResponse/status) and by /screener page SSR (initialData for the first
 * paint, replacing the old client-only "Searching..." state).
 *
 * Parses filter params, checks the Redis cache, runs the Prisma query and
 * returns the JSON-serialisable response body.
 */
export async function runScreener(searchParams: URLSearchParams): Promise<Record<string, any>> {
    // NaN-safe param parsing — `?minHealth=abc` must not leak NaN into
    // Prisma filters (it would throw / return garbage instead of ignoring
    // the filter).
    const num = (key: string): number | undefined => {
        const v = searchParams.get(key);
        if (!v) return undefined;
        const n = parseFloat(v);
        return isFinite(n) ? n : undefined;
    };
    const int = (key: string): number | undefined => {
        const v = searchParams.get(key);
        if (!v) return undefined;
        const n = parseInt(v, 10);
        return isFinite(n) ? n : undefined;
    };

    // Score filters (min/max)
    const minHealth = num('minHealth');
    const minProfitability = num('minProfitability');
    const minValuation = num('minValuation');
    const minAltman = num('minAltman');
    const minPiotroski = int('minPiotroski');
    // Beneish: lower = better. maxBeneish filters "at most this manipulation risk"
    const maxBeneish = num('maxBeneish');
    const minFcfMargin = num('minFcfMargin');
    // Debt repayment: lower = better. maxDebtRepayment filters "at most this many years"
    const maxDebtRepayment = num('maxDebtRepayment');
    const maxHealth = num('maxHealth');
    const maxProfitability = num('maxProfitability');
    const maxValuation = num('maxValuation');
    const minGrowth = num('minGrowth');
    const maxGrowth = num('maxGrowth');
    const minQuality = num('minQuality');
    const maxQuality = num('maxQuality');
    const minOverall = num('minOverall');
    const maxOverall = num('maxOverall');
    const sector = searchParams.get('sector') || undefined;
    const industry = searchParams.get('industry') || undefined;
    // Search: symbol or company name (case-insensitive contains)
    const q = searchParams.get('q')?.trim() || undefined;
    // Market Cap filter (in billions)
    const minMarketCap = num('minMarketCap');
    const maxMarketCap = num('maxMarketCap');

    // Range filters driven by RANGE_FILTERS — the single registry that maps
    // every min<Cap>/max<Cap> param to its target: Ticker column (price,
    // changePct), FinnhubMetrics relation (roe, peRatio, …) or
    // InsiderAggregate relation (netBuyValue90d, netBuyPct90d). Adding a new
    // filterable metric = one line in screener.ts.
    const metricRanges: { source: string; field: string; min?: number; max?: number }[] = [];
    for (const def of RANGE_FILTERS) {
        const cap = def.key[0]!.toUpperCase() + def.key.slice(1);
        const lo = num(`min${cap}`);
        const hi = num(`max${cap}`);
        if (lo !== undefined || hi !== undefined) {
            const range: { source: string; field: string; min?: number; max?: number } = { source: def.source, field: def.field ?? def.key };
            if (lo !== undefined) range.min = lo;
            if (hi !== undefined) range.max = hi;
            metricRanges.push(range);
        }
    }
    const tickerRanges = metricRanges.filter((r) => r.source === 'ticker');
    const finnhubRanges = metricRanges.filter((r) => r.source === 'finnhub');
    const insiderRanges = metricRanges.filter((r) => r.source === 'insider');

    // Price & day-change ranges (Ticker columns, source='ticker')
    const minPrice = tickerRanges.find((r) => r.field === 'lastPrice')?.min;
    const maxPrice = tickerRanges.find((r) => r.field === 'lastPrice')?.max;
    const minChangePct = tickerRanges.find((r) => r.field === 'lastChangePct')?.min;
    const maxChangePct = tickerRanges.find((r) => r.field === 'lastChangePct')?.max;

    // Pagination & Sorting — clamp NaN/negative/oversized values
    const page = Math.max(1, int('page') ?? 1);
    const limit = Math.min(200, Math.max(1, int('limit') ?? 50));
    const sortParams = searchParams.get('sort') || 'ticker.lastMarketCap:desc';
    const parts = sortParams.split(':');
    const sortField = parts[0] || 'ticker.lastMarketCap';
    const sortOrder = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

    // Build cache key from query params — ranges serialize as
    // source.field=min-max so any registry key busts the cache correctly.
    const metricsKey = metricRanges
        .map((r) => `${r.source}.${r.field}=${r.min ?? ''}-${r.max ?? ''}`)
        .join('|');
    const cacheKey = `screener:${minHealth || ''}:${maxHealth || ''}:${minProfitability || ''}:${maxProfitability || ''}:${minValuation || ''}:${maxValuation || ''}:${minGrowth || ''}:${maxGrowth || ''}:${minQuality || ''}:${maxQuality || ''}:${minOverall || ''}:${maxOverall || ''}:${minAltman || ''}:${minPiotroski || ''}:${maxBeneish || ''}:${minFcfMargin || ''}:${maxDebtRepayment || ''}:${sector || ''}:${industry || ''}:${q || ''}:${minMarketCap || ''}:${maxMarketCap || ''}:${minPrice || ''}:${maxPrice || ''}:${minChangePct || ''}:${maxChangePct || ''}:${metricsKey}:${page}:${limit}:${sortParams}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return cached as Record<string, any>;
    } catch {}

    try {
        // ── Base query: Ticker (ALL stocks with a price) ──
        const tickerWhere: any = { lastPrice: { gt: 0 } };
        if (sector) tickerWhere.sector = sector;
        if (industry) tickerWhere.industry = industry;
        if (q) {
            // SQLite has no `mode: 'insensitive'` — match raw, lower, upper
            // and Title Case variants (company names are stored Title Case:
            // "apple" must find "Apple Inc.").
            const title = q.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
            const variants = [...new Set([q, q.toLowerCase(), q.toUpperCase(), title])];
            tickerWhere.OR = [
                ...variants.map((v) => ({ symbol: { contains: v } })),
                ...variants.map((v) => ({ name: { contains: v } })),
            ];
        }
        // Market Cap filter (stored in billions on Ticker)
        if (minMarketCap !== undefined || maxMarketCap !== undefined) {
            tickerWhere.lastMarketCap = {};
            if (minMarketCap !== undefined) tickerWhere.lastMarketCap.gte = minMarketCap;
            if (maxMarketCap !== undefined) tickerWhere.lastMarketCap.lte = maxMarketCap;
        }
        // Price / day-change range filters (Ticker columns)
        if (minPrice !== undefined || maxPrice !== undefined) {
            tickerWhere.lastPrice = { ...(tickerWhere.lastPrice ?? {}) };
            if (minPrice !== undefined) tickerWhere.lastPrice.gte = minPrice;
            if (maxPrice !== undefined) tickerWhere.lastPrice.lte = maxPrice;
        }
        if (minChangePct !== undefined || maxChangePct !== undefined) {
            tickerWhere.lastChangePct = {};
            if (minChangePct !== undefined) tickerWhere.lastChangePct.gte = minChangePct;
            if (maxChangePct !== undefined) tickerWhere.lastChangePct.lte = maxChangePct;
        }

        // ── Relation range filters (FinnhubMetrics + InsiderAggregate) ──
        // Same pattern as analysisCache — an active range requires the
        // relation row, so tickers without coverage drop out.
        if (finnhubRanges.length > 0) {
            const fm: any = {};
            for (const r of finnhubRanges) {
                fm[r.field] = {};
                if (r.min !== undefined) fm[r.field].gte = r.min;
                if (r.max !== undefined) fm[r.field].lte = r.max;
            }
            tickerWhere.finnhubMetrics = { is: fm };
        }
        if (insiderRanges.length > 0) {
            const ins: any = {};
            for (const r of insiderRanges) {
                ins[r.field] = {};
                if (r.min !== undefined) ins[r.field].gte = r.min;
                if (r.max !== undefined) ins[r.field].lte = r.max;
            }
            tickerWhere.insiderAggregate = { is: ins };
        }

        // ── Fundamental filters apply on the AnalysisCache relation ──
        // When any score filter is active, tickers without analysis are
        // excluded automatically (they cannot match a score condition).
        const hasScoreFilter = [minHealth, maxHealth, minProfitability, maxProfitability, minValuation, maxValuation, minGrowth, maxGrowth, minQuality, maxQuality, minOverall, maxOverall, minAltman, minPiotroski, maxBeneish, minFcfMargin, maxDebtRepayment].some((v) => v !== undefined);
        if (hasScoreFilter) {
            const ac: any = {};
            if (minHealth !== undefined || maxHealth !== undefined) {
                ac.healthScore = {};
                if (minHealth !== undefined) ac.healthScore.gte = minHealth;
                if (maxHealth !== undefined) ac.healthScore.lte = maxHealth;
            }
            if (minProfitability !== undefined || maxProfitability !== undefined) {
                ac.profitabilityScore = {};
                if (minProfitability !== undefined) ac.profitabilityScore.gte = minProfitability;
                if (maxProfitability !== undefined) ac.profitabilityScore.lte = maxProfitability;
            }
            if (minValuation !== undefined || maxValuation !== undefined) {
                ac.valuationScore = {};
                if (minValuation !== undefined) ac.valuationScore.gte = minValuation;
                if (maxValuation !== undefined) ac.valuationScore.lte = maxValuation;
            }
            if (minGrowth !== undefined || maxGrowth !== undefined) {
                ac.growthScore = {};
                if (minGrowth !== undefined) ac.growthScore.gte = minGrowth;
                if (maxGrowth !== undefined) ac.growthScore.lte = maxGrowth;
            }
            if (minQuality !== undefined || maxQuality !== undefined) {
                ac.qualityScore = {};
                if (minQuality !== undefined) ac.qualityScore.gte = minQuality;
                if (maxQuality !== undefined) ac.qualityScore.lte = maxQuality;
            }
            if (minOverall !== undefined || maxOverall !== undefined) {
                ac.overallScore = {};
                if (minOverall !== undefined) ac.overallScore.gte = minOverall;
                if (maxOverall !== undefined) ac.overallScore.lte = maxOverall;
            }
            if (minAltman !== undefined) ac.altmanZ = { gte: minAltman };
            if (minPiotroski !== undefined) ac.piotroskiScore = { gte: minPiotroski };
            // Beneish: lower = better. maxBeneish means "show only companies with Beneish <= X"
            if (maxBeneish !== undefined) ac.beneishScore = { lte: maxBeneish };
            if (minFcfMargin !== undefined) ac.fcfMargin = { gte: minFcfMargin };
            // Debt repayment: lower = better. maxDebtRepayment means "show only companies with debt repayment <= X years"
            if (maxDebtRepayment !== undefined) ac.debtRepaymentYears = { lte: maxDebtRepayment };
            tickerWhere.analysisCache = { is: ac };
        }

        const where: any = tickerWhere;

        // Build Prisma orderBy — score fields live on analysisCache, market
        // fields on ticker. Nulls (tickers without analysis) always last.
        const SCORE_FIELDS = new Set(['healthScore', 'profitabilityScore', 'valuationScore', 'growthScore', 'qualityScore', 'overallScore', 'altmanZ', 'piotroskiScore', 'beneishScore', 'fcfMargin', 'debtRepaymentYears']);
        // Insider aggregate sort fields (insider.<field> → insiderAggregate rel)
        const INSIDER_FIELDS = new Set(['netBuyPct90d', 'netBuyValue90d', 'largestBuyValue90d', 'largestSellValue90d', 'uniqueBuyers14d', 'uniqueSellers14d']);
        // Whitelist of sortable Ticker columns — an arbitrary `sort=ticker.X`
        // value would otherwise reach Prisma orderBy and 500 on unknown fields.
        const TICKER_FIELDS = new Set(['symbol', 'name', 'sector', 'industry', 'lastPrice', 'lastChangePct', 'lastMarketCap', 'lastPriceUpdated']);

        let orderBy: any;
        const isMcapDiffSort = sortField === 'ticker.lastMarketCapDiff';
        if (isMcapDiffSort) {
            // marketCapDiff is a derived field (mcap·pct/(100+pct)) — not a DB
            // column, so Prisma can't orderBy it. Handled in fetchPage below.
            orderBy = { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        } else if (sortField.startsWith('ticker.')) {
            const field = sortField.slice('ticker.'.length);
            // Base query is ticker.findMany — ticker fields are direct columns
            orderBy = TICKER_FIELDS.has(field)
                ? { [field]: { sort: sortOrder, nulls: 'last' } }
                : { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        } else if (sortField.startsWith('insider.')) {
            const field = sortField.slice('insider.'.length);
            orderBy = INSIDER_FIELDS.has(field)
                ? { insiderAggregate: { [field]: { sort: sortOrder, nulls: 'last' } } }
                : { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        } else if (sortField.startsWith('metrics.')) {
            // FinnhubMetrics columns — whitelist = finnhub-source keys from
            // the shared RANGE_FILTERS registry.
            const field = sortField.slice('metrics.'.length);
            const finnhubKeys = RANGE_FILTERS.filter((d) => d.source === 'finnhub').map((d) => d.field ?? d.key);
            orderBy = finnhubKeys.includes(field)
                ? { finnhubMetrics: { [field]: { sort: sortOrder, nulls: 'last' } } }
                : { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        } else if (SCORE_FIELDS.has(sortField)) {
            orderBy = { analysisCache: { [sortField]: { sort: sortOrder, nulls: 'last' } } };
        } else {
            orderBy = { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        }

        const skip = (page - 1) * limit;

        const include = {
            analysisCache: {
                select: {
                    healthScore: true,
                    profitabilityScore: true,
                    valuationScore: true,
                    growthScore: true,
                    qualityScore: true,
                    overallScore: true,
                    altmanZ: true,
                    piotroskiScore: true,
                    beneishScore: true,
                    fcfMargin: true,
                    debtRepaymentYears: true,
                },
            },
            insiderAggregate: {
                select: {
                    netBuyPct90d: true,
                    netBuyValue90d: true,
                    largestBuyValue90d: true,
                    largestSellValue90d: true,
                    uniqueBuyers14d: true,
                    uniqueSellers14d: true,
                },
            },
            finnhubMetrics: {
                select: {
                    roe: true,
                    roa: true,
                    peRatio: true,
                    forwardPe: true,
                    psRatio: true,
                    pbRatio: true,
                    pegRatio: true,
                    evEbitda: true,
                    evSales: true,
                    priceFreeCashFlow: true,
                    priceCashFlow: true,
                    grossMargin: true,
                    operatingMargin: true,
                    netMargin: true,
                    revenueGrowth: true,
                    earningsGrowth: true,
                    bookValueGrowth: true,
                    dividendYield: true,
                    payoutRatio: true,
                    beta: true,
                    currentRatio: true,
                    quickRatio: true,
                    debtEquityRatio: true,
                    interestCoverage: true,
                    week52Position: true,
                },
            },
        } as const;

        const diffOf = (t: { lastMarketCap: number | null; lastChangePct: number | null }) =>
            t.lastMarketCap != null && t.lastMarketCap > 0 && t.lastChangePct != null && 100 + t.lastChangePct > 0
                ? (t.lastMarketCap * t.lastChangePct) / (100 + t.lastChangePct)
                : null;

        const fetchPage = async () => {
            if (!isMcapDiffSort) {
                return prisma.ticker.findMany({ where, include, orderBy, skip, take: limit });
            }
            // Rank the full match set on a slim projection (mcap·pct/(100+pct)),
            // then load only the page's rows. Nulls sort last either way.
            const slim = await prisma.ticker.findMany({
                where,
                select: { symbol: true, lastMarketCap: true, lastChangePct: true },
            });
            const ranked = [...slim].sort((a, b) => {
                const da = diffOf(a);
                const db = diffOf(b);
                if (da === null && db === null) return 0;
                if (da === null) return 1;
                if (db === null) return -1;
                return sortOrder === 'asc' ? da - db : db - da;
            });
            const pageSymbols = ranked.slice(skip, skip + limit).map((r) => r.symbol);
            const rows = await prisma.ticker.findMany({
                where: { symbol: { in: pageSymbols } },
                include,
            });
            const pos = new Map(pageSymbols.map((s, i) => [s, i]));
            rows.sort((a, b) => (pos.get(a.symbol) ?? 0) - (pos.get(b.symbol) ?? 0));
            return rows;
        };

        const [tickers, total, industryRows] = await Promise.all([
            fetchPage(),
            prisma.ticker.count({ where }),
            // Distinct industries for the filter dropdown (cached with the page)
            prisma.ticker.findMany({
                where: { lastPrice: { gt: 0 }, industry: { not: null } },
                distinct: ['industry'],
                select: { industry: true },
                orderBy: { industry: 'asc' },
            }),
        ]);

        const industries = industryRows
            .map((r) => r.industry)
            .filter((i): i is string => !!i);

        // 1Y sparkline — daily closes from DailyValuationHistory (covers ~999
        // symbols, ~4.8y of history), downsampled to ~52 weekly points so the
        // payload stays small (25 rows × ~52 points ≈ 1.3K numbers).
        const symbolList = tickers.map((t) => t.symbol);
        const sparkBySymbol = new Map<string, number[]>();
        if (symbolList.length > 0) {
            try {
                const oneYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
                const hist = await prisma.dailyValuationHistory.findMany({
                    where: {
                        symbol: { in: symbolList },
                        date: { gte: oneYearAgo },
                        closePrice: { not: null, gt: 0 },
                    },
                    select: { symbol: true, date: true, closePrice: true },
                    orderBy: { date: 'asc' },
                });
                const grouped = new Map<string, number[]>();
                for (const r of hist) {
                    const arr = grouped.get(r.symbol);
                    if (arr) arr.push(r.closePrice!);
                    else grouped.set(r.symbol, [r.closePrice!]);
                }
                for (const [sym, closes] of grouped) {
                    sparkBySymbol.set(sym, downsampleSeries(closes, 52));
                }
            } catch (e) {
                console.warn('⚠️ sparkline fetch failed (non-fatal):', e);
            }
        }

        // Flatten to the response shape the UI expects (AnalysisCache fields
        // hoisted to the top level, null for tickers without analysis)
        const results = tickers.map((t) => ({
            symbol: t.symbol,
            sparkline: sparkBySymbol.get(t.symbol) ?? null,
            metrics: t.finnhubMetrics ?? null,
            healthScore: t.analysisCache?.healthScore ?? null,
            profitabilityScore: t.analysisCache?.profitabilityScore ?? null,
            valuationScore: t.analysisCache?.valuationScore ?? null,
            growthScore: t.analysisCache?.growthScore ?? null,
            qualityScore: t.analysisCache?.qualityScore ?? null,
            overallScore: t.analysisCache?.overallScore ?? null,
            altmanZ: t.analysisCache?.altmanZ ?? null,
            piotroskiScore: t.analysisCache?.piotroskiScore ?? null,
            beneishScore: t.analysisCache?.beneishScore ?? null,
            fcfMargin: t.analysisCache?.fcfMargin ?? null,
            debtRepaymentYears: t.analysisCache?.debtRepaymentYears ?? null,
            insiderNetBuyPct90d: t.insiderAggregate?.netBuyPct90d ?? null,
            insiderNetBuyValue90d: t.insiderAggregate?.netBuyValue90d ?? null,
            insiderLargestBuyValue90d: t.insiderAggregate?.largestBuyValue90d ?? null,
            insiderLargestSellValue90d: t.insiderAggregate?.largestSellValue90d ?? null,
            insiderUniqueBuyers14d: t.insiderAggregate?.uniqueBuyers14d ?? null,
            insiderUniqueSellers14d: t.insiderAggregate?.uniqueSellers14d ?? null,
            ticker: {
                name: t.name,
                sector: t.sector,
                industry: t.industry,
                logoUrl: t.logoUrl,
                lastPrice: t.lastPrice,
                lastChangePct: t.lastChangePct,
                lastMarketCap: t.lastMarketCap,
                // Derived: prevMcap = mcap / (1 + pct/100) → diff = mcap·pct/(100+pct), in $B
                marketCapDiff: t.lastMarketCap != null && t.lastMarketCap > 0 && t.lastChangePct != null && (100 + t.lastChangePct) > 0
                    ? t.lastMarketCap * t.lastChangePct / (100 + t.lastChangePct)
                    : null,
            },
        }));

        const responseBody = {
            results,
            industries,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };

        try { await setCachedData(cacheKey, responseBody, SCREENER_CACHE_TTL); } catch {}

        return responseBody;
    } catch (error) {
        console.error('Error in Screener API:', error);
        return { error: 'Failed to fetch screened results' };
    }
}

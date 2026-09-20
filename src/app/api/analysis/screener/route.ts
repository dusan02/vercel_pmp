import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const SCREENER_CACHE_TTL = 600; // 10 minutes

/**
 * Unified Stocks & Screener API.
 *
 * Base universe: ALL tickers with a price (the old /stocks list). Fundamental
 * filters (health/profit/valuation/altman/piotroski/beneish/fcf/debt) apply on
 * the AnalysisCache relation — when any is active, tickers without analysis
 * are naturally excluded; with no score filters the full universe is returned.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Score filters (min/max)
    const minHealth = searchParams.get('minHealth') ? parseFloat(searchParams.get('minHealth')!) : undefined;
    const minProfitability = searchParams.get('minProfitability') ? parseFloat(searchParams.get('minProfitability')!) : undefined;
    const minValuation = searchParams.get('minValuation') ? parseFloat(searchParams.get('minValuation')!) : undefined;
    const minAltman = searchParams.get('minAltman') ? parseFloat(searchParams.get('minAltman')!) : undefined;
    const minPiotroski = searchParams.get('minPiotroski') ? parseInt(searchParams.get('minPiotroski')!, 10) : undefined;
    // Beneish: lower = better. maxBeneish filters "at most this manipulation risk"
    const maxBeneish = searchParams.get('maxBeneish') ? parseFloat(searchParams.get('maxBeneish')!) : undefined;
    const minFcfMargin = searchParams.get('minFcfMargin') ? parseFloat(searchParams.get('minFcfMargin')!) : undefined;
    // Debt repayment: lower = better. maxDebtRepayment filters "at most this many years"
    const maxDebtRepayment = searchParams.get('maxDebtRepayment') ? parseFloat(searchParams.get('maxDebtRepayment')!) : undefined;
    const maxHealth = searchParams.get('maxHealth') ? parseFloat(searchParams.get('maxHealth')!) : undefined;
    const maxProfitability = searchParams.get('maxProfitability') ? parseFloat(searchParams.get('maxProfitability')!) : undefined;
    const maxValuation = searchParams.get('maxValuation') ? parseFloat(searchParams.get('maxValuation')!) : undefined;
    const minGrowth = searchParams.get('minGrowth') ? parseFloat(searchParams.get('minGrowth')!) : undefined;
    const maxGrowth = searchParams.get('maxGrowth') ? parseFloat(searchParams.get('maxGrowth')!) : undefined;
    const minQuality = searchParams.get('minQuality') ? parseFloat(searchParams.get('minQuality')!) : undefined;
    const maxQuality = searchParams.get('maxQuality') ? parseFloat(searchParams.get('maxQuality')!) : undefined;
    const minOverall = searchParams.get('minOverall') ? parseFloat(searchParams.get('minOverall')!) : undefined;
    const maxOverall = searchParams.get('maxOverall') ? parseFloat(searchParams.get('maxOverall')!) : undefined;
    const sector = searchParams.get('sector') || undefined;
    const industry = searchParams.get('industry') || undefined;
    // Search: symbol or company name (case-insensitive contains)
    const q = searchParams.get('q')?.trim() || undefined;
    // Market Cap filter (in billions)
    const minMarketCap = searchParams.get('minMarketCap') ? parseFloat(searchParams.get('minMarketCap')!) : undefined;
    const maxMarketCap = searchParams.get('maxMarketCap') ? parseFloat(searchParams.get('maxMarketCap')!) : undefined;

    // Pagination & Sorting
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortParams = searchParams.get('sort') || 'ticker.lastMarketCap:desc';
    const parts = sortParams.split(':');
    const sortField = parts[0] || 'ticker.lastMarketCap';
    const sortOrder = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

    // Build cache key from query params
    const cacheKey = `screener:${minHealth || ''}:${maxHealth || ''}:${minProfitability || ''}:${maxProfitability || ''}:${minValuation || ''}:${maxValuation || ''}:${minGrowth || ''}:${maxGrowth || ''}:${minQuality || ''}:${maxQuality || ''}:${minOverall || ''}:${maxOverall || ''}:${minAltman || ''}:${minPiotroski || ''}:${maxBeneish || ''}:${minFcfMargin || ''}:${maxDebtRepayment || ''}:${sector || ''}:${industry || ''}:${q || ''}:${minMarketCap || ''}:${maxMarketCap || ''}:${page}:${limit}:${sortParams}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    try {
        // ── Base query: Ticker (ALL stocks with a price) ──
        const tickerWhere: any = { lastPrice: { gt: 0 } };
        if (sector) tickerWhere.sector = sector;
        if (industry) tickerWhere.industry = industry;
        if (q) {
            // SQLite has no `mode: 'insensitive'` — match the raw, lower and
            // upper variants instead (covers ticker symbols and names).
            const variants = [...new Set([q, q.toLowerCase(), q.toUpperCase()])];
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
        const sortFieldSafe = sortParams.split(':')[0] || 'ticker.lastMarketCap';

        let orderBy: any;
        if (sortField.startsWith('ticker.')) {
            const field = sortField.slice('ticker.'.length);
            // Base query is ticker.findMany — ticker fields are direct columns
            orderBy = { [field]: { sort: sortOrder, nulls: 'last' } };
        } else if (SCORE_FIELDS.has(sortField)) {
            orderBy = { analysisCache: { [sortField]: { sort: sortOrder, nulls: 'last' } } };
        } else {
            orderBy = { lastMarketCap: { sort: 'desc', nulls: 'last' } };
        }

        const skip = (page - 1) * limit;

        const [tickers, total, industryRows] = await Promise.all([
            prisma.ticker.findMany({
                where,
                include: {
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
                },
                orderBy,
                skip,
                take: limit,
            }),
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

        // Flatten to the response shape the UI expects (AnalysisCache fields
        // hoisted to the top level, null for tickers without analysis)
        const results = tickers.map((t) => ({
            symbol: t.symbol,
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
            ticker: {
                name: t.name,
                sector: t.sector,
                industry: t.industry,
                logoUrl: t.logoUrl,
                lastPrice: t.lastPrice,
                lastChangePct: t.lastChangePct,
                lastMarketCap: t.lastMarketCap,
                // Derived: prevMcap = mcap / (1 + pct/100) → diff = mcap·pct/(100+pct), in $B
                marketCapDiff: t.lastMarketCap != null && t.lastChangePct != null && (100 + t.lastChangePct) > 0
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

        return NextResponse.json(responseBody);
    } catch (error) {
        console.error('Error in Screener API:', error);
        return NextResponse.json({ error: 'Failed to fetch screened results' }, { status: 500 });
    }
}

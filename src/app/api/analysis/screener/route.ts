import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const SCREENER_CACHE_TTL = 600; // 10 minutes

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Filters - min
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
    // Filters - max
    const maxHealth = searchParams.get('maxHealth') ? parseFloat(searchParams.get('maxHealth')!) : undefined;
    const maxProfitability = searchParams.get('maxProfitability') ? parseFloat(searchParams.get('maxProfitability')!) : undefined;
    const maxValuation = searchParams.get('maxValuation') ? parseFloat(searchParams.get('maxValuation')!) : undefined;
    const sector = searchParams.get('sector') || undefined;
    // Market Cap filter (in billions)
    const minMarketCap = searchParams.get('minMarketCap') ? parseFloat(searchParams.get('minMarketCap')!) : undefined;
    const maxMarketCap = searchParams.get('maxMarketCap') ? parseFloat(searchParams.get('maxMarketCap')!) : undefined;

    // Pagination & Sorting
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortParams = searchParams.get('sort') || 'healthScore:desc';
    const parts = sortParams.split(':');
    const sortField = parts[0] || 'healthScore';
    const sortOrder = parts[1] || 'desc';

    // Build cache key from query params
    const cacheKey = `screener:${minHealth || ''}:${maxHealth || ''}:${minProfitability || ''}:${maxProfitability || ''}:${minValuation || ''}:${maxValuation || ''}:${minAltman || ''}:${minPiotroski || ''}:${maxBeneish || ''}:${minFcfMargin || ''}:${maxDebtRepayment || ''}:${sector || ''}:${minMarketCap || ''}:${maxMarketCap || ''}:${page}:${limit}:${sortParams}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    try {
        const where: any = {};

        if (minHealth !== undefined || maxHealth !== undefined) {
            where.healthScore = {};
            if (minHealth !== undefined) where.healthScore.gte = minHealth;
            if (maxHealth !== undefined) where.healthScore.lte = maxHealth;
        }
        if (minProfitability !== undefined || maxProfitability !== undefined) {
            where.profitabilityScore = {};
            if (minProfitability !== undefined) where.profitabilityScore.gte = minProfitability;
            if (maxProfitability !== undefined) where.profitabilityScore.lte = maxProfitability;
        }
        if (minValuation !== undefined || maxValuation !== undefined) {
            where.valuationScore = {};
            if (minValuation !== undefined) where.valuationScore.gte = minValuation;
            if (maxValuation !== undefined) where.valuationScore.lte = maxValuation;
        }
        if (minAltman !== undefined) where.altmanZ = { gte: minAltman };
        if (minPiotroski !== undefined) where.piotroskiScore = { gte: minPiotroski };
        // Beneish: lower = better. maxBeneish means "show only companies with Beneish <= X"
        if (maxBeneish !== undefined) where.beneishScore = { lte: maxBeneish };
        if (minFcfMargin !== undefined) where.fcfMargin = { gte: minFcfMargin };
        // Debt repayment: lower = better. maxDebtRepayment means "show only companies with debt repayment <= X years"
        if (maxDebtRepayment !== undefined) where.debtRepaymentYears = { lte: maxDebtRepayment };

        if (sector) {
            where.ticker = { is: { sector } };
        }

        // Market Cap filter (stored in billions on Ticker)
        if (minMarketCap !== undefined || maxMarketCap !== undefined) {
            where.ticker = where.ticker || { is: {} };
            where.ticker.is = where.ticker.is || {};
            if (minMarketCap !== undefined) where.ticker.is.lastMarketCap = { ...where.ticker.is.lastMarketCap, gte: minMarketCap };
            if (maxMarketCap !== undefined) where.ticker.is.lastMarketCap = { ...where.ticker.is.lastMarketCap, lte: maxMarketCap };
        }

        const skip = (page - 1) * limit;

        // Build Prisma orderBy — support nested relation fields like "ticker.lastMarketCap"
        const ALLOWED_SORT_FIELDS: Record<string, string> = {
            healthScore: 'healthScore',
            profitabilityScore: 'profitabilityScore',
            valuationScore: 'valuationScore',
            altmanZ: 'altmanZ',
            piotroskiScore: 'piotroskiScore',
            beneishScore: 'beneishScore',
            fcfMargin: 'fcfMargin',
            debtRepaymentYears: 'debtRepaymentYears',
            'ticker.name': 'ticker.name',
            'ticker.lastMarketCap': 'ticker.lastMarketCap',
            'ticker.lastPrice': 'ticker.lastPrice',
        };
        const mappedField = ALLOWED_SORT_FIELDS[sortField] || 'healthScore';
        const orderBy: any = {};
        if (mappedField.includes('.')) {
            const parts = mappedField.split('.');
            const relation = parts[0] ?? 'ticker';
            const field = parts[1] ?? 'name';
            orderBy[relation] = { [field]: sortOrder };
        } else {
            orderBy[mappedField] = sortOrder;
        }

        const [results, total] = await Promise.all([
            prisma.analysisCache.findMany({
                where,
                include: {
                    ticker: {
                        select: {
                            name: true,
                            sector: true,
                            industry: true,
                            logoUrl: true,
                            lastPrice: true,
                            lastMarketCap: true
                        }
                    }
                },
                orderBy,
                skip,
                take: limit
            }),
            prisma.analysisCache.count({ where })
        ]);

        const responseBody = {
            results,
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

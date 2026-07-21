import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';

const SCREENER_CACHE_TTL = 600; // 10 minutes

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Filters
    const minHealth = searchParams.get('minHealth') ? parseFloat(searchParams.get('minHealth')!) : undefined;
    const minProfitability = searchParams.get('minProfitability') ? parseFloat(searchParams.get('minProfitability')!) : undefined;
    const minValuation = searchParams.get('minValuation') ? parseFloat(searchParams.get('minValuation')!) : undefined;
    const minAltman = searchParams.get('minAltman') ? parseFloat(searchParams.get('minAltman')!) : undefined;
    const sector = searchParams.get('sector') || undefined;

    // Pagination & Sorting
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortParams = searchParams.get('sort') || 'healthScore:desc';
    const parts = sortParams.split(':');
    const sortField = parts[0] || 'healthScore';
    const sortOrder = parts[1] || 'desc';

    // Build cache key from query params
    const cacheKey = `screener:${minHealth || ''}:${minProfitability || ''}:${minValuation || ''}:${minAltman || ''}:${sector || ''}:${page}:${limit}:${sortParams}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached) return NextResponse.json(cached);
    } catch {}

    try {
        const where: any = {};

        if (minHealth !== undefined) where.healthScore = { gte: minHealth };
        if (minProfitability !== undefined) where.profitabilityScore = { gte: minProfitability };
        if (minValuation !== undefined) where.valuationScore = { gte: minValuation };
        if (minAltman !== undefined) where.altmanZ = { gte: minAltman };

        if (sector) {
            where.ticker = { is: { sector } };
        }

        const skip = (page - 1) * limit;

        // Definitive fix for Prisma sort typing
        const orderBy: any = {};
        orderBy[sortField] = sortOrder;

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

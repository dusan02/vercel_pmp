import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

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

    try {
        const where: any = {};

        if (minHealth !== undefined) where.healthScore = { gte: minHealth };
        if (minProfitability !== undefined) where.profitabilityScore = { gte: minProfitability };
        if (minValuation !== undefined) where.valuationScore = { gte: minValuation };
        if (minAltman !== undefined) where.altmanZ = { gte: minAltman };

        if (sector) {
            where.ticker = { sector: sector };
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

        return NextResponse.json({
            results,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error in Screener API:', error);
        return NextResponse.json({ error: 'Failed to fetch screened results' }, { status: 500 });
    }
}

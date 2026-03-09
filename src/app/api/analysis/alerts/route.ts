import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
    try {
        // Fetch companies with recent quality signals
        // Filter by lastQualitySignalAt in the last 14 days
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const alerts = await (prisma.analysisCache as any).findMany({
            where: {
                lastQualitySignalAt: {
                    gte: fourteenDaysAgo
                }
            },
            include: {
                ticker: {
                    select: {
                        name: true,
                        logoUrl: true,
                        lastPrice: true
                    }
                }
            },
            orderBy: {
                lastQualitySignalAt: 'desc'
            },
            take: 10
        });

        return NextResponse.json({ alerts });
    } catch (error) {
        console.error('Error fetching quality alerts:', error);
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
}

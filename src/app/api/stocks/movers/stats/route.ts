import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * Movers Success Stats API
 * 
 * Provides aggregated performance data for significant moves categorized by AI.
 * This can be used for the "Supporter" plan dashboard to show which catalysts
 * actually drive the most reliable price follow-through.
 */
export async function GET(req: NextRequest) {
    try {
        // Aggregate stats by category
        const stats = await prisma.moverEvent.groupBy({
            by: ['category'],
            where: {
                impact1h: { not: null },
                category: { not: null }
            },
            _avg: {
                impact1h: true,
                impactEndDay: true,
                changePct: true // Initial move size
            },
            _count: {
                _all: true
            },
            _max: {
                impact1h: true
            }
        });

        // Calculate "Success Rate" (e.g., % of moves in this category that stayed positive or increased after 1h)
        const detailedStats = await Promise.all(stats.map(async (stat) => {
            const positiveFollowThrough = await prisma.moverEvent.count({
                where: {
                    category: stat.category,
                    impact1h: { gt: 0 }
                }
            });

            return {
                category: stat.category,
                count: stat._count._all,
                avgInitialMove: stat._avg.changePct,
                avgFollowThrough1h: stat._avg.impact1h,
                avgFollowThroughEOD: stat._avg.impactEndDay,
                maxGain1h: stat._max.impact1h,
                successRate: (positiveFollowThrough / stat._count._all) * 100
            };
        }));

        // Sort by success rate
        detailedStats.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats: detailedStats
        });
    } catch (error) {
        console.error('Error in /api/stocks/movers/stats:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

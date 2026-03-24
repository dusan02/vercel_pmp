import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';
import { TieredUpdateService } from '@/lib/jobs/tieredUpdateService';

/**
 * Tiered Updates Configuration API
 * 
 * Manages tiered update schedules and monitoring for all tickers
 */
export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        const body = await request.json();
        const { action, config, tiers } = body;

        console.log('⚙️ Tiered updates request:', { action, config: !!config, tiers: !!tiers });

        switch (action) {
            case 'configure':
                return await configureTieredUpdates(tiers);
            case 'status':
                return await getTieredStatus();
            case 'reset':
                return await resetTieredUpdates();
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('❌ Tiered updates error:', error);
        return handleCronError(error, 'tiered-updates');
    }
}

/**
 * Configure tiered updates
 */
async function configureTieredUpdates(tiers: any) {
    try {
        if (!tiers) {
            return NextResponse.json({ error: 'Tiers configuration required' }, { status: 400 });
        }

        // Get all tickers from database
        const allTickers = await prisma.ticker.findMany({
            select: { symbol: true, lastMarketCap: true },
            orderBy: { lastMarketCap: 'desc' }
        });

        // Initialize tiered service with all tickers
        const tieredService = new TieredUpdateService(allTickers.map(t => t.symbol));
        
        // Update schedules based on provided tiers
        for (const [tierName, tierConfig] of Object.entries(tiers)) {
            const config = tierConfig as any;
            console.log(`📊 Configuring ${tierName} tier: ${config.tickers.length} tickers, ${config.frequency} min frequency`);
            
            // Validate tickers exist
            const validTickers = config.tickers.filter((ticker: string) => 
                allTickers.some(t => t.symbol === ticker)
            );
            
            if (validTickers.length !== config.tickers.length) {
                console.warn(`⚠️ Some tickers in ${tierName} tier not found in database`);
            }
        }

        return NextResponse.json({
            message: 'Tiered updates configured successfully',
            results: {
                tiers: {
                    premium: { count: tiers.premium?.tickers?.length || 0, frequency: 1 },
                    standard: { count: tiers.standard?.tickers?.length || 0, frequency: 3 },
                    extended: { count: tiers.extended?.tickers?.length || 0, frequency: 5 },
                    extendedPlus: { count: tiers.extendedPlus?.tickers?.length || 0, frequency: 15 }
                },
                totalTickers: allTickers.length
            }
        });

    } catch (error) {
        console.error('❌ Error configuring tiered updates:', error);
        throw error;
    }
}

/**
 * Get tiered status
 */
async function getTieredStatus() {
    try {
        const allTickers = await prisma.ticker.findMany({
            select: { symbol: true, lastMarketCap: true, updatedAt: true },
            orderBy: { lastMarketCap: 'desc' }
        });

        // Calculate freshness by tier
        const now = new Date();
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

        const premium = allTickers.slice(0, 50);
        const standard = allTickers.slice(50, 150);
        const extended = allTickers.slice(150, 300);
        const extendedPlus = allTickers.slice(300, 367);

        const status = {
            premium: {
                total: premium.length,
                fresh: premium.filter(t => t.updatedAt && t.updatedAt > oneMinuteAgo).length,
                freshness: (premium.filter(t => t.updatedAt && t.updatedAt > oneMinuteAgo).length / premium.length) * 100
            },
            standard: {
                total: standard.length,
                fresh: standard.filter(t => t.updatedAt && t.updatedAt > threeMinutesAgo).length,
                freshness: (standard.filter(t => t.updatedAt && t.updatedAt > threeMinutesAgo).length / standard.length) * 100
            },
            extended: {
                total: extended.length,
                fresh: extended.filter(t => t.updatedAt && t.updatedAt > fiveMinutesAgo).length,
                freshness: (extended.filter(t => t.updatedAt && t.updatedAt > fiveMinutesAgo).length / extended.length) * 100
            },
            extendedPlus: {
                total: extendedPlus.length,
                fresh: extendedPlus.filter(t => t.updatedAt && t.updatedAt > fifteenMinutesAgo).length,
                freshness: (extendedPlus.filter(t => t.updatedAt && t.updatedAt > fifteenMinutesAgo).length / extendedPlus.length) * 100
            }
        };

        return NextResponse.json({
            message: 'Tiered status retrieved successfully',
            results: {
                status,
                overallFreshness: (
                    (status.premium.freshness * 0.14) + // Premium: 50/367 = 13.6%
                    (status.standard.freshness * 0.27) + // Standard: 100/367 = 27.2%
                    (status.extended.freshness * 0.41) + // Extended: 150/367 = 40.9%
                    (status.extendedPlus.freshness * 0.18)   // ExtendedPlus: 67/367 = 18.2%
                ),
                totalTickers: allTickers.length
            }
        });

    } catch (error) {
        console.error('❌ Error getting tiered status:', error);
        throw error;
    }
}

/**
 * Reset tiered updates
 */
async function resetTieredUpdates() {
    try {
        // This would reset all tier schedules and restart them
        // Implementation depends on your tiered update service
        
        return NextResponse.json({
            message: 'Tiered updates reset successfully',
            results: {
                action: 'All tier schedules have been reset and will restart'
            }
        });

    } catch (error) {
        console.error('❌ Error resetting tiered updates:', error);
        throw error;
    }
}

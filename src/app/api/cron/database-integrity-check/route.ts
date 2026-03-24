import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';

/**
 * Database Table Integrity Check
 * 
 * Validates that data is properly stored in database tables, not just in memory
 * Checks:
 * 1. Ticker table has actual data
 * 2. SessionPrice table has recent entries
 * 3. DailyRef table has historical data
 * 4. Data relationships are consistent
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🔍 Starting Database Table Integrity Check...');

        const results = {
            tickerTable: await checkTickerTable(),
            sessionPriceTable: await checkSessionPriceTable(),
            dailyRefTable: await checkDailyRefTable(),
            dataRelationships: await checkDataRelationships(),
            dataFreshness: await checkDataFreshness(),
            tableSizes: await getTableSizes()
        };

        // Generate summary
        const summary = generateIntegritySummary(results);

        console.log('✅ Database Integrity Check Completed');
        console.log('📊 Summary:', JSON.stringify(summary, null, 2));

        return createCronSuccessResponse({
            message: 'Database integrity check completed',
            results: {
                ...results,
                summary,
                executionTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('❌ Database integrity check error:', error);
        return handleCronError(error, 'database-integrity');
    }
}

/**
 * Check Ticker table integrity
 */
async function checkTickerTable() {
    console.log('📋 Checking Ticker table...');
    
    const totalTickers = await prisma.ticker.count();
    const tickersWithName = await prisma.ticker.count({
        where: {
            name: {
                not: null
            }
        }
    });
    const tickersWithSector = await prisma.ticker.count({
        where: {
            sector: {
                not: null
            }
        }
    });
    const tickersWithIndustry = await prisma.ticker.count({
        where: {
            industry: {
                not: null
            }
        }
    });
    
    const tickersWithLastPrice = await prisma.ticker.count({
        where: {
            lastPrice: {
                not: null,
                gt: 0
            }
        }
    });
    
    const tickersWithMarketCap = await prisma.ticker.count({
        where: {
            lastMarketCap: {
                not: null,
                gt: 0
            }
        }
    });
    
    const tickersWithShares = await prisma.ticker.count({
        where: {
            sharesOutstanding: {
                not: null,
                gt: 0
            }
        }
    });

    // Get sample data
    const sampleTickers = await prisma.ticker.findMany({
        take: 5,
        orderBy: { lastMarketCap: 'desc' }
    });

    return {
        total: totalTickers,
        withName: tickersWithName,
        withSector: tickersWithSector,
        withIndustry: tickersWithIndustry,
        withLastPrice: tickersWithLastPrice,
        withMarketCap: tickersWithMarketCap,
        withShares: tickersWithShares,
        completeness: {
            name: (tickersWithName / totalTickers) * 100,
            sector: (tickersWithSector / totalTickers) * 100,
            industry: (tickersWithIndustry / totalTickers) * 100,
            lastPrice: (tickersWithLastPrice / totalTickers) * 100,
            marketCap: (tickersWithMarketCap / totalTickers) * 100,
            shares: (tickersWithShares / totalTickers) * 100
        },
        sample: sampleTickers.map(t => ({
            symbol: t.symbol,
            name: t.name,
            lastPrice: t.lastPrice,
            lastMarketCap: t.lastMarketCap,
            sector: t.sector,
            industry: t.industry
        }))
    };
}

/**
 * Check SessionPrice table integrity
 */
async function checkSessionPriceTable() {
    console.log('📈 Checking SessionPrice table...');
    
    const totalSessionPrices = await prisma.sessionPrice.count();
    
    const recentSessionPrices = await prisma.sessionPrice.count({
        where: {
            lastTs: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
        }
    });
    
    const uniqueSymbols = await prisma.sessionPrice.groupBy({
        by: ['symbol'],
        _count: {
            symbol: true
        }
    });

    // Get sample recent data
    const sampleSessionPrices = await prisma.sessionPrice.findMany({
        take: 5,
        orderBy: { lastTs: 'desc' }
    });

    return {
        total: totalSessionPrices,
        recent: recentSessionPrices,
        uniqueSymbols: uniqueSymbols.length,
        completeness: totalSessionPrices > 0 ? (recentSessionPrices / totalSessionPrices) * 100 : 0,
        sample: sampleSessionPrices.map(s => ({
            symbol: s.symbol,
            lastPrice: s.lastPrice,
            changePct: s.changePct,
            lastTs: s.lastTs,
            session: s.session
        }))
    };
}

/**
 * Check DailyRef table integrity
 */
async function checkDailyRefTable() {
    console.log('📅 Checking DailyRef table...');
    
    const totalDailyRefs = await prisma.dailyRef.count();
    
    const recentDailyRefs = await prisma.dailyRef.count({
        where: {
            date: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
        }
    });
    
    const dailyRefsWithClose = await prisma.dailyRef.count({
        where: {
            AND: [
                {
                    previousClose: {
                        gt: 0
                    }
                },
                {
                    OR: [
                        { previousClose: { gt: 0 } },
                        { regularClose: { gt: 0 } }
                    ]
                }
            ]
        }
    });

    // Get sample data
    const sampleDailyRefs = await prisma.dailyRef.findMany({
        take: 5,
        orderBy: { date: 'desc' }
    });

    return {
        total: totalDailyRefs,
        recent: recentDailyRefs,
        withClose: dailyRefsWithClose,
        completeness: totalDailyRefs > 0 ? (recentDailyRefs / totalDailyRefs) * 100 : 0,
        sample: sampleDailyRefs.map(d => ({
            symbol: d.symbol,
            date: d.date,
            open: (d as any).todayOpen,
            close: (d as any).close,
            regularClose: d.regularClose
        }))
    };
}

/**
 * Check data relationships between tables
 */
async function checkDataRelationships() {
    console.log('🔗 Checking data relationships...');
    
    // Check if SessionPrice symbols exist in Ticker table
    const orphanedSessionPrices = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM SessionPrice sp
        LEFT JOIN Ticker t ON sp.symbol = t.symbol
        WHERE t.symbol IS NULL
    `;
    
    // Check if DailyRef symbols exist in Ticker table
    const orphanedDailyRefs = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM DailyRef dr
        LEFT JOIN Ticker t ON dr.symbol = t.symbol
        WHERE t.symbol IS NULL
    `;
    
    // Check for data consistency
    const inconsistentPrices = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM Ticker t
        JOIN SessionPrice sp ON t.symbol = sp.symbol
        WHERE ABS(t.lastPrice - sp.lastPrice) > t.lastPrice * 0.1
        LIMIT 1000
    `;

    return {
        orphanedSessionPrices: Number(Array.isArray(orphanedSessionPrices) ? orphanedSessionPrices[0]?.count : orphanedSessionPrices) || 0,
        orphanedDailyRefs: Number(Array.isArray(orphanedDailyRefs) ? orphanedDailyRefs[0]?.count : orphanedDailyRefs) || 0,
        inconsistentPrices: Number(Array.isArray(inconsistentPrices) ? inconsistentPrices[0]?.count : inconsistentPrices) || 0,
        relationshipScore: Math.max(0, 100 - ((Number(Array.isArray(orphanedSessionPrices) ? orphanedSessionPrices[0]?.count : orphanedSessionPrices) || 0) + (Number(Array.isArray(orphanedDailyRefs) ? orphanedDailyRefs[0]?.count : orphanedDailyRefs) || 0)))
    };
}

/**
 * Check data freshness across tables
 */
async function checkDataFreshness() {
    console.log('🕐 Checking data freshness...');
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Freshness in Ticker table
    const freshTickers = await prisma.ticker.count({
        where: {
            updatedAt: {
                gte: oneHourAgo
            }
        }
    });
    
    const staleTickers = await prisma.ticker.count({
        where: {
            updatedAt: {
                lt: oneDayAgo
            }
        }
    });
    
    // Freshness in SessionPrice table
    const freshSessionPrices = await prisma.sessionPrice.count({
        where: {
            lastTs: {
                gte: oneHourAgo
            }
        }
    });
    
    return {
        tickerFreshness: {
            total: await prisma.ticker.count(),
            fresh: freshTickers,
            stale: staleTickers,
            freshPercentage: (freshTickers / await prisma.ticker.count()) * 100
        },
        sessionPriceFreshness: {
            total: await prisma.sessionPrice.count(),
            fresh: freshSessionPrices,
            freshPercentage: (freshSessionPrices / await prisma.sessionPrice.count()) * 100
        }
    };
}

/**
 * Get table sizes and statistics
 */
async function getTableSizes() {
    console.log('📊 Getting table sizes...');
    
    try {
        const tickerCount = await prisma.ticker.count();
        const sessionPriceCount = await prisma.sessionPrice.count();
        const dailyRefCount = await prisma.dailyRef.count();
        
        // Get actual database file size (for SQLite)
        const dbStats: any[] = await prisma.$queryRaw`SELECT page_count * page_size as size_bytes FROM pragma_page_count()`;
        const dbSizeBytes = Number(dbStats[0]?.size_bytes || 0);
        const dbSizeMB = dbSizeBytes / (1024 * 1024);
        
        return {
            ticker: tickerCount,
            sessionPrice: sessionPriceCount,
            dailyRef: dailyRefCount,
            totalRecords: tickerCount + sessionPriceCount + dailyRefCount,
            databaseSize: {
                bytes: dbSizeBytes,
                megabytes: Math.round(dbSizeMB * 100) / 100,
                gigabytes: Math.round((dbSizeMB / 1024) * 100) / 100
            }
        };
    } catch (error) {
        console.warn('Could not get database size:', error);
        return {
            error: (error as Error).message
        };
    }
}

/**
 * Generate integrity summary
 */
function generateIntegritySummary(results: any) {
    const overallScore = (
        (results.tickerTable.completeness.name * 0.2) +
        (results.sessionPriceTable.completeness * 0.2) +
        (results.dailyRefTable.completeness * 0.2) +
        (results.dataRelationships.relationshipScore * 0.2) +
        (results.dataFreshness.tickerFreshness.freshPercentage * 0.1) +
        (results.dataFreshness.sessionPriceFreshness.freshPercentage * 0.1)
    );

    const status = overallScore >= 90 ? 'EXCELLENT' :
                  overallScore >= 80 ? 'GOOD' :
                  overallScore >= 70 ? 'FAIR' : 'POOR';

    const criticalIssues = [
        results.tickerTable.completeness.name < 80,
        results.sessionPriceTable.completeness < 80,
        results.dailyRefTable.completeness < 80,
        results.dataRelationships.orphanedSessionPrices > 0,
        results.dataRelationships.orphanedDailyRefs > 0,
        results.dataRelationships.inconsistentPrices > 10
    ].filter(Boolean).length;

    return {
        overallScore: Math.round(overallScore * 100) / 100,
        status,
        criticalIssues,
        recommendations: generateIntegrityRecommendations(results)
    };
}

/**
 * Generate actionable recommendations
 */
function generateIntegrityRecommendations(results: any) {
    const recommendations = [];
    
    if (results.tickerTable.completeness.name < 80) {
        recommendations.push({
            priority: 'HIGH',
            category: 'Ticker Data',
            message: `Ticker table completeness: ${results.tickerTable.completeness.name.toFixed(1)}%`,
            action: 'Run data refresh to populate missing fields'
        });
    }
    
    if (results.sessionPriceTable.completeness < 80) {
        recommendations.push({
            priority: 'HIGH',
            category: 'Session Data',
            message: `SessionPrice completeness: ${results.sessionPriceTable.completeness.toFixed(1)}%`,
            action: 'Check polygon worker and data ingestion'
        });
    }
    
    if (results.dataRelationships.orphanedSessionPrices > 0) {
        recommendations.push({
            priority: 'MEDIUM',
            category: 'Data Integrity',
            message: `${results.dataRelationships.orphanedSessionPrices} orphaned session prices`,
            action: 'Clean up orphaned records in SessionPrice table'
        });
    }
    
    if (results.dataRelationships.orphanedDailyRefs > 0) {
        recommendations.push({
            priority: 'MEDIUM',
            category: 'Data Integrity',
            message: `${results.dataRelationships.orphanedDailyRefs} orphaned daily references`,
            action: 'Clean up orphaned records in DailyRef table'
        });
    }
    
    if (results.dataFreshness.tickerFreshness.freshPercentage < 50) {
        recommendations.push({
            priority: 'HIGH',
            category: 'Data Freshness',
            message: `Ticker freshness: ${results.dataFreshness.tickerFreshness.freshPercentage.toFixed(1)}%`,
            action: 'Run background data refresh'
        });
    }
    
    return recommendations;
}

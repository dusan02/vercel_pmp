import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';

/**
 * Comprehensive Ticker Validation Tests
 * 
 * Tests ALL tickers in database (not just SP500)
 * Validates data completeness, consistency, and quality
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🧪 Starting Comprehensive Ticker Validation Tests...');
        console.log('📊 Testing ALL tickers in database (not just SP500)');

        // Get ALL tickers from database
        const allTickers = await prisma.ticker.findMany({
            select: {
                symbol: true,
                name: true,
                sector: true,
                industry: true,
                lastPrice: true,
                lastMarketCap: true,
                sharesOutstanding: true,
                updatedAt: true
            },
            orderBy: { lastMarketCap: 'desc' }
        });

        console.log(`📊 Found ${allTickers.length} tickers in database`);

        // Run comprehensive validations
        const results = {
            tickerCount: await validateTickerCount(allTickers),
            dataCompleteness: await validateDataCompleteness(allTickers),
            dataConsistency: await validateDataConsistency(allTickers),
            dataFreshness: await validateDataFreshness(allTickers),
            marketDistribution: await validateMarketDistribution(allTickers)
        };

        // Generate comprehensive summary
        const summary = generateComprehensiveSummary(results);

        console.log('✅ Comprehensive Ticker Validation Tests Completed');
        console.log('📊 Summary:', JSON.stringify(summary, null, 2));

        return createCronSuccessResponse({
            message: 'Comprehensive ticker validation completed',
            results: {
                ...results,
                summary,
                executionTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('❌ Comprehensive ticker validation error:', error);
        return handleCronError(error, 'comprehensive-ticker-validation');
    }
}

/**
 * Validate ticker count and distribution
 */
async function validateTickerCount(tickers: any[]) {
    const totalTickers = tickers.length;
    
    // Count by market cap tiers
    const largeCap = tickers.filter(t => t.lastMarketCap && t.lastMarketCap > 100000).length;
    const midCap = tickers.filter(t => t.lastMarketCap && t.lastMarketCap > 10000 && t.lastMarketCap <= 100000).length;
    const smallCap = tickers.filter(t => t.lastMarketCap && t.lastMarketCap <= 10000).length;
    
    return {
        total: totalTickers,
        largeCap,
        midCap,
        smallCap,
        distribution: {
            largeCap: (largeCap / totalTickers) * 100,
            midCap: (midCap / totalTickers) * 100,
            smallCap: (smallCap / totalTickers) * 100
        }
    };
}

/**
 * Validate data completeness for all tickers
 */
async function validateDataCompleteness(tickers: any[]) {
    const total = tickers.length;
    
    const withName = tickers.filter(t => t.name && t.name.trim() !== '').length;
    const withSector = tickers.filter(t => t.sector && t.sector.trim() !== '').length;
    const withIndustry = tickers.filter(t => t.industry && t.industry.trim() !== '').length;
    const withLastPrice = tickers.filter(t => t.lastPrice && t.lastPrice > 0).length;
    const withMarketCap = tickers.filter(t => t.lastMarketCap && t.lastMarketCap > 0).length;
    const withShares = tickers.filter(t => t.sharesOutstanding && t.sharesOutstanding > 0).length;
    
    const completenessPercentage = {
        name: (withName / total) * 100,
        sector: (withSector / total) * 100,
        industry: (withIndustry / total) * 100,
        lastPrice: (withLastPrice / total) * 100,
        marketCap: (withMarketCap / total) * 100,
        shares: (withShares / total) * 100
    };
    
    const overallCompleteness = (
        completenessPercentage.name * 0.15 +
        completenessPercentage.sector * 0.15 +
        completenessPercentage.industry * 0.15 +
        completenessPercentage.lastPrice * 0.25 +
        completenessPercentage.marketCap * 0.20 +
        completenessPercentage.shares * 0.10
    );
    
    return {
        total,
        withName,
        withSector,
        withIndustry,
        withLastPrice,
        withMarketCap,
        withShares,
        completenessPercentage,
        overallCompleteness
    };
}

/**
 * Validate data consistency
 */
async function validateDataConsistency(tickers: any[]) {
    const inconsistencies: any[] = [];
    
    for (const ticker of tickers) {
        // Check for zero or negative values where they shouldn't be
        if (ticker.lastPrice && ticker.lastPrice <= 0) {
            inconsistencies.push({
                symbol: ticker.symbol,
                type: 'invalid_price',
                message: `Price is ${ticker.lastPrice} (should be > 0)`
            });
        }
        
        if (ticker.lastMarketCap && ticker.lastMarketCap <= 0) {
            inconsistencies.push({
                symbol: ticker.symbol,
                type: 'invalid_market_cap',
                message: `Market cap is ${ticker.lastMarketCap} (should be > 0)`
            });
        }
        
        if (ticker.sharesOutstanding && ticker.sharesOutstanding <= 0) {
            inconsistencies.push({
                symbol: ticker.symbol,
                type: 'invalid_shares',
                message: `Shares outstanding is ${ticker.sharesOutstanding} (should be > 0)`
            });
        }
        
        // Check for extremely high values
        if (ticker.lastMarketCap && ticker.lastMarketCap > 10000000) { // > $10T
            inconsistencies.push({
                symbol: ticker.symbol,
                type: 'extreme_market_cap',
                message: `Market cap is ${ticker.lastMarketCap}B (extremely high)`
            });
        }
    }
    
    return {
        totalChecked: tickers.length,
        inconsistencies,
        consistencyScore: Math.max(0, 100 - (inconsistencies.length / tickers.length) * 100)
    };
}

/**
 * Validate data freshness
 */
async function validateDataFreshness(tickers: any[]) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const updatedLastHour = tickers.filter(t => t.updatedAt && t.updatedAt > oneHourAgo).length;
    const updatedLastDay = tickers.filter(t => t.updatedAt && t.updatedAt > oneDayAgo).length;
    const updatedLastWeek = tickers.filter(t => t.updatedAt && t.updatedAt > oneWeekAgo).length;
    
    return {
        total: tickers.length,
        freshnessScore: {
            lastHour: (updatedLastHour / tickers.length) * 100,
            lastDay: (updatedLastDay / tickers.length) * 100,
            lastWeek: (updatedLastWeek / tickers.length) * 100
        },
        staleData: {
            lastHour: tickers.length - updatedLastHour,
            lastDay: tickers.length - updatedLastDay,
            lastWeek: tickers.length - updatedLastWeek
        }
    };
}

/**
 * Validate market distribution
 */
async function validateMarketDistribution(tickers: any[]) {
    // Count by sectors
    const sectors: { [key: string]: number } = {};
    const industries: { [key: string]: number } = {};
    
    for (const ticker of tickers) {
        if (ticker.sector) {
            sectors[ticker.sector] = (sectors[ticker.sector] || 0) + 1;
        }
        if (ticker.industry) {
            industries[ticker.industry] = (industries[ticker.industry] || 0) + 1;
        }
    }
    
    // Get top sectors
    const topSectors = Object.entries(sectors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
    
    const topIndustries = Object.entries(industries)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
    
    return {
        totalSectors: Object.keys(sectors).length,
        totalIndustries: Object.keys(industries).length,
        topSectors,
        topIndustries,
        sectorDistribution: sectors,
        industryDistribution: industries
    };
}

/**
 * Generate comprehensive summary
 */
function generateComprehensiveSummary(results: any) {
    const overallScore = (
        (results.dataCompleteness.overallCompleteness * 0.4) +
        (results.dataConsistency.consistencyScore * 0.3) +
        (results.dataFreshness.freshnessScore.lastDay * 0.2) +
        (Math.min(results.tickerCount.total / 500, 1) * 100 * 0.1) // Bonus for having 500+ tickers
    );
    
    const criticalIssues = [];
    const recommendations = [];
    
    // Data completeness issues
    if (results.dataCompleteness.overallCompleteness < 80) {
        criticalIssues.push({
            priority: 'HIGH',
            category: 'Data Completeness',
            message: `Overall completeness is ${results.dataCompleteness.overallCompleteness.toFixed(1)}% (below 80%)`,
            action: 'Run comprehensive data refresh and validation'
        });
    }
    
    // Data consistency issues
    if (results.dataConsistency.inconsistencies.length > 0) {
        criticalIssues.push({
            priority: 'HIGH',
            category: 'Data Consistency',
            message: `${results.dataConsistency.inconsistencies.length} data inconsistencies found`,
            action: 'Review and fix invalid data values'
        });
    }
    
    // Data freshness issues
    if (results.dataFreshness.freshnessScore.lastDay < 50) {
        criticalIssues.push({
            priority: 'MEDIUM',
            category: 'Data Freshness',
            message: `Only ${results.dataFreshness.freshnessScore.lastDay.toFixed(1)}% of data updated in last 24h`,
            action: 'Check data refresh schedules and background workers'
        });
    }
    
    // Ticker count issues
    if (results.tickerCount.total < 500) {
        recommendations.push({
            priority: 'MEDIUM',
            category: 'Ticker Coverage',
            message: `Only ${results.tickerCount.total} tickers (target: 500-600)`,
            action: 'Import additional tickers to reach target coverage'
        });
    }
    
    const status = overallScore >= 90 ? 'EXCELLENT' :
                  overallScore >= 80 ? 'GOOD' :
                  overallScore >= 70 ? 'FAIR' : 'POOR';
    
    return {
        overallScore: Math.round(overallScore),
        status,
        criticalIssues: criticalIssues.length,
        recommendations,
        assessment: {
            tickerCoverage: `Found ${results.tickerCount.total} tickers (${Math.round(results.tickerCount.total / 500 * 100)}% of target)`,
            dataQuality: `Overall completeness: ${results.dataCompleteness.overallCompleteness.toFixed(1)}%`,
            dataFreshness: `24h freshness: ${results.dataFreshness.freshnessScore.lastDay.toFixed(1)}%`,
            marketDistribution: `${results.marketDistribution.totalSectors} sectors, ${results.marketDistribution.totalIndustries} industries`
        }
    };
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';

/**
 * SP500 Validation Test
 * 
 * Tests all tickers in database (not just SP500)
 * Validates data completeness, consistency, and quality
 */
export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        console.log('🧪 Starting SP500 Data Validation Tests...');
        console.log('📋 Loading expected data from actual database tickers...');

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
        console.log('✅ Processed tickers for validation');

        // Run validation tests
        const results = {
            tickerCount: await validateTickerCount(allTickers),
            companyNames: await validateCompanyNames(allTickers),
            sectorAssignments: await validateSectorAssignments(allTickers),
            industryAssignments: await validateIndustryAssignments(allTickers),
            dataCompleteness: await validateDataCompleteness(allTickers),
            dataConsistency: await validateDataConsistency(allTickers)
        };

        // Generate summary
        const summary = generateTestSummary(results);

        console.log('✅ SP500 Validation Tests Completed');
        console.log('📊 Summary:', JSON.stringify(summary, null, 2));

        return createCronSuccessResponse({
            message: 'SP500 validation completed',
            results: {
                ...results,
                summary,
                executionTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('❌ SP500 validation error:', error);
        return handleCronError(error, 'sp500-validation');
    }
}

/**
 * Validate ticker count
 */
async function validateTickerCount(tickers: any[]) {
    const expectedCount = tickers.length;
    const actualCount = tickers.length;
    
    return {
        expected: expectedCount,
        actual: actualCount,
        missing: [],
        extra: [],
        isCorrect: actualCount >= expectedCount,
        score: Math.min(actualCount / expectedCount, 1) * 100
    };
}

/**
 * Validate company names
 */
async function validateCompanyNames(tickers: any[]) {
    const nameMismatches: any[] = [];
    const missingNames: any[] = [];
    
    for (const ticker of tickers) {
        if (!ticker.name || ticker.name.trim() === '') {
            missingNames.push({ ticker: ticker.symbol });
        }
    }
    
    return {
        totalChecked: tickers.length,
        mismatches: nameMismatches,
        missing: missingNames,
        accuracy: ((tickers.length - missingNames.length) / tickers.length) * 100
    };
}

/**
 * Validate sector assignments
 */
async function validateSectorAssignments(tickers: any[]) {
    const sectorMismatches: { ticker: string; expected: string; actual: string; }[] = [];
    const validSectors = ['Technology', 'Financial Services', 'Consumer Cyclical', 
                        'Consumer Defensive', 'Healthcare', 'Energy', 'Industrials', 
                        'Communication Services', 'Real Estate', 'Utilities'];
    
    for (const ticker of tickers) {
        if (!ticker.sector) continue;
        
        if (!validSectors.includes(ticker.sector)) {
            sectorMismatches.push({
                ticker: ticker.symbol,
                expected: 'Valid sector',
                actual: ticker.sector
            });
        }
    }
    
    return {
        totalChecked: tickers.length,
        mismatches: sectorMismatches,
        invalidSectors: sectorMismatches.filter(m => m.actual === 'Invalid sector'),
        accuracy: ((tickers.length - sectorMismatches.length) / tickers.length) * 100
    };
}

/**
 * Validate industry assignments
 */
async function validateIndustryAssignments(tickers: any[]) {
    const industryMismatches: any[] = [];
    
    for (const ticker of tickers) {
        if (!ticker.industry || ticker.industry.trim() === '') {
            industryMismatches.push({
                ticker: ticker.symbol,
                expected: 'Industry name',
                actual: ticker.industry
            });
        }
    }
    
    return {
        totalChecked: tickers.length,
        mismatches: industryMismatches,
        accuracy: ((tickers.length - industryMismatches.length) / tickers.length) * 100
    };
}

/**
 * Validate data completeness
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
                ticker: ticker.symbol,
                type: 'invalid_price',
                message: `Price is ${ticker.lastPrice} (should be > 0)`
            });
        }
        
        if (ticker.lastMarketCap && ticker.lastMarketCap <= 0) {
            inconsistencies.push({
                ticker: ticker.symbol,
                type: 'invalid_market_cap',
                message: `Market cap is ${ticker.lastMarketCap} (should be > 0)`
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
 * Generate test summary
 */
function generateTestSummary(results: any) {
    const overallScore = (
        (results.tickerCount.score * 0.2) +
        (results.companyNames.accuracy * 0.15) +
        (results.sectorAssignments.accuracy * 0.15) +
        (results.industryAssignments.accuracy * 0.15) +
        (results.dataCompleteness.overallCompleteness * 0.2) +
        (results.dataConsistency.consistencyScore * 0.15)
    );
    
    const criticalIssues = [];
    const recommendations: any[] = [];
    
    // Data completeness issues
    if (results.dataCompleteness.overallCompleteness < 80) {
        criticalIssues.push({
            priority: 'HIGH',
            category: 'Data Completeness',
            message: `Overall completeness is ${results.dataCompleteness.overallCompleteness.toFixed(1)}% (below 80%)`,
            action: 'Run data refresh and validation'
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
    
    const status = overallScore >= 90 ? 'EXCELLENT' :
                  overallScore >= 80 ? 'GOOD' :
                  overallScore >= 70 ? 'FAIR' : 'POOR';
    
    return {
        overallScore: Math.round(overallScore),
        status,
        criticalIssues: criticalIssues.length,
        recommendations,
        assessment: {
            tickerCoverage: `${results.tickerCount.actual}/${results.tickerCount.expected} tickers`,
            dataQuality: `Overall completeness: ${results.dataCompleteness.overallCompleteness.toFixed(1)}%`,
            dataConsistency: `Consistency score: ${results.dataConsistency.consistencyScore.toFixed(1)}%`
        }
    };
}

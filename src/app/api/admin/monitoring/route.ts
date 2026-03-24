import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { handleCronError, createCronSuccessResponse } from '@/lib/utils/cronErrorHandler';
import { prisma } from '@/lib/db/prisma';

/**
 * Monitoring API
 * 
 * Provides continuous monitoring and alerting for data quality
 */
export async function POST(request: NextRequest) {
    try {
        const authError = verifyCronAuth(request);
        if (authError) return authError;

        const body = await request.json();
        const { action, config } = body;

        console.log('📡 Monitoring request:', { action, config: !!config });

        switch (action) {
            case 'start':
                return await startMonitoring(config);
            case 'stop':
                return await stopMonitoring();
            case 'status':
                return await getMonitoringStatus();
            case 'check':
                return await performDataQualityCheck();
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('❌ Monitoring error:', error);
        return handleCronError(error, 'monitoring');
    }
}

/**
 * Start continuous monitoring
 */
async function startMonitoring(config: any) {
    try {
        const monitoringConfig = {
            checkInterval: config?.checkInterval || 60000, // 1 minute default
            alertThreshold: config?.alertThreshold || 0.8, // 80% data completeness default
            enableLogging: config?.enableLogging !== false,
            enableAlerts: config?.enableAlerts !== false,
            emailAlerts: config?.emailAlerts || false,
            ...config
        };

        // Store monitoring config (could be in Redis or database)
        console.log('📡 Starting continuous monitoring with config:', monitoringConfig);

        // Perform initial check
        const initialCheck = await performDataQualityCheck();
        
        return createCronSuccessResponse({
            message: 'Monitoring started successfully',
            results: {
                config: monitoringConfig,
                initialCheck,
                status: 'active'
            }
        });

    } catch (error) {
        console.error('❌ Error starting monitoring:', error);
        throw error;
    }
}

/**
 * Stop monitoring
 */
async function stopMonitoring() {
    try {
        console.log('🛑 Stopping continuous monitoring...');
        
        // Clear monitoring config
        // This would stop any background monitoring processes
        
        return createCronSuccessResponse({
            message: 'Monitoring stopped successfully',
            results: {
                status: 'stopped'
            }
        });

    } catch (error) {
        console.error('❌ Error stopping monitoring:', error);
        throw error;
    }
}

/**
 * Get monitoring status
 */
async function getMonitoringStatus() {
    try {
        // Get current data quality metrics
        const qualityCheck = await performDataQualityCheck();
        
        // Get system health
        const totalTickers = await prisma.ticker.count();
        const tickersWithPrices = await prisma.ticker.count({
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

        const status = {
            dataQuality: qualityCheck,
            systemHealth: {
                totalTickers,
                tickersWithPrices,
                tickersWithMarketCap,
                priceCompleteness: (tickersWithPrices / totalTickers) * 100,
                marketCapCompleteness: (tickersWithMarketCap / totalTickers) * 100
            },
            lastCheck: new Date().toISOString(),
            status: 'active'
        };

        return createCronSuccessResponse({
            message: 'Monitoring status retrieved successfully',
            results: status
        });

    } catch (error) {
        console.error('❌ Error getting monitoring status:', error);
        throw error;
    }
}

/**
 * Perform comprehensive data quality check
 */
async function performDataQualityCheck() {
    try {
        console.log('🔍 Performing comprehensive data quality check...');
        
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Get data quality metrics
        const totalTickers = await prisma.ticker.count();
        
        const withNames = await prisma.ticker.count({
            where: {
                name: {
                    not: null,
                    gt: ''
                }
            }
        });
        
        const withSectors = await prisma.ticker.count({
            where: {
                sector: {
                    not: null,
                    gt: ''
                }
            }
        });
        
        const withIndustries = await prisma.ticker.count({
            where: {
                industry: {
                    not: null,
                    gt: ''
                }
            }
        });
        
        const withLastPrice = await prisma.ticker.count({
            where: {
                lastPrice: {
                    not: null,
                    gt: 0
                }
            }
        });
        
        const withMarketCap = await prisma.ticker.count({
            where: {
                lastMarketCap: {
                    not: null,
                    gt: 0
                }
            }
        });
        
        const withShares = await prisma.ticker.count({
            where: {
                sharesOutstanding: {
                    not: null,
                    gt: 0
                }
            }
        });
        
        const updatedRecently = await prisma.ticker.count({
            where: {
                updatedAt: {
                    gte: oneHourAgo
                }
            }
        });
        
        const updatedToday = await prisma.ticker.count({
            where: {
                updatedAt: {
                    gte: oneDayAgo
                }
            }
        });

        // Calculate quality scores
        const qualityScores = {
            nameCompleteness: (withNames / totalTickers) * 100,
            sectorCompleteness: (withSectors / totalTickers) * 100,
            industryCompleteness: (withIndustries / totalTickers) * 100,
            priceCompleteness: (withLastPrice / totalTickers) * 100,
            marketCapCompleteness: (withMarketCap / totalTickers) * 100,
            sharesCompleteness: (withShares / totalTickers) * 100,
            freshnessScore: (updatedRecently / totalTickers) * 100,
            overallCompleteness: (
                (withNames / totalTickers) * 0.15 +
                (withSectors / totalTickers) * 0.15 +
                (withIndustries / totalTickers) * 0.15 +
                (withLastPrice / totalTickers) * 0.25 +
                (withMarketCap / totalTickers) * 0.20 +
                (withShares / totalTickers) * 0.10
            ) * 100
        };

        // Determine alerts
        const alerts = [];
        
        if (qualityScores.priceCompleteness < 80) {
            alerts.push({
                level: 'warning',
                type: 'data_completeness',
                message: `Price completeness is ${qualityScores.priceCompleteness.toFixed(1)}% (below 80%)`,
                recommendation: 'Check Polygon API and data refresh processes'
            });
        }
        
        if (qualityScores.marketCapCompleteness < 80) {
            alerts.push({
                level: 'warning',
                type: 'data_completeness',
                message: `Market cap completeness is ${qualityScores.marketCapCompleteness.toFixed(1)}% (below 80%)`,
                recommendation: 'Check market cap calculations and data sources'
            });
        }
        
        if (qualityScores.freshnessScore < 50) {
            alerts.push({
                level: 'critical',
                type: 'data_freshness',
                message: `Data freshness is ${qualityScores.freshnessScore.toFixed(1)}% (below 50%)`,
                recommendation: 'Check data refresh schedules and background workers'
            });
        }

        const result = {
            timestamp: now.toISOString(),
            totalTickers,
            completeness: {
                names: { count: withNames, percentage: qualityScores.nameCompleteness },
                sectors: { count: withSectors, percentage: qualityScores.sectorCompleteness },
                industries: { count: withIndustries, percentage: qualityScores.industryCompleteness },
                lastPrice: { count: withLastPrice, percentage: qualityScores.priceCompleteness },
                marketCap: { count: withMarketCap, percentage: qualityScores.marketCapCompleteness },
                shares: { count: withShares, percentage: qualityScores.sharesCompleteness }
            },
            freshness: {
                updatedRecently: { count: updatedRecently, percentage: qualityScores.freshnessScore },
                updatedToday: { count: updatedToday, percentage: (updatedToday / totalTickers) * 100 }
            },
            qualityScores,
            alerts,
            overallScore: qualityScores.overallCompleteness,
            status: qualityScores.overallCompleteness >= 90 ? 'excellent' : 
                   qualityScores.overallCompleteness >= 80 ? 'good' : 
                   qualityScores.overallCompleteness >= 70 ? 'fair' : 'poor'
        };

        console.log('✅ Data quality check completed:', {
            overallScore: result.overallScore,
            alertsCount: alerts.length,
            status: result.status
        });

        return NextResponse.json(result);

    } catch (error) {
        console.error('❌ Error performing data quality check:', error);
        throw error;
    }
}

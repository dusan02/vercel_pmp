import { prisma } from '@/lib/db/prisma';
import { getPolygonClient } from '@/lib/clients/polygonClient';
import { getDateET, createETDate } from '@/lib/utils/dateET';
import { getLastTradingDay } from '@/lib/utils/timeUtils';

export interface TickerStats {
    symbol: string;
    avgVolume20d: number;
    avgReturn20d: number;
    stdDevReturn20d: number;
}

/**
 * Service to calculate statistical baselines for tickers
 */
export class StatsService {
    /**
     * Calculate 20-day stats for a list of tickers
     */
    async updateHistoricalStats(tickers: string[]): Promise<{ success: number; failed: number }> {
        const client = getPolygonClient();
        if (!client) {
            console.error('❌ StatsService: Polygon client not available');
            return { success: 0, failed: tickers.length };
        }

        const apiKey = process.env.POLYGON_API_KEY!;
        const to = getDateET(getLastTradingDay());
        // Go back 40 days to ensure we get 20 trading days
        const fromDate = new Date(createETDate(to).getTime() - 40 * 24 * 60 * 60 * 1000);
        const from = getDateET(fromDate);

        console.log(`📊 StatsService: Calculating stats for ${tickers.length} tickers from ${from} to ${to}...`);

        let success = 0;
        let failed = 0;

        // Process in small batches to avoid rate limits and memory issues
        const batchSize = 10;
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(ticker => this.calculateStatsForTicker(ticker, from, to, apiKey))
            );

            for (const res of results) {
                if (res) {
                    try {
                        await prisma.ticker.update({
                            where: { symbol: res.symbol },
                            data: {
                                avgVolume20d: res.avgVolume20d,
                                avgReturn20d: res.avgReturn20d,
                                stdDevReturn20d: res.stdDevReturn20d,
                            }
                        });
                        success++;
                    } catch (error) {
                        console.error(`❌ StatsService: Failed to update DB for ${res.symbol}:`, error);
                        failed++;
                    }
                } else {
                    failed++;
                }
            }

            // Small delay between batches if needed (Polygon free tier is tight)
            if (i + batchSize < tickers.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return { success, failed };
    }

    /**
     * Calculate stats for a single ticker using Polygon aggregates
     */
    private async calculateStatsForTicker(
        ticker: string,
        from: string,
        to: string,
        apiKey: string
    ): Promise<TickerStats | null> {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=21&apiKey=${apiKey}`;

            const response = await fetch(url);
            if (!response.ok) {
                console.error(`❌ StatsService: Polygon API error for ${ticker}: ${response.status}`);
                return null;
            }

            const data = await response.json();
            if (!data.results || !Array.isArray(data.results) || data.results.length < 5) {
                console.warn(`⚠️ StatsService: Insufficient data for ${ticker} (${data.results?.length || 0} days)`);
                return null;
            }

            const results = data.results as Array<{ v: number; c: number; o: number; t: number }>;

            // Take only last 20 days (or all available if < 20)
            const days = results.slice(0, 20);

            // Calculate daily returns (close-to-close)
            // Note: Polygon descending sort means results[0] is most recent.
            // Day i return = (results[i].c - results[i+1].c) / results[i+1].c
            const returns: number[] = [];
            const volumes: number[] = [];

            for (let i = 0; i < days.length - 1; i++) {
                const current = days[i];
                const next = days[i + 1];
                if (current && next && next.c > 0) {
                    const dailyReturn = (current.c - next.c) / next.c;
                    returns.push(dailyReturn * 100); // in percentage
                }
                if (current) {
                    volumes.push(current.v);
                }
            }

            // Add volume for the last day too
            const lastDay = days[days.length - 1];
            if (lastDay) {
                volumes.push(lastDay.v);
            }

            if (returns.length === 0 || volumes.length === 0) return null;

            // Avg Volume
            const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

            // Avg Return
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

            // Std Dev of Returns
            const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);

            return {
                symbol: ticker,
                avgVolume20d: avgVolume,
                avgReturn20d: avgReturn,
                stdDevReturn20d: stdDev || 0.0001, // Avoid division by zero
            };

        } catch (error) {
            console.error(`❌ StatsService: Error calculating stats for ${ticker}:`, error);
            return null;
        }
    }
}

export const statsService = new StatsService();

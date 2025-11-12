/**
 * Heatmap Treemap API Endpoint
 * Returns stock data grouped by sector for treemap visualization
 * Shows movement vs last known close price (previousClose from DailyRef)
 * 
 * Query params:
 * - date: YYYY-MM-DD (default: today)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeMarketCap, computePercentChange } from '@/lib/marketCapUtils';
import { createSuccessResponse, createErrorResponse } from '@/lib/apiResponse';

export const runtime = 'nodejs';

interface HeatmapStock {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number;
  percentChange: number;
  currentPrice: number;
  sharesOutstanding: number | null;
}

interface SectorGroup {
  sector: string;
  totalMarketCap: number;
  stocks: HeatmapStock[];
}

interface HeatmapResponse {
  sectors: SectorGroup[];
  totalMarketCap: number;
  stockCount: number;
  date: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Get date (default to today)
    const dateParam = searchParams.get('date');
    const targetDate = dateParam 
      ? new Date(dateParam) 
      : new Date();
    
    // Set to start of day for consistent querying
    targetDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get latest price for each symbol from ANY session (most recent)
    // Try to get data from today, but if no data, try yesterday
    let allPrices = await prisma.sessionPrice.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow
        }
      },
      orderBy: {
        lastTs: 'desc'
      },
      include: {
        ticker: {
          select: {
            symbol: true,
            name: true,
            sector: true,
            industry: true,
            sharesOutstanding: true
          }
        }
      },
      take: 1000 // Limit to prevent too many results
    });

    console.log(`📊 Found ${allPrices.length} SessionPrice records for today`);

    // If no data for today, try last 7 days
    if (allPrices.length === 0) {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      allPrices = await prisma.sessionPrice.findMany({
        where: {
          date: {
            gte: weekAgo,
            lt: tomorrow
          }
        },
        orderBy: {
          lastTs: 'desc'
        },
        include: {
          ticker: {
            select: {
              symbol: true,
              name: true,
              sector: true,
              industry: true,
              sharesOutstanding: true
            }
          }
        },
        take: 1000
      });
      
      console.log(`📊 Found ${allPrices.length} SessionPrice records in last 7 days`);
    }

    // Get latest price for each symbol (most recent across all sessions)
    const symbolMap = new Map<string, typeof allPrices[0]>();
    for (const price of allPrices) {
      if (!symbolMap.has(price.symbol)) {
        symbolMap.set(price.symbol, price);
      }
    }

    const tickersWithPrices = Array.from(symbolMap.values());
    
    // Get all symbols to fetch previousClose
    const symbols = tickersWithPrices.map(p => p.symbol);
    
    // Get previousClose for all symbols from DailyRef
    const dailyRefs = await prisma.dailyRef.findMany({
      where: {
        symbol: { in: symbols },
        date: {
          gte: today,
          lt: tomorrow
        }
      }
    });
    
    // If no DailyRef for today, try yesterday
    let dailyRefMap = new Map<string, number>();
    if (dailyRefs.length > 0) {
      for (const ref of dailyRefs) {
        dailyRefMap.set(ref.symbol, ref.previousClose);
      }
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
      
      const yesterdayRefs = await prisma.dailyRef.findMany({
        where: {
          symbol: { in: symbols },
          date: {
            gte: yesterday,
            lt: yesterdayEnd
          }
        }
      });
      
      for (const ref of yesterdayRefs) {
        dailyRefMap.set(ref.symbol, ref.previousClose);
      }
    }

    // Transform data and calculate market cap and percentChange vs previousClose
    const stocks: HeatmapStock[] = [];
    
    for (const sessionPrice of tickersWithPrices) {
      const ticker = sessionPrice.ticker;
      
      // All tickers should have sector now, but keep fallback for safety
      const sector = ticker.sector || 'Other';
      
      const sharesOutstanding = ticker.sharesOutstanding || 0;
      const currentPrice = sessionPrice.lastPrice;
      
      // Skip if price is invalid
      if (!currentPrice || currentPrice <= 0) continue;
      
      const marketCap = computeMarketCap(currentPrice, sharesOutstanding);
      
      // Skip stocks with invalid data
      if (marketCap <= 0 || !isFinite(marketCap)) continue;
      
      // Get previousClose from DailyRef, calculate percentChange
      // Fallback to changePct from SessionPrice if DailyRef not available
      const previousClose = dailyRefMap.get(ticker.symbol);
      let percentChange: number;
      
      if (previousClose && previousClose > 0) {
        // Use DailyRef previousClose to calculate percentChange
        percentChange = computePercentChange(currentPrice, previousClose);
      } else {
        // Fallback: use changePct from SessionPrice (already calculated vs previousClose)
        percentChange = sessionPrice.changePct || 0;
      }
      
      stocks.push({
        ticker: ticker.symbol,
        name: ticker.name,
        sector: sector,
        industry: ticker.industry || 'Uncategorized',
        marketCap,
        percentChange,
        currentPrice,
        sharesOutstanding
      });
    }
    
    console.log(`📊 Processed ${stocks.length} stocks for heatmap`);

    // Group by sector
    const sectorMap = new Map<string, HeatmapStock[]>();
    
    for (const stock of stocks) {
      const sector = stock.sector || 'Other';
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, []);
      }
      sectorMap.get(sector)!.push(stock);
    }

    // Create sector groups with total market cap
    const sectors: SectorGroup[] = Array.from(sectorMap.entries()).map(([sector, sectorStocks]) => {
      // Sort stocks by market cap (largest first)
      const sortedStocks = sectorStocks.sort((a, b) => b.marketCap - a.marketCap);
      
      const totalMarketCap = sortedStocks.reduce((sum, stock) => sum + stock.marketCap, 0);
      
      return {
        sector,
        totalMarketCap,
        stocks: sortedStocks
      };
    });

    // Sort sectors by total market cap (largest first)
    sectors.sort((a, b) => b.totalMarketCap - a.totalMarketCap);

    // Calculate total market cap
    const totalMarketCap = sectors.reduce((sum, sector) => sum + sector.totalMarketCap, 0);

    console.log(`📊 Heatmap response: ${sectors.length} sectors, ${stocks.length} stocks, $${totalMarketCap.toFixed(2)}B total market cap`);

    // If no stocks found, return empty response but still success
    if (stocks.length === 0) {
      console.warn('⚠️ No stocks found for heatmap - returning empty response');
    }

    const response: HeatmapResponse = {
      sectors,
      totalMarketCap,
      stockCount: stocks.length,
      date: targetDate.toISOString().split('T')[0]
    };

    return createSuccessResponse(response, {
      cached: false,
      cacheAge: 0
    });

  } catch (error) {
    console.error('❌ Error in /api/heatmap/treemap:', error);
    return createErrorResponse(
      error,
      'Failed to fetch heatmap data',
      500
    );
  }
}


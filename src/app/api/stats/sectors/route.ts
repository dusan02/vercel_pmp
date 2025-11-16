import { NextRequest, NextResponse } from 'next/server';
import { getAllProjectTickers } from '@/data/defaultTickers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get('project') || 'pmp';
    
    // Get all tickers
    const allTickers = getAllProjectTickers(project);
    
    // Fetch stock data for all tickers
    const tickersString = allTickers.join(',');
    const limit = allTickers.length;
    
    // Fetch from stocks API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const stocksUrl = `${baseUrl}/api/stocks?tickers=${tickersString}&project=${project}&limit=${limit}`;
    
    const response = await fetch(stocksUrl, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch stocks: ${response.statusText}`);
    }
    
    const stocksData = await response.json();
    
    if (!stocksData.success || !stocksData.data) {
      return NextResponse.json({
        success: false,
        error: 'No stock data available',
        timestamp: new Date().toISOString()
      }, { status: 404 });
    }
    
    // Count by sector
    const sectorCounts: { [key: string]: number } = {};
    const sectorDetails: { [key: string]: string[] } = {};
    
    stocksData.data.forEach((stock: any) => {
      const sector = stock.sector || 'Unknown';
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      
      if (!sectorDetails[sector]) {
        sectorDetails[sector] = [];
      }
      sectorDetails[sector].push(stock.ticker);
    });
    
    // Sort by count (descending)
    const sortedSectors = Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1]);
    
    return NextResponse.json({
      success: true,
      data: {
        sectorCounts: Object.fromEntries(sortedSectors),
        sectorDetails,
        total: stocksData.data.length,
        totalTickers: allTickers.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in /api/stats/sectors:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}


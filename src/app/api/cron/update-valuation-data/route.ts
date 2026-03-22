import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ValuationService } from '@/services/valuationService';
import { getCronAuth } from '@/lib/cronAuth';

// Cron job pre aktualizáciu valučných dát
// Beží každý deň o 2:00 AM UTC (9:00 PM EST)
export async function POST(request: NextRequest, context: { params: Promise<{}> }) {
  try {
    // Overenie cron autorizácie
    const authResult = await getCronAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔄 Starting valuation data update cron job');
    
    // Získanie všetkých aktívnych tickerov
    const tickers = await prisma.ticker.findMany({
      where: {
        lastPrice: { not: null }, // Len tickery s cenovými dátami
        lastPriceUpdated: { 
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Aktualizované v posledných 7 dňoch
        }
      },
      select: { symbol: true }
    });

    console.log(`📊 Found ${tickers.length} active tickers to update`);

    const results = {
      total: tickers.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ symbol: string; error: string }>
    };

    // Paralelné spracovanie (max 5 naraz)
    const batchSize = 5;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async ({ symbol }) => {
          try {
            console.log(`📈 Processing ${symbol}...`);
            
            // Generovanie demo dát (namiesto collectHistoricalData)
            await ValuationService.generateDemoData(symbol);
            
            // Percentile sa už vypočítajú v generateDemoData
            
            results.success++;
            console.log(`✅ ${symbol} completed successfully`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ ${symbol} failed:`, errorMessage);
            
            results.failed++;
            results.errors.push({
              symbol,
              error: errorMessage
            });
          }
        })
      );
      
      // Krátka pauza medzi batchmi (aby sme nezahltili API)
      if (i + batchSize < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`🎉 Valuation update completed: ${results.success}/${results.total} successful`);

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        duration: Date.now() - Date.now(), // Placeholder - v skutočnosti by sme merali čas
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Valuation cron job failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint pre manuálne spustenie (pre testovanie)
export async function GET(request: NextRequest, context: { params: Promise<{}> }) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  
  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    );
  }

  try {
    console.log(`🔄 Manual valuation update for ${symbol}`);
    
    await ValuationService.generateDemoData(symbol.toUpperCase());
    
    return NextResponse.json({
      success: true,
      message: `Valuation data updated for ${symbol}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Manual update failed for ${symbol}:`, error);
    
    return NextResponse.json(
      { 
        error: 'Manual update failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

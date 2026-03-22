import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { GuruFocusService } from '@/services/guruFocusService';
import { getCronAuth } from '@/lib/cronAuth';

// Cron job pre aktualizáciu GuruFocus metrík
// Beží každý deň o 1:00 AM UTC (8:00 PM EST predchádzajúci deň)
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

    console.log('🔄 Starting GuruFocus metrics update cron job');
    
    // Získanie všetkých aktívnych tickerov
    const tickers = await prisma.ticker.findMany({
      where: {
        lastPrice: { not: null },
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

    // Paralelné spracovanie (max 3 naraz - GuruFocus výpočty sú náročnejšie)
    const batchSize = 3;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async ({ symbol }) => {
          try {
            console.log(`📈 Processing ${symbol}...`);
            
            // Aktualizácia GuruFocus metrík pre dnešný dátum
            await GuruFocusService.updateGuruFocusMetrics(symbol, new Date());
            
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
      
      // Krátka pauza medzi batchmi
      if (i + batchSize < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`🎉 GuruFocus update completed: ${results.success}/${results.total} successful`);

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        timestamp: new Date().toISOString(),
        metrics: [
          'peRatio', 'psRatio', 'pbRatio', 'evEbitda', 'fcfYield',
          'evRevenue', 'evFcf', 'priceTangibleBook', 'pegRatio',
          'roic', 'roe', 'debtToEquity', 'currentRatio', 'quickRatio'
        ]
      }
    });

  } catch (error) {
    console.error('❌ GuruFocus cron job failed:', error);
    
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
    console.log(`🔄 Manual GuruFocus update for ${symbol}`);
    
    await GuruFocusService.updateGuruFocusMetrics(symbol.toUpperCase(), new Date());
    
    return NextResponse.json({
      success: true,
      message: `GuruFocus metrics updated for ${symbol}`,
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

import { NextRequest, NextResponse } from 'next/server';
import { ingestBatch } from '@/workers/polygonWorker';
import { getUniverse } from '@/lib/redis/operations';
import { getAllProjectTickers } from '@/data/defaultTickers';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
    }

    // Check if specific tickers are provided in request body
    let tickers: string[] = [];
    try {
      const body = await request.json();
      if (body.tickers && Array.isArray(body.tickers) && body.tickers.length > 0) {
        tickers = body.tickers.map((t: string) => t.toUpperCase().trim()).filter((t: string) => t.length > 0);
        console.log(`📊 Ingesting specific tickers: ${tickers.join(', ')}`);
      }
    } catch (e) {
      // No body or invalid JSON, use default behavior
    }

    // If no specific tickers provided, get universe
    if (tickers.length === 0) {
      tickers = await getUniverse('sp500');
      if (tickers.length === 0) {
        tickers = getAllProjectTickers('pmp');
      }
    }

    // For small batches (<= 10), await the result
    if (tickers.length <= 10) {
      try {
        const results = await ingestBatch(tickers, apiKey);
        const successCount = results.filter(r => r.success).length;
        return NextResponse.json({ 
          message: 'Ingestion completed', 
          count: tickers.length,
          success: successCount,
          failed: tickers.length - successCount,
          results: results.map(r => ({ symbol: r.symbol, success: r.success, price: r.price }))
        });
      } catch (error) {
        return NextResponse.json({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Ingestion failed'
        }, { status: 500 });
      }
    }

    // For larger batches, run in background
    ingestAll(tickers, apiKey).catch(err => console.error('Ingest error:', err));

    return NextResponse.json({ 
      message: 'Ingestion started in background', 
      count: tickers.length 
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

async function ingestAll(tickers: string[], apiKey: string) {
  const batchSize = 60;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);
    await ingestBatch(batch, apiKey);
    // Small delay to be nice
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('Ingestion complete');
}


import { NextResponse } from 'next/server';
import { ingestBatch } from '@/workers/polygonWorker';
import { getUniverse } from '@/lib/redis/operations';
import { getAllProjectTickers } from '@/data/defaultTickers';

export async function POST() {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
    }

    // Get universe
    let tickers = await getUniverse('sp500');
    if (tickers.length === 0) {
      tickers = getAllProjectTickers('pmp');
    }

    // Trigger ingestion (background or await?)
    // Awaiting might timeout the request if too many tickers.
    // But for "load today's data", user probably wants to know when it's done.
    // Vercel/Next.js limits serverless functions to 10s-60s.
    // But this is localhost.
    
    // We'll ingest a small batch or start it.
    // Let's just start it and return "started".
    
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


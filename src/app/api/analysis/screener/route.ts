import { NextResponse } from 'next/server';
import { runScreener } from '@/lib/screener/runScreener';

/**
 * Unified Stocks & Screener API — thin HTTP wrapper over the shared
 * `runScreener` pipeline (also used by /screener page SSR for initialData).
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const body = await runScreener(searchParams);
    if ('error' in body) return NextResponse.json(body, { status: 500 });
    return NextResponse.json(body);
}

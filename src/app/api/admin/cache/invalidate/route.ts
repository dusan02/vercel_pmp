import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Cache invalidation endpoint - POST {"paths":["/analysis/PSX",...]}',
    timestamp: new Date().toISOString()
  });
}

/**
 * On-demand ISR invalidation for ticker-scoped pages.
 * Body: { "paths": ["/analysis/PSX", "/valuation/PSX", ...] }
 * or:   { "symbol": "PSX" } — expands to all 4 ticker page types.
 * Auth: x-admin-key header (ADMIN_SECRET_KEY env) in production.
 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key');
    if (process.env.NODE_ENV === 'production' && adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
    if (typeof body?.symbol === 'string' && body.symbol.trim()) {
      const s = body.symbol.trim().toUpperCase();
      paths.push(`/analysis/${s}`, `/valuation/${s}`, `/financials/${s}`, `/premarket/${s}`);
    }

    // Allow only site-relative page paths — no open redirect / host tricks
    paths = [...new Set(paths)]
      .filter((p): p is string => typeof p === 'string' && /^\/[a-zA-Z0-9\-\/_]+$/.test(p))
      .slice(0, 50);

    const revalidated: string[] = [];
    for (const p of paths) {
      try {
        revalidatePath(p);
        revalidated.push(p);
      } catch (e) {
        console.warn(`[cache/invalidate] revalidatePath(${p}) failed:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      revalidated,
      count: revalidated.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in /api/admin/cache/invalidate:', error);
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

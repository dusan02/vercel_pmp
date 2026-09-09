import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/utils/cronAuth';
import { addToUniverse, getUniverse } from '@/lib/redis/operations';
import { getAllProjectTickers } from '@/data/defaultTickers';
import { updateCronStatus } from '@/lib/utils/cronStatus';

/**
 * Populate Redis universe sets (sp500).
 *
 * Production symptom it fixes:
 * - universe:sp500 is empty => workers/crons relying on getUniverse() ingest 0 tickers
 *   => most movements become 0% because references/prices never refresh.
 *
 * Usage:
 * - POST /api/cron/update-universe
 * - Authorization: Bearer $CRON_SECRET_KEY
 *
 * Query params:
 * - dryRun=true  (default false)
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const tickers = getAllProjectTickers('pmp')
    .map(t => String(t).trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ success: false, error: 'No tickers available' }, { status: 500 });
  }

  const before = await getUniverse('sp500');

  let added = 0;
  let ok = true;
  if (!dryRun) {
    ok = await addToUniverse('sp500', tickers);
    added = ok ? tickers.length : 0;
  }

  const after = await getUniverse('sp500');

  if (!dryRun) {
    await updateCronStatus('update_universe');
  }

  return NextResponse.json({
    success: ok,
    dryRun,
    tickers: {
      source: 'defaultTickers(pmp)',
      expected: tickers.length,
      before: before.length,
      after: after.length,
      added,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  // Convenience: allow safe dry-run via GET
  const url = new URL(request.url);
  if (!url.searchParams.has('dryRun')) {
    url.searchParams.set('dryRun', 'true');
  }
  const mock = new NextRequest(url.toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET_KEY || ''}`,
    },
  });
  return POST(mock);
}


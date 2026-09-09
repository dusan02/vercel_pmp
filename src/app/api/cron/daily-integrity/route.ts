import { NextRequest, NextResponse } from 'next/server';
import { runDailyIntegrityCheck } from '@/lib/jobs/dailyIntegrityCheck';
import { verifyCronAuth } from '@/lib/utils/cronAuth';

/**
 * POST: secured cron trigger (requires CRON_SECRET_KEY)
 * GET: manual trigger (no auth, for testing)
 */

async function run(fix: boolean) {
  const summary = await runDailyIntegrityCheck({
    fix,
    maxSamplesPerIssue: 15
  });

  return NextResponse.json({
    success: true,
    message: `Daily integrity check completed${fix ? ' (with fixes)' : ''}`,
    summary,
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const fix = url.searchParams.get('fix') === 'true';
    return await run(fix);
  } catch (error) {
    console.error('❌ Error in daily integrity cron job:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const fix = url.searchParams.get('fix') === 'true';
    return await run(fix);
  } catch (error) {
    console.error('❌ Error in daily integrity check:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}


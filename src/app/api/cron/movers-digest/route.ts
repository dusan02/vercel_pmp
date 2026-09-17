/**
 * POST /api/cron/movers-digest — daily premarket movers digest notification.
 *
 * Runs weekday mornings (~08:00 ET) mid-premarket: pushes top gainers/losers
 * to push subscribers + emails when SMTP is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth, withCronLock } from '@/lib/utils/cronAuth';
import { NotificationService } from '@/services/notificationService';
import { detectSession, mapToRedisSession } from '@/lib/utils/timeUtils';
import { getDateET, getManyLastWithDate, getRankedSymbols } from '@/lib/redis/ranking';

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  return withCronLock('movers-digest', 300, async () => {
    const detected = detectSession();
    const mapped = detected === 'closed' ? 'after' : (detected as 'pre' | 'live' | 'after');
    const session = mapToRedisSession(mapped) ?? 'after';
    const date = getDateET();

    const [gainerSyms, loserSyms] = await Promise.all([
      getRankedSymbols(date, session, 'chg', 'desc', 0, 5),
      getRankedSymbols(date, session, 'chg', 'asc', 0, 5),
    ]);
    const symbols = [...gainerSyms, ...loserSyms];
    const last = await getManyLastWithDate(date, session, symbols);

    const movers = symbols
      .map((symbol) => ({
        symbol,
        name: last.get(symbol)?.name,
        changePct: last.get(symbol)?.change_pct ?? 0,
      }))
      .filter((m) => Math.abs(m.changePct) >= 0.01)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    const dateLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });

    await NotificationService.notifyMoversDigest(dateLabel, movers);

    return NextResponse.json({ ok: true, session, date, movers: movers.length });
  });
}

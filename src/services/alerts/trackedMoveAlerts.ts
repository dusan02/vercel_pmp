/**
 * Tracked-move alerts — the "Track" step of the product loop.
 *
 * Fired from the Polygon ingest worker (write path, single process) when a
 * ticker enters a significant-move state. Dedup + escalation semantics:
 *
 *   σ 2.1 → "unusual"     → push
 *   σ 2.2 → same level    → silent   (per-level key already claimed)
 *   σ 4.0 → "very_unusual"→ push     (higher level → new key → new alert)
 *   σ 2.5 after 4.0       → silent   (max-level gate — no downgrade alerts)
 *
 * Redis keys per symbol+trading day (TTL ~20h):
 *   alert:{symbol}:{dateET}:lvl{n}  — atomic claim via SET NX (dedup)
 *   alert:{symbol}:{dateET}:max     — highest level already notified
 *
 * Never throws — an alert failure must not break ingest.
 */
import { redisOps } from '@/lib/redis/enhancedOperations';
import { sigmaLevel, SIGMA_LABELS, type SigmaLevel } from '@/services/movers/classify';
import { NotificationService } from '@/services/notificationService';

const LEVEL_RANK: Record<SigmaLevel, number> = {
  normal: 0,
  unusual: 1,
  very_unusual: 2,
  extreme: 3,
};

const ALERT_TTL_SEC = 20 * 60 * 60;

export interface TrackedMoveInput {
  symbol: string;
  zScore: number | null;
  changePct: number;
  /** YYYY-MM-DD calendar date in ET — scopes dedup to one trading day */
  dateET: string;
  reason?: string | null;
}

export interface TrackedMoveResult {
  notified: boolean;
  level: SigmaLevel;
}

export async function maybeNotifyTrackedMove(input: TrackedMoveInput): Promise<TrackedMoveResult> {
  const level = sigmaLevel(input.zScore);
  if (level === 'normal') return { notified: false, level };

  try {
    const rank = LEVEL_RANK[level];
    const base = `alert:${input.symbol}:${input.dateET}`;

    // Max-level gate — a drop to a lower level must not re-notify
    const maxSeen = parseInt((await redisOps.get(`${base}:max`)) ?? '0', 10) || 0;
    if (rank <= maxSeen) return { notified: false, level };

    // Atomic claim for THIS level — first writer wins, repeat ingest dedups
    const lvlKey = `${base}:lvl${rank}`;
    const claimed = await redisOps.setNx(lvlKey, ALERT_TTL_SEC, '1');
    if (!claimed) return { notified: false, level };

    const delivery = await NotificationService.notifyTrackedMove(input.symbol, {
      changePct: input.changePct,
      zScore: input.zScore,
      sigmaLabel: SIGMA_LABELS[level],
      reason: input.reason ?? null,
    });

    // Total transient failure (every push threw, or the subscriber lookup
    // failed) — release the claim so the next ingest tick retries delivery.
    // Partial failure keeps the claim: delivered users must not get dupes.
    if (delivery.subscribers !== 0 && delivery.sent === 0) {
      await redisOps.del(lvlKey).catch(() => {});
      return { notified: false, level };
    }

    await redisOps.setEx(`${base}:max`, ALERT_TTL_SEC, String(rank));
    return { notified: true, level };
  } catch (error) {
    console.warn(`[Alerts] maybeNotifyTrackedMove failed for ${input.symbol}:`, error);
    return { notified: false, level };
  }
}

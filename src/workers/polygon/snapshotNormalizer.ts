/**
 * Snapshot normalizer.
 *
 * Converts Polygon snapshot data into our internal normalized format.
 * Uses session-aware price resolver to prevent stale data overwrites.
 */

import { nowET } from '@/lib/utils/dateET';
import { resolveEffectivePrice, calculatePercentChange } from '@/lib/utils/priceResolver';
import { PolygonSnapshot } from './shared';

export type NormalizedSnapshot = {
  price: number;
  changePct: number;
  timestamp: Date;
  quality: 'delayed_15m' | 'rest' | 'snapshot';
  source: string;
  isStale: boolean;
  reference: { used: 'previousClose' | 'regularClose' | null; price: number | null };
  volume: number;
};

export function normalizeSnapshot(
  snapshot: PolygonSnapshot,
  previousClose: number | null,
  regularClose: number | null,
  session: 'pre' | 'live' | 'after' | 'closed',
  frozenAfterHoursPrice?: { price: number; timestamp: Date },
  force: boolean = false
): NormalizedSnapshot | null {
  const effectivePrice = resolveEffectivePrice(
    snapshot,
    session,
    nowET(),
    frozenAfterHoursPrice,
    force
  );

  if (!effectivePrice || effectivePrice.price <= 0) {
    return null;
  }

  const effectivePreviousClose = effectivePrice.source === 'regularClose'
    ? previousClose
    : (previousClose || snapshot.prevDay?.c || null);

  const percentResult = calculatePercentChange(
    effectivePrice.price,
    session,
    effectivePreviousClose,
    regularClose
  );

  let quality: 'delayed_15m' | 'rest' | 'snapshot' = 'rest';
  if (effectivePrice.isStale) {
    quality = 'delayed_15m';
  } else if (process.env.POLYGON_PLAN === 'starter') {
    quality = 'delayed_15m';
  }

  return {
    price: effectivePrice.price,
    changePct: percentResult.changePct,
    timestamp: effectivePrice.timestamp,
    quality,
    source: effectivePrice.source,
    isStale: effectivePrice.isStale,
    reference: percentResult.reference,
    volume: snapshot.day?.v || snapshot.min?.v || 0
  };
}

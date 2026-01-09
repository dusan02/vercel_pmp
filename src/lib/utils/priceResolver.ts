/**
 * Price Resolver - Session-aware price resolution
 * 
 * This module provides a single source of truth for resolving effective prices
 * from Polygon snapshots based on market session and timestamp validation.
 * 
 * CRITICAL: This prevents stale data from overwriting good prices.
 */

import { isMarketHoliday } from './timeUtils';
import { getPricingState, PriceState } from './pricingStateMachine';
import { isWeekendET, nowET, toET, isSameETDay, isInSessionET, nsToMs } from './dateET';

export type PriceSource = 'min' | 'lastTrade' | 'day' | 'frozen' | 'regularClose';

export interface EffectivePrice {
  price: number;
  source: PriceSource;
  timestamp: Date;
  isStale: boolean;
  staleReason?: string;
}

export interface PercentChangeResult {
  changePct: number;
  reference: {
    used: 'previousClose' | 'regularClose' | null;
    price: number | null;
  };
}

export interface PolygonSnapshot {
  ticker: string;
  day?: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
  prevDay?: {
    c: number;
  };
  min?: {
    av: number;
    t: number;
    c?: number;
    o?: number;
    h?: number;
    l?: number;
    v?: number;
  };
  lastQuote?: {
    p: number;
    t: number;
  };
  lastTrade?: {
    p: number;
    t: number;
  };
}

/**
 * Check if timestamp is valid (ET timezone, DST-safe)
 * 
 * CRITICAL: For frozen states (OVERNIGHT_FROZEN, WEEKEND_FROZEN),
 * we allow timestamps from the last trading day, not just "today"
 * 
 * Also handles nanosecond timestamps from Polygon API
 */
function isTimestampValid(
  timestamp: number,
  etNow: Date,
  pricingState: PriceState
): boolean {
  // Convert nanoseconds to milliseconds if needed
  const tsMs = nsToMs(timestamp);
  const tsDate = new Date(tsMs);
  
  // For frozen states, allow last trading day (not just today)
  if (pricingState === PriceState.OVERNIGHT_FROZEN || pricingState === PriceState.WEEKEND_FROZEN) {
    // Allow timestamps from last 3 days (covers weekend + holiday)
    const threeDaysAgo = new Date(etNow);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return tsDate >= threeDaysAgo;
  }
  
  // For live states, must be from today (DST-safe)
  return isSameETDay(tsDate, etNow);
}

/**
 * Check if timestamp is from today (ET timezone)
 * @deprecated Use isTimestampValid with pricingState instead
 */
function isTimestampFromToday(timestamp: number, etNow: Date): boolean {
  const tsMs = nsToMs(timestamp);
  return isSameETDay(new Date(tsMs), etNow);
}

/**
 * Check if timestamp is within session window (DST-safe)
 */
function isTimestampInSession(timestamp: number, session: 'pre' | 'live' | 'after', etNow: Date): boolean {
  // Convert nanoseconds to milliseconds if needed
  const tsMs = nsToMs(timestamp);
  
  // Use DST-safe helper
  return isInSessionET(tsMs, session, etNow);
}

/**
 * Check if price is stale (older than threshold)
 * Handles nanosecond timestamps from Polygon API
 */
function isStale(timestamp: number, thresholdMinutes: number, nowMs: number): boolean {
  const tsMs = nsToMs(timestamp);
  const ageMs = nowMs - tsMs;
  if (ageMs <= 0) return false; // future timestamps are not stale
  // Stale ONLY if strictly older than threshold (not >=)
  return ageMs > thresholdMinutes * 60_000;
}

/**
 * Resolve effective price from Polygon snapshot based on session
 * 
 * This is the SINGLE SOURCE OF TRUTH for price resolution.
 * All other code should use this function instead of directly accessing snapshot fields.
 * 
 * INVARIANTS:
 * - Never returns price <= 0 (returns null instead)
 * - Frozen prices are never overwritten by zero/null snapshots
 * - Timestamp validation is state-aware (frozen states allow last trading day)
 */
export function resolveEffectivePrice(
  snapshot: PolygonSnapshot,
  session: 'pre' | 'live' | 'after' | 'closed',
  etNow?: Date,
  frozenAfterHoursPrice?: { price: number; timestamp: Date },
  force: boolean = false
): EffectivePrice | null {
  const now = etNow || nowET();
  const nowMs = now.getTime();
  const isWeekendOrHoliday = isWeekendET(now) || isMarketHoliday(now);
  const pricingState = getPricingState(now);

  // OVERNIGHT (20:00-04:00 ET) or WEEKEND: Use frozen price if available
  if (session === 'closed' && !isWeekendOrHoliday) {
    // Overnight: Use frozen after-hours price
    if (frozenAfterHoursPrice) {
      return {
        price: frozenAfterHoursPrice.price,
        source: 'frozen',
        timestamp: frozenAfterHoursPrice.timestamp,
        isStale: false
      };
    }
    // If no frozen price, try to get last available price (but don't overwrite with day.c = 0)
    // This handles edge case where worker runs before 20:00 ET freeze
  }

  if (session === 'closed' && isWeekendOrHoliday) {
    // Weekend/Holiday: Always use frozen price, never fetch new data
    // UNLESS force=true (for manual ingest)
    if (frozenAfterHoursPrice) {
      return {
        price: frozenAfterHoursPrice.price,
        source: 'frozen',
        timestamp: frozenAfterHoursPrice.timestamp,
        isStale: false
      };
    }
    // If no frozen price available and force=false, return null (don't use stale data)
    // If force=true, accept prices from snapshot (for manual catch-up)
    if (!force) {
      return null;
    }
    // Force ingest: Accept day.c or min.c from snapshot (even if from previous trading day)
    if (snapshot.day?.c && snapshot.day.c > 0) {
      return {
        price: snapshot.day.c,
        source: 'day',
        timestamp: now,
        isStale: true // Mark as stale since it's from previous trading day
      };
    }
    if (snapshot.min?.c && snapshot.min.c > 0) {
      const minTMs = snapshot.min.t ? nsToMs(snapshot.min.t) : nowMs;
      return {
        price: snapshot.min.c,
        source: 'min',
        timestamp: new Date(minTMs),
        isStale: true
      };
    }
    // No price available even with force
    return null;
  }

  // PRE-MARKET (04:00-09:30 ET)
  if (session === 'pre') {
    // Priority 1: min.c (pre-market minute bar) - MUST be from today and in pre-market window
    if (snapshot.min?.c && snapshot.min.c > 0 && snapshot.min.t) {
      const minT = snapshot.min.t;
      const minTMs = nsToMs(minT);
      const isValid = isTimestampValid(minT, now, pricingState.state);
      const isInPreMarket = isTimestampInSession(minT, 'pre', now);
      
      if (isValid && isInPreMarket) {
        const stale = isStale(minT, 5, nowMs); // 5 min threshold for pre-market
        return {
          price: snapshot.min.c,
          source: 'min',
          timestamp: new Date(minTMs),
          isStale: stale,
          ...(stale ? { staleReason: 'Pre-market price older than 5 minutes' } : {})
        };
      }
    }

    // Priority 2: lastTrade.p - ONLY if from today and in pre-market window
    if (snapshot.lastTrade?.p && snapshot.lastTrade.p > 0 && snapshot.lastTrade.t) {
      const lastTradeT = snapshot.lastTrade.t;
      const lastTradeTMs = nsToMs(lastTradeT);
      const isValid = isTimestampValid(lastTradeT, now, pricingState.state);
      const isInPreMarket = isTimestampInSession(lastTradeT, 'pre', now);
      
      if (isValid && isInPreMarket) {
        const stale = isStale(lastTradeT, 5, nowMs);
        return {
          price: snapshot.lastTrade.p,
          source: 'lastTrade',
          timestamp: new Date(lastTradeTMs),
          isStale: stale,
          ...(stale ? { staleReason: 'Last trade older than 5 minutes' } : {})
        };
      }
    }

    // Priority 3: lastQuote.p (if no trade available)
    if (snapshot.lastQuote?.p && snapshot.lastQuote.p > 0 && snapshot.lastQuote.t) {
      const lastQuoteT = snapshot.lastQuote.t;
      const lastQuoteTMs = nsToMs(lastQuoteT);
      const isValid = isTimestampValid(lastQuoteT, now, pricingState.state);
      const isInPreMarket = isTimestampInSession(lastQuoteT, 'pre', now);
      
      if (isValid && isInPreMarket) {
        return {
          price: snapshot.lastQuote.p,
          source: 'lastTrade', // Using same source type for quotes
          timestamp: new Date(lastQuoteTMs),
          isStale: isStale(lastQuoteT, 5, nowMs)
        };
      }
    }

    // Fallback: if Polygon has no pre-market prints/quotes yet, use prevDay.c (previous close)
    // This prevents extremely stale DB prices (e.g. from days ago) from showing up as "current" in our UI.
    //
    // NOTE: This is intentionally marked stale and uses an old timestamp (best-effort from snapshot),
    // so it won't be treated as a fresh tick.
    if (snapshot.prevDay?.c && snapshot.prevDay.c > 0) {
      const candidateTs =
        snapshot.lastTrade?.t ||
        snapshot.lastQuote?.t ||
        snapshot.min?.t ||
        null;

      const candidateTsMs = candidateTs ? nsToMs(candidateTs) : nowMs;
      return {
        price: snapshot.prevDay.c,
        source: 'regularClose',
        timestamp: new Date(candidateTsMs),
        isStale: true,
        staleReason: 'No valid pre-market price; falling back to previous close'
      };
    }

    // No valid pre-market price found
    return null;
  }

  // LIVE (09:30-16:00 ET)
  if (session === 'live') {
    // Priority 1: lastTrade.p (most current)
    if (snapshot.lastTrade?.p && snapshot.lastTrade.p > 0 && snapshot.lastTrade.t) {
      const lastTradeT = snapshot.lastTrade.t;
      const lastTradeTMs = nsToMs(lastTradeT);
      const isValid = isTimestampValid(lastTradeT, now, pricingState.state);
      const isInLive = isTimestampInSession(lastTradeT, 'live', now);
      
      if (isValid && isInLive) {
        return {
          price: snapshot.lastTrade.p,
          source: 'lastTrade',
          timestamp: new Date(lastTradeTMs),
          isStale: isStale(lastTradeT, 1, nowMs) // 1 min threshold for live
        };
      }
    }

    // Priority 2: day.c (regular trading day close)
    // For force ingest on weekend, accept day.c even if it's from previous trading day
    if (snapshot.day?.c && snapshot.day.c > 0) {
      // day.c doesn't have timestamp, use current time
      return {
        price: snapshot.day.c,
        source: 'day',
        timestamp: now,
        isStale: false
      };
    }

    // Priority 3: min.c (fallback)
    if (snapshot.min?.c && snapshot.min.c > 0 && snapshot.min.t) {
      const minT = snapshot.min.t;
      const minTMs = nsToMs(minT);
      const isValid = isTimestampValid(minT, now, pricingState.state);
      // For force ingest, be more lenient with timestamp validation
      if (isValid || force) {
        return {
          price: snapshot.min.c,
          source: 'min',
          timestamp: new Date(minTMs),
          isStale: isStale(minT, 1, nowMs)
        };
      }
    }

    // For force ingest, try lastTrade as last resort
    if (force && snapshot.lastTrade?.p && snapshot.lastTrade.p > 0) {
      const lastTradeT = snapshot.lastTrade.t;
      const lastTradeTMs = lastTradeT ? nsToMs(lastTradeT) : nowMs;
      return {
        price: snapshot.lastTrade.p,
        source: 'lastTrade',
        timestamp: new Date(lastTradeTMs),
        isStale: true // Mark as stale since it's from previous trading day
      };
    }

    return null;
  }

  // AFTER-HOURS (16:00-20:00 ET)
  if (session === 'after') {
    type Candidate = {
      price: number;
      source: PriceSource;
      tsMs: number;
      stale: boolean;
      staleReason?: string;
    };

    const candidates: Candidate[] = [];

    // Candidate: min.c
    if (snapshot.min?.c && snapshot.min.c > 0 && snapshot.min.t) {
      const t = snapshot.min.t;
      const tsMs = nsToMs(t);
      const isValid = isTimestampValid(t, now, pricingState.state);
      const isInAfterHours = isTimestampInSession(t, 'after', now);
      if (isValid && isInAfterHours) {
        const stale = isStale(t, 5, nowMs);
        candidates.push({
          price: snapshot.min.c,
          source: 'min',
          tsMs,
          stale,
          ...(stale ? { staleReason: 'After-hours price older than 5 minutes' } : {})
        });
      }
    }

    // Candidate: lastTrade.p
    if (snapshot.lastTrade?.p && snapshot.lastTrade.p > 0 && snapshot.lastTrade.t) {
      const t = snapshot.lastTrade.t;
      const tsMs = nsToMs(t);
      const isValid = isTimestampValid(t, now, pricingState.state);
      const isInAfterHours = isTimestampInSession(t, 'after', now);
      if (isValid && isInAfterHours) {
        const stale = isStale(t, 5, nowMs);
        candidates.push({
          price: snapshot.lastTrade.p,
          source: 'lastTrade',
          tsMs,
          stale,
          ...(stale ? { staleReason: 'Last trade older than 5 minutes' } : {})
        });
      }
    }

    // Candidate: lastQuote.p (fallback)
    if (snapshot.lastQuote?.p && snapshot.lastQuote.p > 0 && snapshot.lastQuote.t) {
      const t = snapshot.lastQuote.t;
      const tsMs = nsToMs(t);
      const isValid = isTimestampValid(t, now, pricingState.state);
      const isInAfterHours = isTimestampInSession(t, 'after', now);
      if (isValid && isInAfterHours) {
        const stale = isStale(t, 5, nowMs);
        candidates.push({
          price: snapshot.lastQuote.p,
          source: 'lastTrade', // keep compat: quotes treated like lastTrade
          tsMs,
          stale,
          ...(stale ? { staleReason: 'Last quote older than 5 minutes' } : {})
        });
      }
    }

    // Pick best: prefer non-stale, then newest timestamp
    const best = candidates.reduce<Candidate | null>((acc, cur) => {
      if (!acc) return cur;
      if (acc.stale !== cur.stale) return acc.stale ? cur : acc;
      return cur.tsMs >= acc.tsMs ? cur : acc;
    }, null);

    if (best) {
      return {
        price: best.price,
        source: best.source,
        timestamp: new Date(best.tsMs),
        isStale: best.stale,
        ...(best.staleReason ? { staleReason: best.staleReason } : {})
      };
    }

    // Fallback: regularClose (if available) - this is acceptable for after-hours
    // But we don't have it in snapshot, so return null
    return null;
  }

  // Should not reach here
  return null;
}

/**
 * Calculate percent change based on session rules
 * 
 * Rules:
 * - Pre-market: vs previousClose (D-1)
 * - Live: vs previousClose (D-1)
 * - After-hours: vs regularClose (D) if available, else previousClose (D-1)
 * - Overnight: vs regularClose (D) if available, else previousClose (D-1)
 * - Weekend: vs regularClose (last trading day) if available, else previousClose
 * 
 * Returns both the percentage and which reference was used (for UI display)
 */
export function calculatePercentChange(
  currentPrice: number,
  session: 'pre' | 'live' | 'after' | 'closed',
  previousClose: number | null,
  regularClose: number | null
): PercentChangeResult {
  if (!currentPrice || currentPrice <= 0) {
    return {
      changePct: 0,
      reference: { used: null, price: null }
    };
  }

  let referencePrice: number | null = null;
  let referenceUsed: 'previousClose' | 'regularClose' | null = null;

  switch (session) {
    case 'pre':
    case 'live':
      // Always vs previousClose (D-1)
      referencePrice = previousClose;
      referenceUsed = previousClose ? 'previousClose' : null;
      break;

    case 'after':
    case 'closed':
      // Prefer regularClose (D), fallback to previousClose (D-1)
      if (regularClose && regularClose > 0) {
        referencePrice = regularClose;
        referenceUsed = 'regularClose';
      } else if (previousClose && previousClose > 0) {
        referencePrice = previousClose;
        referenceUsed = 'previousClose';
      }
      break;

    default:
      referencePrice = previousClose;
      referenceUsed = previousClose ? 'previousClose' : null;
  }

  if (!referencePrice || referencePrice <= 0) {
    return {
      changePct: 0,
      reference: { used: null, price: null }
    };
  }

  return {
    changePct: ((currentPrice / referencePrice) - 1) * 100,
    reference: {
      used: referenceUsed,
      price: referencePrice
    }
  };
}


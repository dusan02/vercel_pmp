/**
 * Pricing State Machine
 * 
 * Defines explicit states for pricing data lifecycle to prevent
 * overwriting good data with bad fallbacks.
 */

import { detectSession, getNextMarketOpen, isMarketHoliday } from './timeUtils';
import { nowET, toET } from './dateET';

export enum PriceState {
  PRE_MARKET_LIVE = 'pre_market_live',      // 04:00-09:30 ET, live updates
  LIVE = 'live',                            // 09:30-16:00 ET, live updates
  AFTER_HOURS_LIVE = 'after_hours_live',    // 16:00-20:00 ET, live updates
  AFTER_HOURS_FROZEN = 'after_hours_frozen', // 20:00-04:00 ET, frozen (no overwrites)
  OVERNIGHT_FROZEN = 'overnight_frozen',    // 20:00-04:00 ET (same as above, alias)
  WEEKEND_FROZEN = 'weekend_frozen'         // Weekend/holiday, frozen (no updates)
}

export interface PricingStateContext {
  state: PriceState;
  canIngest: boolean;        // Can worker ingest new data?
  canOverwrite: boolean;      // Can overwrite existing prices?
  useFrozenPrice: boolean;   // Should use frozen price?
  referencePrice: 'previousClose' | 'regularClose'; // What to use for % change
}

/**
 * Get current pricing state based on ET time
 */
export function getPricingState(etNow?: Date): PricingStateContext {
  const now = etNow || nowET();
  const session = detectSession(now);
  const et = toET(now);
  const dayOfWeek = et.weekday;
  const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isMarketHoliday(now);

  const hours = et.hour;
  const minutes = et.minute;
  const timeInMinutes = hours * 60 + minutes;

  // WEEKEND/HOLIDAY: Frozen, no updates
  if (isWeekendOrHoliday) {
    return {
      state: PriceState.WEEKEND_FROZEN,
      canIngest: false,           // ❌ No new data ingestion
      canOverwrite: false,        // ❌ Never overwrite frozen price
      useFrozenPrice: true,       // ✅ Use last available price
      referencePrice: 'regularClose' // Use last trading day's regular close
    };
  }

  // PRE-MARKET: Live updates
  if (session === 'pre') {
    return {
      state: PriceState.PRE_MARKET_LIVE,
      canIngest: true,            // ✅ Ingest pre-market prices
      canOverwrite: true,         // ✅ Can overwrite (with session-aware validation)
      useFrozenPrice: false,
      referencePrice: 'previousClose' // vs previous day close
    };
  }

  // LIVE TRADING: Live updates
  if (session === 'live') {
    return {
      state: PriceState.LIVE,
      canIngest: true,            // ✅ Ingest live prices
      canOverwrite: true,         // ✅ Can overwrite (with timestamp validation)
      useFrozenPrice: false,
      referencePrice: 'previousClose' // vs previous day close
    };
  }

  // AFTER-HOURS: Live updates until 20:00 ET
  if (session === 'after') {
    return {
      state: PriceState.AFTER_HOURS_LIVE,
      canIngest: true,            // ✅ Ingest after-hours prices
      canOverwrite: true,         // ✅ Can overwrite (with session-aware validation)
      useFrozenPrice: false,
      referencePrice: 'regularClose' // vs today's regular close
    };
  }

  // OVERNIGHT (20:00-04:00 ET): Frozen, no overwrites
  if (session === 'closed' && !isWeekendOrHoliday) {
    return {
      state: PriceState.OVERNIGHT_FROZEN,
      canIngest: false,           // ❌ No new data ingestion (or very limited)
      canOverwrite: false,        // ❌ Never overwrite frozen after-hours price
      useFrozenPrice: true,       // ✅ Use last after-hours price
      referencePrice: 'regularClose' // vs today's regular close (if available)
    };
  }

  // Fallback (should not reach here)
  return {
    state: PriceState.OVERNIGHT_FROZEN,
    canIngest: false,
    canOverwrite: false,
    useFrozenPrice: true,
    referencePrice: 'previousClose'
  };
}

/**
 * Check if price can be overwritten based on state and existing data
 * 
 * INVARIANTS:
 * - Never overwrite with price <= 0 (unless explicit halt state)
 * - Never overwrite frozen prices (state.canOverwrite = false)
 * - Never overwrite with older timestamp
 * - Never overwrite good price with zero/null snapshot
 */
export function canOverwritePrice(
  state: PricingStateContext,
  existingPrice: { price: number; timestamp: Date; session: string } | null,
  newPrice: { price: number; timestamp: Date }
): boolean {
  // INVARIANT 1: If state doesn't allow overwrites, never overwrite
  if (!state.canOverwrite) {
    return false;
  }

  // INVARIANT 2: Never overwrite with price <= 0
  if (!newPrice.price || newPrice.price <= 0) {
    return false;
  }

  // If no existing price, can always write (if price is valid)
  if (!existingPrice) {
    return true;
  }

  // INVARIANT 3: Never overwrite good price with zero/null
  if (!existingPrice.price || existingPrice.price <= 0) {
    // Existing is bad, new is good - allow overwrite
    return true;
  }

  // INVARIANT 4: If new price is newer (by timestamp), can overwrite
  if (newPrice.timestamp > existingPrice.timestamp) {
    return true;
  }

  // If new price is same age or older, don't overwrite
  return false;
}

/**
 * Get next trading day (for TTL calculations)
 */
export function getNextTradingDay(etNow?: Date): Date {
  // Return the next market open instant (09:30 ET) which is what TTL calculations need.
  return getNextMarketOpen(etNow || nowET());
}

/**
 * Calculate TTL for previous close (until next trading day + buffer)
 */
export function getPreviousCloseTTL(etNow?: Date): number {
  const now = etNow || nowET();
  const nextTradingDay = getNextTradingDay(now);
  const ttlMs = nextTradingDay.getTime() - now.getTime();
  const bufferMs = 24 * 60 * 60 * 1000; // 24 hour buffer
  const ttlSeconds = Math.ceil((ttlMs + bufferMs) / 1000);

  // Minimum 7 days, maximum 30 days
  const minTTL = 7 * 24 * 60 * 60; // 7 days
  const maxTTL = 30 * 24 * 60 * 60; // 30 days

  return Math.max(minTTL, Math.min(maxTTL, ttlSeconds));
}


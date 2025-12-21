/**
 * Smoke test for priceResolver - tests entire flow without worker
 * 
 * This test verifies that all pieces work together correctly:
 * - resolveEffectivePrice
 * - calculatePercentChange
 * - Reference info
 * - All invariants
 */

import { resolveEffectivePrice, calculatePercentChange } from '../priceResolver';
import { PriceState, getPricingState } from '../pricingStateMachine';
import { nowET } from '../dateET';
import type { PolygonSnapshot } from '../priceResolver';

// Mock timeUtils
jest.mock('../timeUtils', () => ({
  detectSession: jest.fn(),
  isMarketHoliday: jest.fn(() => false)
}));

// Mock pricingStateMachine
jest.mock('../pricingStateMachine', () => ({
  getPricingState: jest.fn(),
  PriceState: {
    PRE_MARKET_LIVE: 'pre_market_live',
    LIVE: 'live',
    AFTER_HOURS_LIVE: 'after_hours_live',
    OVERNIGHT_FROZEN: 'overnight_frozen',
    WEEKEND_FROZEN: 'weekend_frozen'
  }
}));

describe('priceResolver smoke test - full flow', () => {
  const mockETNow = new Date('2025-01-15T10:00:00-05:00');

  beforeEach(() => {
    jest.clearAllMocks();
    (getPricingState as jest.Mock).mockReturnValue({
      state: PriceState.LIVE,
      canIngest: true,
      canOverwrite: true,
      useFrozenPrice: false,
      referencePrice: 'previousClose'
    });
  });

  it('should resolve price and calculate percent change with all invariants', () => {
    // Given: Complete snapshot with all data
    const snapshot: PolygonSnapshot = {
      ticker: 'AAPL',
      day: {
        c: 155.00,
        o: 150.00,
        h: 156.00,
        l: 149.00,
        v: 1000000
      },
      lastTrade: {
        p: 155.50,
        t: new Date('2025-01-15T15:00:00-05:00').getTime()
      },
      prevDay: {
        c: 150.00
      }
    };

    const previousClose = 150.00; // Adjusted from aggregates API
    const regularClose = null; // Not available yet (live session)

    // When: Resolve price
    (getPricingState as jest.Mock).mockReturnValue({
      state: PriceState.LIVE,
      canIngest: true,
      canOverwrite: true,
      useFrozenPrice: false
    });

    const effectivePrice = resolveEffectivePrice(snapshot, 'live', mockETNow);

    // Then: All invariants must hold
    expect(effectivePrice).not.toBeNull();
    expect(effectivePrice?.price).toBeGreaterThan(0); // INVARIANT: price > 0
    expect(effectivePrice?.price).toBe(155.50); // lastTrade.p has priority
    expect(effectivePrice?.source).toBe('lastTrade');
    expect(effectivePrice?.timestamp).toBeInstanceOf(Date);

    // When: Calculate percent change
    const percentResult = calculatePercentChange(
      effectivePrice!.price,
      'live',
      previousClose,
      regularClose
    );

    // Then: Percent change and reference info must be correct
    expect(percentResult.changePct).toBeCloseTo(3.67, 2); // (155.50/150 - 1) * 100
    expect(percentResult.reference.used).toBe('previousClose');
    expect(percentResult.reference.price).toBe(150.00);
  });

  it('should handle after-hours with regularClose reference', () => {
    // Given: After-hours snapshot
    const snapshot: PolygonSnapshot = {
      ticker: 'AAPL',
      min: {
        c: 160.00,
        t: new Date('2025-01-15T17:00:00-05:00').getTime(),
        av: 2000
      },
      prevDay: {
        c: 150.00
      }
    };

    const previousClose = 150.00; // D-1
    const regularClose = 158.00; // D (today's regular close)

    // When: Resolve and calculate
    (getPricingState as jest.Mock).mockReturnValue({
      state: PriceState.AFTER_HOURS_LIVE,
      canIngest: true,
      canOverwrite: true,
      useFrozenPrice: false
    });

    const effectivePrice = resolveEffectivePrice(snapshot, 'after', mockETNow);
    const percentResult = calculatePercentChange(
      effectivePrice!.price,
      'after',
      previousClose,
      regularClose
    );

    // Then: Should use regularClose, not previousClose
    expect(percentResult.changePct).toBeCloseTo(1.27, 2); // (160/158 - 1) * 100
    expect(percentResult.reference.used).toBe('regularClose');
    expect(percentResult.reference.price).toBe(158.00);
  });

  it('should never return price <= 0 (zero guard)', () => {
    // Given: Snapshot with all zeros
    const snapshot: PolygonSnapshot = {
      ticker: 'AAPL',
      day: {
        c: 0,
        o: 0,
        h: 0,
        l: 0,
        v: 0
      },
      min: {
        c: 0,
        t: 0,
        av: 0
      }
    };

    // When: Resolve
    const effectivePrice = resolveEffectivePrice(snapshot, 'pre', mockETNow);

    // Then: Must return null, never 0
    expect(effectivePrice).toBeNull();
  });

  it('should handle frozen price correctly', () => {
    // Given: Closed session with frozen price
    const snapshot: PolygonSnapshot = {
      ticker: 'AAPL',
      day: {
        c: 0,
        o: 0,
        h: 0,
        l: 0,
        v: 0
      }
    };

    const frozenPrice = {
      price: 158.00,
      timestamp: new Date('2025-01-15T20:00:00-05:00')
    };

    (getPricingState as jest.Mock).mockReturnValue({
      state: PriceState.OVERNIGHT_FROZEN,
      canIngest: false,
      canOverwrite: false,
      useFrozenPrice: true
    });

    // When: Resolve
    const effectivePrice = resolveEffectivePrice(snapshot, 'closed', mockETNow, frozenPrice);

    // Then: Should use frozen price
    expect(effectivePrice).not.toBeNull();
    expect(effectivePrice?.price).toBe(158.00);
    expect(effectivePrice?.source).toBe('frozen');
    expect(effectivePrice?.isStale).toBe(false);
  });
});


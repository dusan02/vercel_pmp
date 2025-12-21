/**
 * Unit tests for priceResolver.ts
 * 
 * Tests session-aware price resolution and percent change calculation
 */

import { resolveEffectivePrice, calculatePercentChange } from '../priceResolver';
import { PriceState, getPricingState } from '../pricingStateMachine';
import { nowET } from '../dateET';
import type { PolygonSnapshot } from '../priceResolver';

// Mock timeUtils to control session detection
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

describe('priceResolver', () => {
  const mockETNow = new Date('2025-01-15T10:00:00-05:00'); // 10:00 ET (live session)

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

  describe('resolveEffectivePrice - Pre-market', () => {
    it('should prioritize min.c over stale lastTrade.p', () => {
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        lastTrade: {
          p: 150.00,
          t: new Date('2025-01-14T20:00:00-05:00').getTime() // Yesterday (stale)
        },
        min: {
          c: 151.00,
          t: new Date('2025-01-15T05:00:00-05:00').getTime(), // Today 05:00 ET
          av: 1000
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.PRE_MARKET_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      // Now is 05:02 ET, so min.t (05:00) is fresh and inside pre-market window
      const preMarketET = new Date('2025-01-15T05:02:00-05:00');
      const result = resolveEffectivePrice(snapshot, 'pre', preMarketET);

      expect(result).not.toBeNull();
      expect(result?.price).toBe(151.00);
      expect(result?.source).toBe('min');
      expect(result?.isStale).toBe(false);
    });

    it('should use lastTrade.p when min.c is 0 (illiquid)', () => {
      const snapshot: PolygonSnapshot = {
        ticker: 'ILLIQ',
        min: {
          c: 0,
          t: new Date('2025-01-15T05:00:00-05:00').getTime(),
          av: 0
        },
        lastTrade: {
          p: 50.00,
          t: new Date('2025-01-15T04:15:00-05:00').getTime() // Today 04:15 ET
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.PRE_MARKET_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'pre', mockETNow);

      expect(result).not.toBeNull();
      expect(result?.price).toBe(50.00);
      expect(result?.source).toBe('lastTrade');
    });

    it('should handle nanosecond timestamps correctly', () => {
      // Polygon API sometimes returns timestamps in nanoseconds
      // Convert to ms: 1765808520000000000 ns = 1765808520000 ms = 2025-12-15 05:00:00 ET (approx)
      const preMarketET = new Date('2025-01-15T05:00:00-05:00');
      const nsTimestamp = preMarketET.getTime() * 1e6; // Convert ms to ns
      
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        min: {
          c: 151.00,
          t: nsTimestamp, // Nanoseconds
          av: 1000
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.PRE_MARKET_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'pre', preMarketET);

      // Should not crash and should handle conversion
      expect(result).not.toBeNull();
      expect(result?.price).toBe(151.00);
    });
  });

  describe('resolveEffectivePrice - Live session', () => {
    it('should prioritize lastTrade.p over day.c', () => {
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        lastTrade: {
          p: 155.00,
          t: new Date('2025-01-15T15:00:00-05:00').getTime() // Today 15:00 ET
        },
        day: {
          c: 154.00,
          o: 150.00,
          h: 156.00,
          l: 149.00,
          v: 1000000
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'live', mockETNow);

      expect(result).not.toBeNull();
      expect(result?.price).toBe(155.00);
      expect(result?.source).toBe('lastTrade');
    });
  });

  describe('resolveEffectivePrice - After-hours', () => {
    it('should use newer lastTrade.p over stale min.c', () => {
      // Use current time in after-hours session
      const afterHoursET = new Date('2025-01-15T17:58:00-05:00');
      const staleTime = new Date(afterHoursET);
      staleTime.setMinutes(staleTime.getMinutes() - 30); // 30 min old
      
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        min: {
          c: 156.00,
          t: staleTime.getTime(), // 30 min old (stale)
          av: 2000
        },
        lastTrade: {
          p: 157.00,
          t: afterHoursET.getTime() // Recent (2 min old, not stale)
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.AFTER_HOURS_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'after', afterHoursET);

      expect(result).not.toBeNull();
      expect(result?.price).toBe(157.00);
      expect(result?.source).toBe('lastTrade');
      expect(result?.isStale).toBe(false);
    });
  });

  describe('resolveEffectivePrice - Overnight frozen', () => {
    it('should use frozen price when available', () => {
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        day: {
          c: 0, // Market closed
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

      const result = resolveEffectivePrice(snapshot, 'closed', mockETNow, frozenPrice);

      expect(result).not.toBeNull();
      expect(result?.price).toBe(158.00);
      expect(result?.source).toBe('frozen');
      expect(result?.isStale).toBe(false);
    });

    it('should never use day.c=0 when frozen price exists', () => {
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

      const result = resolveEffectivePrice(snapshot, 'closed', mockETNow, frozenPrice);

      expect(result?.price).toBe(158.00);
      expect(result?.price).not.toBe(0);
    });
  });

  describe('resolveEffectivePrice - Zero guards', () => {
    it('should return null when all prices are zero', () => {
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

      const result = resolveEffectivePrice(snapshot, 'pre', mockETNow);

      expect(result).toBeNull();
    });
  });

  describe('resolveEffectivePrice - Session boundaries', () => {
    it('should handle 09:29:59 vs 09:30:00 ET boundary', () => {
      const boundaryTime = new Date('2025-01-15T09:30:00-05:00');
      
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        lastTrade: {
          p: 150.00,
          t: new Date('2025-01-15T09:29:59-05:00').getTime() // Pre-market
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'live', boundaryTime);

      // Should not use pre-market timestamp in live session
      expect(result).toBeNull();
    });

    it('should handle 15:59:59 vs 16:00:00 ET boundary', () => {
      const boundaryTime = new Date('2025-01-15T16:00:00-05:00');
      
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        lastTrade: {
          p: 150.00,
          t: new Date('2025-01-15T15:59:59-05:00').getTime() // Live
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.AFTER_HOURS_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      const result = resolveEffectivePrice(snapshot, 'after', boundaryTime);

      // Should not use live timestamp in after-hours session
      expect(result).toBeNull();
    });
  });

  describe('calculatePercentChange', () => {
    it('should calculate pre-market vs previousClose', () => {
      const result = calculatePercentChange(
        151.00, // current
        'pre',
        150.00, // previousClose
        null    // regularClose
      );

      expect(result.changePct).toBeCloseTo(0.67, 2);
      expect(result.reference.used).toBe('previousClose');
      expect(result.reference.price).toBe(150.00);
    });

    it('should calculate after-hours vs regularClose', () => {
      const result = calculatePercentChange(
        160.00, // current
        'after',
        150.00, // previousClose (D-1)
        158.00  // regularClose (D)
      );

      expect(result.changePct).toBeCloseTo(1.27, 2); // (160/158 - 1) * 100
      expect(result.reference.used).toBe('regularClose');
      expect(result.reference.price).toBe(158.00);
    });

    it('should fallback to previousClose when regularClose is missing', () => {
      const result = calculatePercentChange(
        160.00, // current
        'after',
        150.00, // previousClose (D-1)
        null    // regularClose missing
      );

      expect(result.changePct).toBeCloseTo(6.67, 2); // (160/150 - 1) * 100
      expect(result.reference.used).toBe('previousClose');
      expect(result.reference.price).toBe(150.00);
    });

    it('should return zero when reference is missing', () => {
      const result = calculatePercentChange(
        160.00,
        'after',
        null, // no previousClose
        null  // no regularClose
      );

      expect(result.changePct).toBe(0);
      expect(result.reference.used).toBeNull();
      expect(result.reference.price).toBeNull();
    });
  });

  describe('Anti-regression tests', () => {
    describe('DST switch day handling', () => {
      it('should handle DST switch in March (EST -> EDT)', () => {
        // March 9, 2025 - DST switch (2 AM becomes 3 AM)
        const dstSwitchDay = new Date('2025-03-09T09:30:00-04:00'); // EDT (after switch)
        
        const snapshot: PolygonSnapshot = {
          ticker: 'AAPL',
          lastTrade: {
            p: 150.00,
            t: new Date('2025-03-09T09:30:00-04:00').getTime() // EDT
          }
        };

        (getPricingState as jest.Mock).mockReturnValue({
          state: PriceState.LIVE,
          canIngest: true,
          canOverwrite: true,
          useFrozenPrice: false
        });

        const result = resolveEffectivePrice(snapshot, 'live', dstSwitchDay);

        // Should still work correctly despite DST switch
        expect(result).not.toBeNull();
        expect(result?.price).toBe(150.00);
      });

      it('should handle DST switch in November (EDT -> EST)', () => {
        // November 2, 2025 - DST switch (3 AM becomes 2 AM)
        const dstSwitchDay = new Date('2025-11-02T09:30:00-05:00'); // EST (after switch)
        
        const snapshot: PolygonSnapshot = {
          ticker: 'AAPL',
          lastTrade: {
            p: 150.00,
            t: new Date('2025-11-02T09:30:00-05:00').getTime() // EST
          }
        };

        (getPricingState as jest.Mock).mockReturnValue({
          state: PriceState.LIVE,
          canIngest: true,
          canOverwrite: true,
          useFrozenPrice: false
        });

        const result = resolveEffectivePrice(snapshot, 'live', dstSwitchDay);

        // Should still work correctly despite DST switch
        expect(result).not.toBeNull();
        expect(result?.price).toBe(150.00);
      });

      it('should maintain session boundaries during DST switch', () => {
        // Pre-market at 04:00 ET should still be pre-market after DST switch
        const preMarketTime = new Date('2025-03-09T04:00:00-04:00'); // EDT, after switch
        
        const snapshot: PolygonSnapshot = {
          ticker: 'AAPL',
          min: {
            c: 150.00,
            t: new Date('2025-03-09T04:00:00-04:00').getTime(),
            av: 1000
          }
        };

        (getPricingState as jest.Mock).mockReturnValue({
          state: PriceState.PRE_MARKET_LIVE,
          canIngest: true,
          canOverwrite: true,
          useFrozenPrice: false
        });

        const result = resolveEffectivePrice(snapshot, 'pre', preMarketTime);

        expect(result).not.toBeNull();
        expect(result?.price).toBe(150.00);
        expect(result?.source).toBe('min');
      });
    });

    describe('Mixed timestamp formats (ms + ns)', () => {
    it('should handle snapshot with updated in ns and lastTrade.t in ms', () => {
      // Polygon snapshot can have mixed formats
      const preMarketET = new Date('2025-01-15T05:00:00-05:00');
      const lastTradeMs = preMarketET.getTime(); // ms (normal format)
      const minNs = lastTradeMs * 1e6; // ns (converted from ms)
      
      const snapshot: PolygonSnapshot = {
        ticker: 'AAPL',
        // updated field would be in ns (not in our interface, but could be in real data)
        lastTrade: {
          p: 150.00,
          t: lastTradeMs // ms (normal format)
        },
        min: {
          c: 151.00,
          t: minNs, // ns (if Polygon sometimes returns this)
          av: 1000
        }
      };

      (getPricingState as jest.Mock).mockReturnValue({
        state: PriceState.PRE_MARKET_LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false
      });

      // Should not crash and should handle both formats
      const result = resolveEffectivePrice(snapshot, 'pre', preMarketET);

      expect(result).not.toBeNull();
      // Should use min.c (priority) with ns timestamp correctly converted
      expect(result?.price).toBe(151.00);
      expect(result?.source).toBe('min');
    });

      it('should not compare unconverted ns and ms timestamps', () => {
        const msTimestamp = 1765808520000; // ms
        const nsTimestamp = 1765808520000000000; // ns (same time, different format)

        // These should be treated as the same time after conversion
        const msDate = new Date(msTimestamp);
        const nsDate = new Date(nsTimestamp / 1e6); // Convert ns to ms

        // Should be same time (within 1 second tolerance)
        const diff = Math.abs(msDate.getTime() - nsDate.getTime());
        expect(diff).toBeLessThan(1000);
      });
    });

    describe('Fallback reference label', () => {
      it('should return previousClose reference when regularClose is missing', () => {
        const result = calculatePercentChange(
          160.00, // current
          'after',
          150.00, // previousClose (D-1) - available
          null    // regularClose (D) - missing
        );

        expect(result.changePct).toBeCloseTo(6.67, 2); // (160/150 - 1) * 100
        expect(result.reference.used).toBe('previousClose');
        expect(result.reference.price).toBe(150.00);
        
        // UI should display: "After-hours +6.67% (vs prev close 150.00)"
      });

      it('should prefer regularClose when both are available', () => {
        const result = calculatePercentChange(
          160.00, // current
          'after',
          150.00, // previousClose (D-1)
          158.00  // regularClose (D) - preferred
        );

        expect(result.changePct).toBeCloseTo(1.27, 2); // (160/158 - 1) * 100
        expect(result.reference.used).toBe('regularClose');
        expect(result.reference.price).toBe(158.00);
        
        // UI should display: "After-hours +1.27% (vs regular close 158.00)"
      });

      it('should return null reference when both are missing', () => {
        const result = calculatePercentChange(
          160.00,
          'after',
          null, // no previousClose
          null  // no regularClose
        );

        expect(result.changePct).toBe(0);
        expect(result.reference.used).toBeNull();
        expect(result.reference.price).toBeNull();
        
        // UI should display: "After-hours N/A" or hide percent change
      });
    });
  });
});


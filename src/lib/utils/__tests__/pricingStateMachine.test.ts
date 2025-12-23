/**
 * Unit tests for pricingStateMachine.ts
 * 
 * Tests pricing state detection and overwrite protection
 */

import { getPricingState, canOverwritePrice, PriceState, getPreviousCloseTTL } from '../pricingStateMachine';
import { nowET } from '../dateET';
import * as timeUtils from '../timeUtils';

// Mock timeUtils
jest.mock('../timeUtils');

const mockedTimeUtils = timeUtils as jest.Mocked<typeof timeUtils>;

describe('pricingStateMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTimeUtils.isMarketHoliday.mockReturnValue(false);
    mockedTimeUtils.getNextMarketOpen.mockReturnValue(new Date('2025-01-16T09:30:00.000Z'));
  });
  describe('getPricingState', () => {
    it('should return PRE_MARKET_LIVE for 05:00 ET', () => {
      const etNow = new Date('2025-01-15T05:00:00-05:00');
      mockedTimeUtils.detectSession.mockReturnValue('pre');

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.PRE_MARKET_LIVE);
      expect(state.canIngest).toBe(true);
      expect(state.canOverwrite).toBe(true);
      expect(state.useFrozenPrice).toBe(false);
      expect(state.referencePrice).toBe('previousClose');
    });

    it('should return LIVE for 15:00 ET', () => {
      const etNow = new Date('2025-01-15T15:00:00-05:00');
      mockedTimeUtils.detectSession.mockReturnValue('live');

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.LIVE);
      expect(state.canIngest).toBe(true);
      expect(state.canOverwrite).toBe(true);
      expect(state.useFrozenPrice).toBe(false);
    });

    it('should return AFTER_HOURS_LIVE for 17:00 ET', () => {
      const etNow = new Date('2025-01-15T17:00:00-05:00');
      mockedTimeUtils.detectSession.mockReturnValue('after');

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.AFTER_HOURS_LIVE);
      expect(state.canIngest).toBe(true);
      expect(state.canOverwrite).toBe(true);
      expect(state.referencePrice).toBe('regularClose');
    });

    it('should return OVERNIGHT_FROZEN for 21:00 ET', () => {
      const etNow = new Date('2025-01-15T21:00:00-05:00');
      mockedTimeUtils.detectSession.mockReturnValue('closed');

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.OVERNIGHT_FROZEN);
      expect(state.canIngest).toBe(false);
      expect(state.canOverwrite).toBe(false);
      expect(state.useFrozenPrice).toBe(true);
      expect(state.referencePrice).toBe('regularClose');
    });

    it('should return WEEKEND_FROZEN for Saturday', () => {
      const etNow = new Date('2025-01-18T10:00:00-05:00'); // Saturday
      mockedTimeUtils.detectSession.mockReturnValue('closed');
      mockedTimeUtils.isMarketHoliday.mockReturnValue(false);

      // Mock day of week
      jest.spyOn(etNow, 'getDay').mockReturnValue(6); // Saturday

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.WEEKEND_FROZEN);
      expect(state.canIngest).toBe(false);
      expect(state.canOverwrite).toBe(false);
      expect(state.useFrozenPrice).toBe(true);
    });

    it('should return WEEKEND_FROZEN for holiday', () => {
      const etNow = new Date('2025-01-20T10:00:00-05:00'); // Holiday
      mockedTimeUtils.detectSession.mockReturnValue('closed');
      mockedTimeUtils.isMarketHoliday.mockReturnValue(true);

      const state = getPricingState(etNow);

      expect(state.state).toBe(PriceState.WEEKEND_FROZEN);
      expect(state.canIngest).toBe(false);
      expect(state.canOverwrite).toBe(false);
    });
  });

  describe('canOverwritePrice', () => {
    it('should return false for frozen state (canOverwrite=false)', () => {
      const frozenState = {
        state: PriceState.OVERNIGHT_FROZEN,
        canIngest: false,
        canOverwrite: false,
        useFrozenPrice: true,
        referencePrice: 'regularClose' as const
      };

      const existing = {
        price: 150.00,
        timestamp: new Date('2025-01-15T20:00:00-05:00'),
        session: 'after'
      };

      const newPrice = {
        price: 151.00,
        timestamp: new Date('2025-01-15T21:00:00-05:00')
      };

      const result = canOverwritePrice(frozenState, existing, newPrice);

      expect(result).toBe(false);
    });

    it('should return false when newPrice.price <= 0', () => {
      const liveState = {
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose' as const
      };

      const existing = {
        price: 150.00,
        timestamp: new Date('2025-01-15T15:00:00-05:00'),
        session: 'live'
      };

      const newPrice = {
        price: 0, // Invalid
        timestamp: new Date('2025-01-15T15:01:00-05:00')
      };

      const result = canOverwritePrice(liveState, existing, newPrice);

      expect(result).toBe(false);
    });

    it('should return true when newPrice is newer and valid', () => {
      const liveState = {
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose' as const
      };

      const existing = {
        price: 150.00,
        timestamp: new Date('2025-01-15T15:00:00-05:00'),
        session: 'live'
      };

      const newPrice = {
        price: 151.00,
        timestamp: new Date('2025-01-15T15:01:00-05:00') // Newer
      };

      const result = canOverwritePrice(liveState, existing, newPrice);

      expect(result).toBe(true);
    });

    it('should return true when existing price is invalid (<=0)', () => {
      const liveState = {
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose' as const
      };

      const existing = {
        price: 0, // Invalid existing
        timestamp: new Date('2025-01-15T15:00:00-05:00'),
        session: 'live'
      };

      const newPrice = {
        price: 151.00,
        timestamp: new Date('2025-01-15T15:01:00-05:00')
      };

      const result = canOverwritePrice(liveState, existing, newPrice);

      expect(result).toBe(true); // Can overwrite bad existing with good new
    });

    it('should return false when newPrice is older than existing', () => {
      const liveState = {
        state: PriceState.LIVE,
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose' as const
      };

      const existing = {
        price: 150.00,
        timestamp: new Date('2025-01-15T15:01:00-05:00'),
        session: 'live'
      };

      const newPrice = {
        price: 151.00,
        timestamp: new Date('2025-01-15T15:00:00-05:00') // Older
      };

      const result = canOverwritePrice(liveState, existing, newPrice);

      expect(result).toBe(false);
    });
  });

  describe('getPreviousCloseTTL', () => {
    it('should return minimum 7 days', () => {
      const etNow = new Date('2025-01-15T10:00:00-05:00');
      const ttl = getPreviousCloseTTL(etNow);

      expect(ttl).toBeGreaterThanOrEqual(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it('should return maximum 30 days', () => {
      const etNow = new Date('2025-01-15T10:00:00-05:00');
      const ttl = getPreviousCloseTTL(etNow);

      expect(ttl).toBeLessThanOrEqual(30 * 24 * 60 * 60); // 30 days in seconds
    });
  });
});


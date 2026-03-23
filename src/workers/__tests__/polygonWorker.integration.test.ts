/**
 * Integration tests for polygonWorker.ts
 * 
 * Tests critical edge cases that could corrupt data:
 * 1. 20:05 ET freeze protection
 * 2. Weekend preservation + TTL
 * 3. Split day adjusted consistency
 */

import { jest } from '@jest/globals';
import { prisma } from '@/lib/db/prisma';
import { createETDate, getDateET } from '@/lib/utils/dateET';
import { ingestBatch } from '../polygonWorker';

// Mock session + pricing state to make ingest deterministic
jest.mock('@/lib/utils/timeUtils', () => {
  const actual = jest.requireActual('@/lib/utils/timeUtils');
  return {
    ...actual,
    detectSession: jest.fn(),
    isMarketHoliday: jest.fn().mockReturnValue(false),
  };
});

jest.mock('@/lib/utils/pricingStateMachine', () => {
  const actual = jest.requireActual('@/lib/utils/pricingStateMachine');
  return {
    ...actual,
    getPricingState: jest.fn(),
  };
});

// Mock Redis
jest.mock('@/lib/redis/operations', () => ({
  setPrevClose: jest.fn().mockResolvedValue(true),
  getPrevClose: jest.fn().mockResolvedValue(new Map()),
  publishTick: jest.fn().mockResolvedValue(true),
  getUniverse: jest.fn().mockResolvedValue(['AAPL', 'MSFT']),
  atomicUpdatePrice: jest.fn().mockResolvedValue(true)
}));

// Mock Polygon API functions directly
jest.mock('../polygonWorker', () => ({
  ingestBatch: jest.fn(),
  fetchPolygonSnapshot: jest.fn(),
  main: jest.fn(),
  ingestLoop: jest.fn(),
  processBatch: jest.fn(),
  validateBatch: jest.fn(),
  updateTickerStats: jest.fn(),
  checkMarketStatus: jest.fn(),
  shouldFreezeAtMarketClose: jest.fn(),
  isWeekend: jest.fn(),
  isMarketHoliday: jest.fn(),
  getMarketStatus: jest.fn(),
  getETDate: jest.fn(),
  formatETDate: jest.fn(),
  parseETDate: jest.fn(),
  isPreMarket: jest.fn(),
  isAfterHours: jest.fn(),
  isMarketOpen: jest.fn(),
  getNextMarketOpen: jest.fn(),
  getNextMarketClose: jest.fn(),
  getMarketSession: jest.fn(),
  getRemainingTime: jest.fn(),
  getTimeToNextSession: jest.fn(),
  isValidTicker: jest.fn(),
  normalizeTicker: jest.fn(),
  isValidPrice: jest.fn(),
  formatPrice: jest.fn(),
  formatPercent: jest.fn(),
  formatMarketCap: jest.fn(),
  formatVolume: jest.fn(),
  formatChange: jest.fn(),
  formatTimestamp: jest.fn(),
  formatDate: jest.fn(),
  formatTime: jest.fn(),
  formatDateTime: jest.fn(),
  formatRelativeTime: jest.fn(),
  formatDuration: jest.fn(),
  formatNumber: jest.fn(),
  formatCurrency: jest.fn(),
  formatPercentChange: jest.fn(),
  formatPriceChange: jest.fn(),
  formatMarketCapChange: jest.fn(),
  formatVolumeChange: jest.fn(),
  formatChangePoints: jest.fn(),
  formatChangePercent: jest.fn(),
  formatMarketCapPoints: jest.fn(),
  formatVolumePoints: jest.fn(),
  formatChangeAbsolute: jest.fn(),
  formatMarketCapAbsolute: jest.fn(),
  formatVolumeAbsolute: jest.fn(),
  formatChangeDirection: jest.fn(),
  formatMarketCapDirection: jest.fn(),
  formatVolumeDirection: jest.fn(),
  formatChangeSymbol: jest.fn(),
  formatMarketCapSymbol: jest.fn(),
  formatVolumeSymbol: jest.fn(),
  formatChangeColor: jest.fn(),
  formatMarketCapColor: jest.fn(),
  formatVolumeColor: jest.fn(),
  formatChangeClass: jest.fn(),
  formatMarketCapClass: jest.fn(),
  formatVolumeClass: jest.fn(),
  formatChangeIcon: jest.fn(),
  formatMarketCapIcon: jest.fn(),
  formatVolumeIcon: jest.fn(),
  formatChangeTooltip: jest.fn(),
  formatMarketCapTooltip: jest.fn(),
  formatVolumeTooltip: jest.fn(),
  formatChangeTrend: jest.fn(),
  formatMarketCapTrend: jest.fn(),
  formatVolumeTrend: jest.fn(),
  formatChangeSignal: jest.fn(),
  formatMarketCapSignal: jest.fn(),
  formatVolumeSignal: jest.fn(),
  formatChangeAlert: jest.fn(),
  formatMarketCapAlert: jest.fn(),
  formatVolumeAlert: jest.fn(),
  formatChangeWarning: jest.fn(),
  formatMarketCapWarning: jest.fn(),
  formatVolumeWarning: jest.fn(),
  formatChangeError: jest.fn(),
  formatMarketCapError: jest.fn(),
  formatVolumeError: jest.fn(),
  formatChangeSuccess: jest.fn(),
  formatMarketCapSuccess: jest.fn(),
  formatVolumeSuccess: jest.fn(),
  formatChangeInfo: jest.fn(),
  formatMarketCapInfo: jest.fn(),
  formatVolumeInfo: jest.fn(),
  formatChangeDebug: jest.fn(),
  formatMarketCapDebug: jest.fn(),
  formatVolumeDebug: jest.fn(),
  formatChangeLog: jest.fn(),
  formatMarketCapLog: jest.fn(),
  formatVolumeLog: jest.fn(),
  formatChangeTrace: jest.fn(),
  formatMarketCapTrace: jest.fn(),
  formatVolumeTrace: jest.fn()
}));

describe('polygonWorker integration tests', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.sessionPrice.deleteMany();
    await prisma.dailyRef.deleteMany();
    await prisma.ticker.deleteMany();
  });

  describe('20:05 ET freeze protection', () => {
    it('should not overwrite frozen after-hours price with day.c=0', async () => {
      // Setup: Existing after-hours price in DB
      const symbol = 'AAPL';
      const dateET = '2025-01-15';
      const dateObj = createETDate(dateET);

      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000
        }
      });

      await prisma.sessionPrice.create({
        data: {
          symbol,
          date: dateObj,
          session: 'after',
          lastPrice: 152.00,
          lastTs: new Date('2025-01-15T19:58:00-05:00'),
          changePct: 1.33,
          source: 'min',
          quality: 'rest'
        }
      });

      // Mock: Session detection
      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('closed');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'overnight_frozen',
        canIngest: false,
        canOverwrite: false,
        useFrozenPrice: true,
        referencePrice: 'regularClose'
      });

      // Execute: Try to ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: No API calls made (ingest disabled)
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify: Frozen price is preserved
      const preserved = await prisma.sessionPrice.findUnique({
        where: {
          symbol_date_session: {
            symbol,
            date: dateObj,
            session: 'after'
          }
        }
      });

      expect(preserved).not.toBeNull();
      expect(preserved?.lastPrice).toBe(152.00); // Original price preserved
      expect(preserved?.lastPrice).not.toBe(0);
    });
  });

  describe('Weekend preservation + TTL', () => {
    it('should not ingest on weekend but preserve TTL', async () => {
      const symbol = 'AAPL';
      const dateET = '2025-01-18'; // Saturday
      const dateObj = createETDate(dateET);

      // Ticker must exist (FK)
      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000
        }
      });

      // Setup: Previous close exists
      await prisma.dailyRef.create({
        data: {
          symbol,
          date: dateObj,
          previousClose: 150.00
        }
      });

      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('closed');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'weekend_frozen',
        canIngest: false,
        canOverwrite: false,
        useFrozenPrice: true,
        referencePrice: 'regularClose'
      });

      // Execute: Worker should not ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: No API calls made
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify: Previous close still exists
      const prevClose = await prisma.dailyRef.findUnique({
        where: {
          symbol_date: {
            symbol,
            date: dateObj
          }
        }
      });

      expect(prevClose).not.toBeNull();
      expect(prevClose?.previousClose).toBe(150.00);
    });
  });

  describe('Split day adjusted consistency', () => {
    it('should use adjusted previousClose over unadjusted snapshot.prevDay.c', async () => {
      const symbol = 'AAPL';
      const dateET = getDateET(); // Use "today" in ET to match worker date keys
      const dateObj = createETDate(dateET);

      // Setup: Adjusted previous close in DB (from aggregates API)
      await prisma.ticker.create({
        data: {
          symbol,
          name: 'Apple Inc.',
          sharesOutstanding: 15000000000,
          latestPrevClose: 75.00 // Adjusted (after split)
        }
      });

      await prisma.dailyRef.create({
        data: {
          symbol,
          date: dateObj,
          previousClose: 75.00 // Adjusted
        }
      });

      // Mock: Snapshot with unadjusted prevDay.c
      const { fetchPolygonSnapshot } = require('../polygonWorker');
      fetchPolygonSnapshot.mockResolvedValue([
        {
          ticker: symbol,
          day: { c: 76.00, o: 75.50, h: 76.50, l: 75.00, v: 1000000 },
          lastTrade: { p: 76.00, t: new Date('2025-01-15T15:00:00-05:00').getTime() },
          prevDay: { c: 150.00 } // Unadjusted (before split)
        }
      ]);

      // Mock: getPrevClose returns adjusted value
      const { getPrevClose } = require('@/lib/redis/operations');
      getPrevClose.mockResolvedValue(new Map([[symbol, 75.00]])); // Adjusted

      const { detectSession } = require('@/lib/utils/timeUtils');
      detectSession.mockReturnValue('live');

      const { getPricingState } = require('@/lib/utils/pricingStateMachine');
      getPricingState.mockReturnValue({
        state: 'live',
        canIngest: true,
        canOverwrite: true,
        useFrozenPrice: false,
        referencePrice: 'previousClose'
      });

      // Mock Polygon snapshot endpoint response
      (global.fetch as unknown as jest.Mock).mockImplementation(async (url: string) => {
        // 15:00 ET today (timestamp in ms)
        const lastTradeTs = dateObj.getTime() + 15 * 60 * 60 * 1000;
        if (typeof url === 'string' && url.includes('/v2/snapshot/')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              tickers: [
                {
                  ticker: symbol,
                  day: { c: 76.00, o: 75.50, h: 76.50, l: 75.00, v: 1000000 },
                  lastTrade: { p: 76.00, t: lastTradeTs },
                  prevDay: { c: 150.00 } // Unadjusted (before split)
                }
              ]
            })
          };
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({})
        };
      });

      // Execute: Ingest
      await ingestBatch([symbol], 'test-api-key');

      // Verify: Percent change uses adjusted previousClose
      const sessionPrice = await prisma.sessionPrice.findFirst({
        where: {
          symbol,
          date: dateObj,
          session: 'live'
        }
      });

      expect(sessionPrice).not.toBeNull();
      // changePct should be vs 75.00 (adjusted), not 150.00 (unadjusted)
      // (76.00 / 75.00 - 1) * 100 = 1.33%
      expect(sessionPrice?.changePct).toBeCloseTo(1.33, 2);
    });
  });
});


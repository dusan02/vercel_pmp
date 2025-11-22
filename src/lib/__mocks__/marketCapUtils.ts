// Manual mock for @/lib/marketCapUtils
// Used in tests to avoid real API calls and ensure deterministic results

const shares = 1_000_000_000;

export const getSharesOutstanding = jest.fn(() => Promise.resolve(shares));

export const getPreviousClose = jest.fn((ticker: string) =>
  Promise.resolve(({ NVDA: 780, MCD: 315, AAPL: 195, MSFT: 395 } as Record<string, number>)[ticker] ?? 145));

export const getCurrentPrice = jest.fn((snap: unknown) => (snap as { lastTrade?: { p?: number } })?.lastTrade?.p ?? null);

export const computeMarketCap = jest.fn((p: number) => p * shares);
export const computePercentChange = jest.fn((c: number, pc: number) => ((c - pc) / pc) * 100);
export const computeMarketCapDiff = jest.fn((c: number, pc: number) => (c - pc) * shares);

// Additional utility functions that might be used
export const getMarketStatus = jest.fn().mockResolvedValue({
  market: 'open',
  serverTime: '2025-08-05T21:30:00Z'
});

export const validatePriceChange = jest.fn().mockImplementation(() => {
  // No-op for tests
});

export const logCalculationData = jest.fn().mockImplementation(() => {
  // No-op for tests
});

export const clearAllCaches = jest.fn().mockImplementation(() => {
  // No-op for tests
});

export const getCacheStatus = jest.fn().mockReturnValue({
  shareCounts: { size: 0, entries: [] },
  prevCloses: { size: 0, entries: [] }
}); 
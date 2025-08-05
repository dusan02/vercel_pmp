// src/lib/__mocks__/redis.ts
export const getCachedData = jest.fn().mockResolvedValue(null);
export const setCachedData = jest.fn().mockResolvedValue(undefined);
export const getCacheKey = jest.fn().mockImplementation((project: string, ticker: string, type: string) => 
  `test-cache-${project}-${ticker}-${type}`
);

// Helpers na easy prepísanie v testoch
export const __setCache = (v: unknown) => getCachedData.mockResolvedValue(v);
export const __resetCache = () => getCachedData.mockResolvedValue(null); 
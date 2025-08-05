// __mocks__/@/lib/marketCapUtils.ts
export const getCurrentPrice = jest.fn().mockResolvedValue(150.0);
export const getPreviousClose = jest.fn().mockResolvedValue(145.0);
export const getSharesOutstanding = jest.fn().mockResolvedValue(1000000000);
export const computeMarketCap = jest.fn().mockReturnValue(150000000000);
export const computeMarketCapDiff = jest.fn().mockReturnValue(5000000000);
export const computePercentChange = jest.fn().mockReturnValue(3.45); 
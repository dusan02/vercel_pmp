// Global test utilities type declarations
declare global {
  var testUtils: {
    createMockStockData: (ticker: string, overrides?: Record<string, unknown>) => Record<string, unknown>;
    createMockApiResponse: (data: unknown, success?: boolean) => unknown;
    wait: (ms: number) => Promise<void>;
  };

  namespace jest {
    interface Matchers<R> {
      toBeValidStockData(): R;
    }
  }
}

export { };
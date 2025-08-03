// Global test utilities type declarations
declare global {
  var testUtils: {
    createMockStockData: (ticker: string, overrides?: any) => any;
    createMockApiResponse: (data: any, success?: boolean) => any;
    wait: (ms: number) => Promise<void>;
  };

  namespace jest {
    interface Matchers<R> {
      toBeValidStockData(): R;
    }
  }
}

export {}; 
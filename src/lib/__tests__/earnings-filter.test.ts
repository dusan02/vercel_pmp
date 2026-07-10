import { DEFAULT_TICKERS } from '../earnings-filter';

// Mock earnings data for testing
const mockEarnings = [
  { ticker: 'AAPL', company_name: 'Apple Inc.', market_cap: 3000000000000 },
  { ticker: 'PLTR', company_name: 'Palantir Technologies', market_cap: 45000000000 },
  { ticker: 'MELI', company_name: 'MercadoLibre', market_cap: 85000000000 },
  { ticker: 'VRTX', company_name: 'Vertex Pharmaceuticals', market_cap: 120000000000 },
  { ticker: 'WMB', company_name: 'Williams Companies', market_cap: 45000000000 },
  { ticker: 'MUFG', company_name: 'Mitsubishi UFJ', market_cap: 120000000000 },
  { ticker: 'INVALID', company_name: 'Invalid Company', market_cap: 1000000000 },
  { ticker: 'UNKNOWN', company_name: 'Unknown Company', market_cap: 5000000000 }
];

// Filter function to test
const filterAllowedTickers = (earnings: Array<{ ticker: string; company_name: string; market_cap: number }>) => {
  const allowedTickers = DEFAULT_TICKERS.pmp;
  return earnings.filter(earning =>
    earning.market_cap > 0 &&
    allowedTickers.includes(earning.ticker)
  );
};

describe('Earnings Filter Tests', () => {
  it('filters out non-default tickers', () => {
    const filtered = filterAllowedTickers(mockEarnings);
    const tickers = filtered.map(e => e.ticker);

    // Should only include allowed tickers
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('PLTR');
    expect(tickers).toContain('MELI');
    expect(tickers).toContain('VRTX');
    expect(tickers).toContain('WMB');
    expect(tickers).toContain('MUFG');

    // Should NOT include invalid tickers
    expect(tickers).not.toContain('INVALID');
    expect(tickers).not.toContain('UNKNOWN');
  });

  it('filters out earnings with zero market cap', () => {
    const earningsWithZeroCap = [
      { ticker: 'AAPL', company_name: 'Apple Inc.', market_cap: 0 },
      { ticker: 'PLTR', company_name: 'Palantir Technologies', market_cap: 45000000000 },
      { ticker: 'MELI', company_name: 'MercadoLibre', market_cap: -1000 }
    ];

    const filtered = filterAllowedTickers(earningsWithZeroCap);
    const tickers = filtered.map(e => e.ticker);

    expect(tickers).toContain('PLTR');
    expect(tickers).not.toContain('AAPL'); // Zero market cap
    expect(tickers).not.toContain('MELI'); // Negative market cap
  });

  it('returns empty array for no valid earnings', () => {
    const invalidEarnings = [
      { ticker: 'INVALID1', company_name: 'Invalid 1', market_cap: 1000000 },
      { ticker: 'INVALID2', company_name: 'Invalid 2', market_cap: 0 }
    ];

    const filtered = filterAllowedTickers(invalidEarnings);
    expect(filtered).toEqual([]);
  });

  it('preserves all properties of filtered earnings', () => {
    const filtered = filterAllowedTickers(mockEarnings);
    const pltrEarning = filtered.find(e => e.ticker === 'PLTR');

    expect(pltrEarning).toBeDefined();
    expect(pltrEarning?.company_name).toBe('Palantir Technologies');
    expect(pltrEarning?.market_cap).toBe(45000000000);
  });
}); 
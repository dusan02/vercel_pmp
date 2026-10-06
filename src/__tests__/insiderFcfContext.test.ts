import { capexCycleContext, summarizeInsiderActivity } from '@/lib/utils/analysisMath';

describe('capexCycleContext', () => {
  it('returns null below 50% CapEx/OCF', () => {
    expect(capexCycleContext(100e9, 40e9)).toBeNull();
  });

  it('returns elevated at 50–75%', () => {
    const c = capexCycleContext(100e9, -60e9);
    expect(c?.tier).toBe('elevated');
    expect(c?.ratio).toBeCloseTo(0.6);
  });

  it('returns heavy at 75–100%', () => {
    const c = capexCycleContext(100e9, -80e9);
    expect(c?.tier).toBe('heavy');
    expect(c?.text).toContain('80%');
  });

  it('returns exceeds at ≥100%', () => {
    const c = capexCycleContext(50e9, -55e9);
    expect(c?.tier).toBe('exceeds');
    expect(c?.label).toBe('CapEx exceeds OCF');
  });

  it('returns null when OCF ≤ 0 or inputs missing', () => {
    expect(capexCycleContext(0, -10e9)).toBeNull();
    expect(capexCycleContext(-5e9, -10e9)).toBeNull();
    expect(capexCycleContext(100e9, null)).toBeNull();
    expect(capexCycleContext(null, -10e9)).toBeNull();
  });
});

describe('summarizeInsiderActivity', () => {
  const tx = (code: string, change: number, price?: number) => ({
    transactionCode: code, change, transactionPrice: price ?? null,
  });

  it('splits open-market P/S from compensation filings', () => {
    const s = summarizeInsiderActivity([
      tx('P', 1000, 100),      // $100K buy
      tx('S', -500, 100),      // $50K sell
      tx('A', 5000),           // grant — not a signal
      tx('F', -2000),          // tax withholding — not a sell
      tx('M', 3000),           // option exercise
    ]);
    expect(s.buyCount).toBe(1);
    expect(s.sellCount).toBe(1);
    expect(s.otherCount).toBe(3);
    expect(s.buyValue).toBe(100000);
    expect(s.sellValue).toBe(50000);
    expect(s.signal).toBe('buy'); // net +$50K
  });

  it('net selling signal when sells exceed buys', () => {
    const s = summarizeInsiderActivity([tx('S', -10000, 50), tx('P', 100, 50)]);
    expect(s.signal).toBe('sell');
  });

  it('falls back to share counts when prices are missing', () => {
    const s = summarizeInsiderActivity([tx('P', 5000), tx('S', -1000)]);
    expect(s.signal).toBe('buy'); // net +4000 shares, no prices
  });

  it('no signal with only compensation filings', () => {
    const s = summarizeInsiderActivity([tx('A', 10000), tx('F', -4000), tx('G', -1000)]);
    expect(s.signal).toBe('none');
    expect(s.otherCount).toBe(3);
  });

  it('empty input → no signal, zero counts', () => {
    const s = summarizeInsiderActivity([]);
    expect(s.signal).toBe('none');
    expect(s.buyCount).toBe(0);
  });
});

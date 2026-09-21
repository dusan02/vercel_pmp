import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { applyRealtimeOverlay } from '@/workers/polygon/tradingviewOverlay';
import type { PolygonSnapshot } from '@/workers/polygon/shared';

const scanResponse = (rows: [string, number | null, number?][]) => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: rows.map(([name, price, barTimeSec]) => ({
      s: `NASDAQ:${name}`,
      // Column order matches COLUMNS: [name, price, volume, sessionTs]
      d: barTimeSec === undefined ? [name, price, 1000] : [name, price, 1000, barTimeSec],
    })),
  }),
});

const NOW_SEC = () => Math.floor(Date.now() / 1000);
const YESTERDAY_SEC = () => Math.floor((Date.now() - 86400_000) / 1000);

const polygonSnap = (ticker: string, minC: number): PolygonSnapshot => ({
  ticker,
  day: { c: 0, t: Date.now() - 20 * 60 * 1000 },
  min: { c: minC, t: Date.now() - 15 * 60 * 1000 },
  prevDay: { c: 100 },
});

describe('applyRealtimeOverlay stale-bar guard', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('live: skips TV quote equal to prevClose (stale daily bar right after open)', async () => {
    global.fetch = jest.fn(async () => scanResponse([['AAPL', 100]])) as any;

    const snap = polygonSnap('AAPL', 101.5);
    const snapshots = [snap];
    const applied = await applyRealtimeOverlay(
      snapshots,
      ['AAPL'],
      'live',
      new Map([['AAPL', 100]])
    );

    expect(applied).toBe(0);
    expect(snap.lastTrade).toBeUndefined();
    expect(snap.min?.c).toBe(101.5); // Polygon delayed min bar untouched
  });

  it('live: applies TV quote when it differs from prevClose', async () => {
    global.fetch = jest.fn(async () => scanResponse([['AAPL', 102.4]])) as any;

    const snap = polygonSnap('AAPL', 101.5);
    const applied = await applyRealtimeOverlay(
      [snap],
      ['AAPL'],
      'live',
      new Map([['AAPL', 100]])
    );

    expect(applied).toBe(1);
    expect(snap.lastTrade?.p).toBe(102.4);
    expect(snap.min?.c).toBe(102.4);
  });

  it('live: applies TV quote when prevClose is unknown', async () => {
    global.fetch = jest.fn(async () => scanResponse([['AAPL', 100]])) as any;

    const snap = polygonSnap('AAPL', 101.5);
    const applied = await applyRealtimeOverlay([snap], ['AAPL'], 'live', new Map());

    expect(applied).toBe(1);
    expect(snap.lastTrade?.p).toBe(100);
  });

  it('after: skips postmarket quote equal to prevClose (stale postmarket bar)', async () => {
    global.fetch = jest.fn(async () => scanResponse([['NVDA', 100]])) as any;

    const snap = polygonSnap('NVDA', 99.9);
    const applied = await applyRealtimeOverlay(
      [snap],
      ['NVDA'],
      'after',
      new Map([['NVDA', 100]])
    );

    expect(applied).toBe(0);
    expect(snap.lastTrade).toBeUndefined();
  });

  it('pre: applies real premarket quote even when far from prevClose', async () => {
    global.fetch = jest.fn(async () => scanResponse([['TSLA', 105.2]])) as any;

    const snap = polygonSnap('TSLA', 99.5);
    const applied = await applyRealtimeOverlay(
      [snap],
      ['TSLA'],
      'pre',
      new Map([['TSLA', 100]])
    );

    expect(applied).toBe(1);
    expect(snap.lastTrade?.p).toBe(105.2);
  });

  it('live: skips ex-div adjusted stale close (price≠prevClose, bar from yesterday)', async () => {
    // META 2026-09-21: ex-dividend day — TV served adjusted prev close
    // 665.225 (raw close 665.75 − $0.525 div) as "live" price. The 0.08%
    // delta defeats the prevClose equality guard; only the bar timestamp
    // reveals the quote is stale.
    global.fetch = jest.fn(async () => scanResponse([['META', 665.225, YESTERDAY_SEC()]])) as any;

    const snap = polygonSnap('META', 680.68); // Polygon delayed min = real premarket
    const applied = await applyRealtimeOverlay(
      [snap],
      ['META'],
      'live',
      new Map([['META', 665.75]])
    );

    expect(applied).toBe(0);
    expect(snap.lastTrade).toBeUndefined();
    expect(snap.min?.c).toBe(680.68);
  });

  it('live: applies quote equal to prevClose when bar timestamp is today', async () => {
    // Legit flat open: price == prevClose AND bar is today's → real quote.
    global.fetch = jest.fn(async () => scanResponse([['AAPL', 100, NOW_SEC()]])) as any;

    const snap = polygonSnap('AAPL', 101.5);
    const applied = await applyRealtimeOverlay(
      [snap],
      ['AAPL'],
      'live',
      new Map([['AAPL', 100]])
    );

    expect(applied).toBe(1);
    expect(snap.lastTrade?.p).toBe(100);
  });

  it('after: skips stale postmarket_close via postmarket_time', async () => {
    global.fetch = jest.fn(async () => scanResponse([['NVDA', 99.4, YESTERDAY_SEC()]])) as any;

    const snap = polygonSnap('NVDA', 99.9);
    const applied = await applyRealtimeOverlay(
      [snap],
      ['NVDA'],
      'after',
      new Map([['NVDA', 100]])
    );

    expect(applied).toBe(0);
    expect(snap.lastTrade).toBeUndefined();
  });
});

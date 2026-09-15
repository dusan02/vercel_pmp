/**
 * Yahoo Finance real-time overlay.
 *
 * The Polygon Starter plan serves ~15-minute delayed snapshots and omits
 * lastTrade/lastQuote entirely. Yahoo's v8 chart endpoint (no auth needed,
 * tolerant of batch polling) returns real-time 1m bars including pre/post
 * market. During active sessions we merge the freshest Yahoo bar into the
 * fetched Polygon snapshots so the existing normalize→upsert pipeline picks
 * the fresher price. All timestamp validation still applies — data that
 * fails validation is ignored and the pipeline degrades to Polygon-only.
 *
 * Opt-out: YAHOO_OVERLAY=0
 */

import { nsToMs } from '@/lib/utils/dateET';
import type { PolygonSnapshot } from './shared';
import { processBatchWithConcurrency } from '@/lib/batchProcessor';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const COOLDOWN_MS = 5 * 60 * 1000;
const CONCURRENCY = 10;
const MAX_CONSECUTIVE_FAILURES = 5;

let cooldownUntil = 0;
let consecutiveFailures = 0;

interface YahooBar {
  price: number;
  tsMs: number;
  volume?: number;
}

async function fetchYahooBar(symbol: string): Promise<YahooBar | 'rate_limited' | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
    );
    if (res.status === 429) return 'rate_limited';
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    const volumes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.volume;
    if (!ts || !closes) return null;

    for (let i = ts.length - 1; i >= 0; i--) {
      const c = closes[i];
      const t = ts[i];
      if (c != null && c > 0 && t != null && t > 0) {
        const v = volumes?.[i];
        return { price: c, tsMs: t * 1000, ...(v != null && v > 0 ? { volume: v } : {}) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch Yahoo real-time bars and merge them into the Polygon snapshots
 * (mutates `snapshots` in place). Returns the number of tickers overlaid.
 */
export async function applyYahooOverlay(
  snapshots: PolygonSnapshot[],
  tickers: string[],
  session: 'pre' | 'live' | 'after',
  prevCloseMap: Map<string, number>
): Promise<number> {
  if (process.env.YAHOO_OVERLAY === '0') return 0;
  if (Date.now() < cooldownUntil) return 0;

  const quotes = new Map<string, YahooBar>();
  let sawRateLimit = false;

  await processBatchWithConcurrency(
    tickers,
    async (symbol) => {
      if (sawRateLimit) return;
      const bar = await fetchYahooBar(symbol);
      if (bar === 'rate_limited') {
        sawRateLimit = true;
        return;
      }
      if (bar) quotes.set(symbol, bar);
    },
    CONCURRENCY
  );

  if (sawRateLimit) {
    consecutiveFailures++;
    cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(`⚠️ Yahoo overlay: rate limited (429), cooling down ${COOLDOWN_MS / 60000}min (${quotes.size} partial)`);
    if (quotes.size === 0) return 0;
  }

  if (quotes.size === 0) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      console.warn(`⚠️ Yahoo overlay: ${consecutiveFailures} empty fetches, cooling down ${COOLDOWN_MS / 60000}min`);
    }
    return 0;
  }
  consecutiveFailures = 0;

  const byTicker = new Map(snapshots.map(s => [s.ticker, s]));
  let applied = 0;

  for (const [symbol, q] of quotes) {
    const existing = byTicker.get(symbol);
    if (existing) {
      const existingMinTs = existing.min?.t ? nsToMs(existing.min.t) : 0;
      const existingTradeTs = existing.lastTrade?.t ? nsToMs(existing.lastTrade.t) : 0;
      if (q.tsMs <= Math.max(existingMinTs, existingTradeTs)) continue;
      existing.min = {
        ...(existing.min ?? { av: q.price }),
        c: q.price,
        t: q.tsMs,
        ...(q.volume ? { v: q.volume } : {}),
      };
      existing.lastTrade = { p: q.price, t: q.tsMs };
      applied++;
    } else {
      const prevClose = prevCloseMap.get(symbol);
      const synthetic: PolygonSnapshot = {
        ticker: symbol,
        min: { av: q.price, t: q.tsMs, c: q.price, ...(q.volume ? { v: q.volume } : {}) },
        lastTrade: { p: q.price, t: q.tsMs },
        ...(prevClose ? { prevDay: { c: prevClose } } : {}),
      };
      snapshots.push(synthetic);
      byTicker.set(symbol, synthetic);
      applied++;
    }
  }

  return applied;
}

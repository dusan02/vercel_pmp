/**
 * Real-time price overlay via TradingView scanner API.
 *
 * The Polygon Starter plan serves ~15-minute delayed snapshots and omits
 * lastTrade/lastQuote entirely. TradingView's public scanner endpoint
 * returns real-time session prices (premarket_close / close /
 * postmarket_close) for a batch of symbols in one POST, no auth needed.
 *
 * During active sessions we merge TV prices into the fetched Polygon
 * snapshots (as min/lastTrade with ts=now) so the existing
 * normalize→upsert pipeline picks the fresher price. All timestamp
 * validation still applies; failures degrade to Polygon-only behavior.
 *
 * Caveat: the free scanner feed is ~15min delayed for DAILY bar fields.
 * Right after a session opens (live: ~9:30-9:45 ET, after: ~16:00-16:15),
 * `close`/`postmarket_close` still returns the PREVIOUS session's close
 * because today's bar doesn't exist yet. Overlaying that stamps prevClose
 * as the "live" price and produces fake 0% moves, so we skip quotes that
 * match prevClose and let Polygon's delayed minute bar through instead.
 *
 * Opt-out: TV_OVERLAY=0
 */

import { nsToMs } from '@/lib/utils/dateET';
import type { PolygonSnapshot } from './shared';

type OverlaySession = 'pre' | 'live' | 'after';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SCAN_URL = 'https://scanner.tradingview.com/america/scan';
const COOLDOWN_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;
const MAX_CONSECUTIVE_FAILURES = 5;

const COLUMNS: Record<OverlaySession, { price: string; volume: string }> = {
  pre: { price: 'premarket_close', volume: 'premarket_volume' },
  live: { price: 'close', volume: 'volume' },
  after: { price: 'postmarket_close', volume: 'postmarket_volume' },
};

let cooldownUntil = 0;
let consecutiveFailures = 0;

async function fetchScanBatch(
  symbols: string[],
  session: OverlaySession,
  out: Map<string, { price: number; volume?: number }>
): Promise<'ok' | 'rate_limited' | 'error'> {
  const { price, volume } = COLUMNS[session];
  const body = {
    columns: ['name', price, volume],
    markets: ['america'],
    filter: [{ left: 'name', operation: 'in_range', right: symbols }],
  };

  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) return 'rate_limited';
    if (!res.ok) return 'error';

    const data = await res.json();
    const rows: { s: string; d: (number | string | null)[] }[] = data?.data ?? [];
    for (const row of rows) {
      const name = row?.d?.[0];
      const priceVal = row?.d?.[1];
      const volVal = row?.d?.[2];
      if (
        typeof name === 'string' &&
        typeof priceVal === 'number' &&
        priceVal > 0
      ) {
        out.set(name, {
          price: priceVal,
          ...(typeof volVal === 'number' && volVal > 0 ? { volume: volVal } : {}),
        });
      }
    }
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Fetch TradingView real-time prices and merge them into the Polygon
 * snapshots (mutates `snapshots` in place). Returns overlaid count.
 */
export async function applyRealtimeOverlay(
  snapshots: PolygonSnapshot[],
  tickers: string[],
  session: OverlaySession,
  prevCloseMap: Map<string, number>
): Promise<number> {
  if (process.env.TV_OVERLAY === '0' || process.env.YAHOO_OVERLAY === '0') return 0;
  if (Date.now() < cooldownUntil) return 0;

  const quotes = new Map<string, { price: number; volume?: number }>();
  let sawRateLimit = false;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const status = await fetchScanBatch(batch, session, quotes);
    if (status === 'rate_limited') {
      sawRateLimit = true;
      break;
    }
    if (status === 'error') {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        console.warn(`⚠️ TV overlay: ${consecutiveFailures} consecutive failures, cooling down ${COOLDOWN_MS / 60000}min`);
        return 0;
      }
    }
  }

  if (sawRateLimit) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(`⚠️ TV overlay: rate limited (429), cooling down ${COOLDOWN_MS / 60000}min`);
    if (quotes.size === 0) return 0;
  }

  if (quotes.size === 0) return 0;
  consecutiveFailures = 0;

  const nowMs = Date.now();
  const byTicker = new Map(snapshots.map(s => [s.ticker, s]));
  let applied = 0;

  for (const [symbol, q] of quotes) {
    // Stale-bar guard: TV's session field still shows the previous close
    // until the new bar appears (~15min into the session for the free feed).
    // A quote identical to prevClose is indistinguishable from that stale
    // state — skip it so Polygon's delayed min.c provides the real price.
    const prevClose = prevCloseMap.get(symbol);
    if (prevClose && Math.abs(q.price - prevClose) / prevClose < 0.0001) continue;

    const existing = byTicker.get(symbol);
    if (existing) {
      const existingMinTs = existing.min?.t ? nsToMs(existing.min.t) : 0;
      const existingTradeTs = existing.lastTrade?.t ? nsToMs(existing.lastTrade.t) : 0;
      if (nowMs <= Math.max(existingMinTs, existingTradeTs)) continue;
      existing.min = {
        ...(existing.min ?? { av: q.price }),
        c: q.price,
        t: nowMs,
        ...(q.volume ? { v: q.volume } : {}),
      };
      existing.lastTrade = { p: q.price, t: nowMs };
      applied++;
    } else {
      const prevClose = prevCloseMap.get(symbol);
      const synthetic: PolygonSnapshot = {
        ticker: symbol,
        min: { av: q.price, t: nowMs, c: q.price, ...(q.volume ? { v: q.volume } : {}) },
        lastTrade: { p: q.price, t: nowMs },
        ...(prevClose ? { prevDay: { c: prevClose } } : {}),
      };
      snapshots.push(synthetic);
      byTicker.set(symbol, synthetic);
      applied++;
    }
  }

  return applied;
}

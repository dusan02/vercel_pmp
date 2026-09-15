/**
 * Yahoo Finance real-time overlay.
 *
 * The Polygon Starter plan serves ~15-minute delayed snapshots and omits
 * lastTrade/lastQuote entirely. Yahoo's unofficial quote endpoint returns
 * real-time session prices (preMarketPrice / regularMarketPrice /
 * postMarketPrice). During active sessions we merge Yahoo quotes into the
 * fetched Polygon snapshots so the existing normalize→upsert pipeline picks
 * the fresher price. Existing timestamp validation (same ET day, in-session,
 * staleness guard) still applies — Yahoo data that fails validation is simply
 * ignored and the pipeline degrades to Polygon-only behavior.
 *
 * Opt-out: YAHOO_OVERLAY=0
 */

import { nsToMs } from '@/lib/utils/dateET';
import type { PolygonSnapshot } from './shared';

type OverlaySession = 'pre' | 'live' | 'after';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const AUTH_TTL_MS = 30 * 60 * 1000;
const COOLDOWN_MS = 10 * 60 * 1000;
const BATCH_SIZE = 80;
const MAX_CONSECUTIVE_FAILURES = 3;

const FIELDS: Record<OverlaySession, { price: string; time: string }> = {
  pre: { price: 'preMarketPrice', time: 'preMarketTime' },
  live: { price: 'regularMarketPrice', time: 'regularMarketTime' },
  after: { price: 'postMarketPrice', time: 'postMarketTime' },
};

interface YahooAuth {
  cookie: string;
  crumb: string;
  ts: number;
}

let auth: YahooAuth | null = null;
let cooldownUntil = 0;
let consecutiveFailures = 0;

async function getAuth(forceRefresh = false): Promise<YahooAuth | null> {
  if (!forceRefresh && auth && Date.now() - auth.ts < AUTH_TTL_MS) return auth;
  try {
    // fc.yahoo.com sets the A1/A3 cookies needed for the crumb
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    const setCookies = cookieRes.headers.getSetCookie();
    const cookie = setCookies
      .map(c => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
    if (!cookie) return null;

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith('{') || crumb.startsWith('<')) return null;

    auth = { cookie, crumb, ts: Date.now() };
    return auth;
  } catch {
    return null;
  }
}

async function fetchQuoteBatch(
  symbols: string[],
  priceField: string,
  timeField: string,
  out: Map<string, { price: number; tsMs: number }>
): Promise<'ok' | 'rate_limited' | 'error'> {
  const doFetch = async (a: YahooAuth) =>
    fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&crumb=${encodeURIComponent(a.crumb)}`,
      {
        headers: { 'User-Agent': UA, Cookie: a.cookie },
        signal: AbortSignal.timeout(10000),
      }
    );

  let a = await getAuth();
  if (!a) return 'error';

  try {
    let res = await doFetch(a);
    if (res.status === 401 || res.status === 403) {
      const a2 = await getAuth(true);
      if (!a2) return 'error';
      res = await doFetch(a2);
    }
    if (res.status === 429) return 'rate_limited';
    if (!res.ok) return 'error';

    const data = await res.json();
    const rows: any[] = data?.quoteResponse?.result ?? [];
    for (const q of rows) {
      const price = q?.[priceField];
      const t = q?.[timeField];
      if (q?.symbol && typeof price === 'number' && price > 0 && typeof t === 'number' && t > 0) {
        out.set(q.symbol, { price, tsMs: t * 1000 });
      }
    }
    return 'ok';
  } catch {
    return 'error';
  }
}

/**
 * Fetch Yahoo real-time quotes and merge them into the Polygon snapshots
 * (mutates `snapshots` in place). Returns the number of tickers overlaid.
 */
export async function applyYahooOverlay(
  snapshots: PolygonSnapshot[],
  tickers: string[],
  session: OverlaySession,
  prevCloseMap: Map<string, number>
): Promise<number> {
  if (process.env.YAHOO_OVERLAY === '0') return 0;
  if (Date.now() < cooldownUntil) return 0;

  const { price: priceField, time: timeField } = FIELDS[session];
  const quotes = new Map<string, { price: number; tsMs: number }>();

  let sawRateLimit = false;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const status = await fetchQuoteBatch(batch, priceField, timeField, quotes);
    if (status === 'rate_limited') {
      sawRateLimit = true;
      break;
    }
    if (status === 'error') {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        console.warn(`⚠️ Yahoo overlay: ${consecutiveFailures} consecutive failures, cooling down ${COOLDOWN_MS / 60000}min`);
        return 0;
      }
    }
  }

  if (sawRateLimit) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(`⚠️ Yahoo overlay: rate limited (429), cooling down ${COOLDOWN_MS / 60000}min`);
    return 0;
  }

  if (quotes.size === 0) return 0;
  consecutiveFailures = 0;

  const byTicker = new Map(snapshots.map(s => [s.ticker, s]));
  let applied = 0;

  for (const [symbol, q] of quotes) {
    const existing = byTicker.get(symbol);
    if (existing) {
      const existingMinTs = existing.min?.t ? nsToMs(existing.min.t) : 0;
      const existingTradeTs = existing.lastTrade?.t ? nsToMs(existing.lastTrade.t) : 0;
      if (q.tsMs <= Math.max(existingMinTs, existingTradeTs)) continue;
      existing.min = { ...(existing.min ?? { av: q.price }), c: q.price, t: q.tsMs };
      existing.lastTrade = { p: q.price, t: q.tsMs };
      applied++;
    } else {
      const prevClose = prevCloseMap.get(symbol);
      const synthetic: PolygonSnapshot = {
        ticker: symbol,
        min: { av: q.price, t: q.tsMs, c: q.price },
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

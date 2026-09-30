import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Real index values for the header strip (S&P 500, NASDAQ Composite, DOW).
 *
 * Quotes come from the TradingView scanner — one POST returns real-time
 * index levels matching Finviz exactly (Polygon indices are not in our
 * tier and its ETF proxies (SPY/QQQ) show different nominal values).
 * Intraday sparkline bars come from Yahoo v8 chart (same source the DJIA
 * route already used). Either leg may fail independently; a missing index
 * is simply omitted and the client falls back to the ETF strip.
 */

// Yahoo rate-limits specific browser UA fingerprints (the Chrome UA used for
// TradingView is already burned — returns 429 while a plain UA passes), so
// the two legs keep separate agents. The Windows UA matches the proven
// /api/indices/djia route.
const TV_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const INDEX_DEFS = [
  { key: 'SPX', tv: 'SP:SPX', yahoo: '%5EGSPC' },
  { key: 'IXIC', tv: 'NASDAQ:IXIC', yahoo: '%5EIXIC' },
  { key: 'DJI', tv: 'DJ:DJI', yahoo: '%5EDJI' },
] as const;

type TvQuote = { price: number; pct: number; abs: number };
type YahooChart = { intraday: { ts: string; price: number }[]; regularMarketPrice: number | null; previousClose: number | null };

async function fetchTvQuotes(): Promise<Map<string, TvQuote>> {
  const res = await fetch('https://scanner.tradingview.com/america/scan', {
    method: 'POST',
    headers: { 'User-Agent': TV_UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: INDEX_DEFS.map(i => i.tv), query: { types: [] } },
      columns: ['name', 'close', 'change', 'change_abs'],
    }),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`TradingView scan HTTP ${res.status}`);

  const json = await res.json();
  const byTvSymbol = new Map<string, TvQuote>();
  for (const row of json?.data ?? []) {
    const d: (string | number | null)[] = row?.d ?? [];
    const price = d[1], pct = d[2], abs = d[3];
    if (typeof price === 'number' && price > 0) {
      byTvSymbol.set(String(row.s), {
        price,
        pct: typeof pct === 'number' ? pct : 0,
        abs: typeof abs === 'number' ? abs : 0,
      });
    }
  }
  return byTvSymbol;
}

async function fetchYahooChart(symbol: string): Promise<YahooChart | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta ?? {};
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const intraday: { ts: string; price: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c != null) intraday.push({ ts: new Date(timestamps[i]! * 1000).toISOString(), price: c });
    }
    return {
      intraday,
      regularMarketPrice: typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null,
      previousClose: typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number' ? meta.previousClose : null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [tvMap, ...yahooCharts] = await Promise.all([
      fetchTvQuotes().catch(() => null),
      ...INDEX_DEFS.map(i => fetchYahooChart(i.yahoo)),
    ]);

    const out: Record<string, unknown> = {};
    INDEX_DEFS.forEach((def, i) => {
      const tv = tvMap?.get(def.tv) ?? null;
      const yh = yahooCharts[i];
      const price = tv?.price ?? yh?.regularMarketPrice ?? null;
      if (price == null || price <= 0) return;

      const dollarChange = tv?.abs ?? (yh?.previousClose ? price - yh.previousClose : 0);
      const previousClose = yh?.previousClose ?? (price - dollarChange);
      const percentChange = tv?.pct ?? (previousClose > 0 ? (price / previousClose - 1) * 100 : 0);

      out[def.key] = {
        price,
        previousClose,
        dollarChange,
        percentChange,
        intraday: yh?.intraday ?? [],
      };
    });

    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: 'No index data' }, { status: 502 });
    }

    return NextResponse.json(out, {
      status: 200,
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('Error fetching market indices:', error);
    return NextResponse.json({ error: 'Failed to fetch index data' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { detectSession } from '@/lib/utils/timeUtils';
import { createETDate, getDateET, isInSessionET } from '@/lib/utils/dateET';

export const dynamic = 'force-dynamic';

/**
 * Real index values for the header strip (S&P 500, NASDAQ Composite, DOW).
 *
 * Quotes come from TradingView scanner — one POST returns real-time cash
 * index levels + ETF proxy movements (AMEX:SPY, NASDAQ:QQQ, AMEX:DIA).
 *
 * Market Sessions:
 * - 'pre' (04:00 - 09:30 ET): Cash indices do not trade; ETF proxies trade actively.
 *   We compute implied index levels from ETF premarket % change and fetch today's
 *   pre-market 5m sparkline bars starting at 04:00 AM ET.
 * - 'live' (09:30 - 16:00 ET): Cash indices trade in real-time; sparklines show today's
 *   regular market session bars.
 * - 'after' (16:00 - 20:00 ET): Cash indices pinned at official close; AH drift from ETF.
 * - 'closed' (overnight / weekends): Official close + full previous regular session chart.
 */

// Yahoo rate-limits specific browser UA fingerprints, so TradingView and Yahoo
// keep separate agents.
const TV_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const INDEX_DEFS = [
  { key: 'SPX', tv: 'SP:SPX', etfTv: 'AMEX:SPY', yahoo: '%5EGSPC', etfYahoo: 'SPY' },
  { key: 'IXIC', tv: 'NASDAQ:IXIC', etfTv: 'NASDAQ:QQQ', yahoo: '%5EIXIC', etfYahoo: 'QQQ' },
  { key: 'DJI', tv: 'DJ:DJI', etfTv: 'AMEX:DIA', yahoo: '%5EDJI', etfYahoo: 'DIA' },
] as const;

type TvRow = {
  close: number | null;
  change: number | null;
  changeAbs: number | null;
  preClose: number | null;
  preChange: number | null;
  preChangeAbs: number | null;
  postClose: number | null;
  postChange: number | null;
  postChangeAbs: number | null;
};

type YahooChart = {
  intraday: { ts: string; price: number }[];
  regularMarketPrice: number | null;
  previousClose: number | null;
};

async function fetchTvQuotes(): Promise<Map<string, TvRow>> {
  const allSymbols = INDEX_DEFS.flatMap(i => [i.tv, i.etfTv]);
  const res = await fetch('https://scanner.tradingview.com/america/scan', {
    method: 'POST',
    headers: { 'User-Agent': TV_UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols: { tickers: allSymbols, query: { types: [] } },
      columns: [
        'name',
        'close',
        'change',
        'change_abs',
        'premarket_close',
        'premarket_change',
        'premarket_change_abs',
        'postmarket_close',
        'postmarket_change',
        'postmarket_change_abs',
      ],
    }),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`TradingView scan HTTP ${res.status}`);

  const json = await res.json();
  const byTvSymbol = new Map<string, TvRow>();
  for (const row of json?.data ?? []) {
    const d: (string | number | null)[] = row?.d ?? [];
    byTvSymbol.set(String(row.s), {
      close: typeof d[1] === 'number' ? d[1] : null,
      change: typeof d[2] === 'number' ? d[2] : null,
      changeAbs: typeof d[3] === 'number' ? d[3] : null,
      preClose: typeof d[4] === 'number' ? d[4] : null,
      preChange: typeof d[5] === 'number' ? d[5] : null,
      preChangeAbs: typeof d[6] === 'number' ? d[6] : null,
      postClose: typeof d[7] === 'number' ? d[7] : null,
      postChange: typeof d[8] === 'number' ? d[8] : null,
      postChangeAbs: typeof d[9] === 'number' ? d[9] : null,
    });
  }
  return byTvSymbol;
}

async function fetchYahooChart(symbol: string, includePrePost: boolean = false): Promise<YahooChart | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=5m&range=1d${includePrePost ? '&includePrePost=true' : ''}`;
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
    const now = new Date();
    const session = detectSession(now);
    const isPre = session === 'pre';

    // In pre-market, cash indices have zero trades today, so we fetch ETF proxies
    // (SPY, QQQ, DIA) with pre-post bars. In regular/closed sessions, fetch cash indices.
    const yahooSymbols = INDEX_DEFS.map(i => (isPre ? i.etfYahoo : i.yahoo));

    const [tvMap, ...yahooCharts] = await Promise.all([
      fetchTvQuotes().catch(() => null),
      ...yahooSymbols.map(sym => fetchYahooChart(sym, isPre)),
    ]);

    const out: Record<string, unknown> = {};

    INDEX_DEFS.forEach((def, i) => {
      const tvIdx = tvMap?.get(def.tv);
      const tvEtf = tvMap?.get(def.etfTv);
      const yh = yahooCharts[i];

      const idxClose = tvIdx?.close ?? yh?.regularMarketPrice ?? null;
      if (idxClose == null || idxClose <= 0) return;

      const idxPrevClose = yh?.previousClose ?? (tvIdx?.changeAbs != null ? idxClose - tvIdx.changeAbs : idxClose);

      if (isPre) {
        // Pre-market implied index movement derived from ETF
        const etfClose = tvEtf?.close ?? yh?.previousClose ?? 0;
        const prePct = typeof tvEtf?.preChange === 'number'
          ? tvEtf.preChange
          : (tvEtf?.preClose && etfClose > 0 ? (tvEtf.preClose / etfClose - 1) * 100 : 0);

        const price = Number((idxClose * (1 + prePct / 100)).toFixed(2));
        const dollarChange = Number((price - idxClose).toFixed(2));
        const percentChange = Number(prePct.toFixed(2));

        // Filter ETF bars to today's pre-market session (>= 04:00 AM ET)
        const rawBars = yh?.intraday.filter(b => isInSessionET(new Date(b.ts).getTime(), 'pre', now)) ?? [];

        // Convert ETF bar prices to implied index prices
        const intraday: { ts: string; price: number }[] = rawBars.map(b => ({
          ts: b.ts,
          price: etfClose > 0 ? Number(((b.price / etfClose) * idxClose).toFixed(2)) : b.price,
        }));

        // Anchor at 04:00 AM ET if first bar is later
        const todayIso = getDateET(now);
        const midnightET = createETDate(todayIso);
        const premarketStartIso = new Date(midnightET.getTime() + 4 * 3600 * 1000).toISOString();

        if (intraday.length === 0 || intraday[0]!.ts > premarketStartIso) {
          intraday.unshift({ ts: premarketStartIso, price: idxClose });
        }

        // Connect the sparkline tip to the latest live price
        const nowIso = now.toISOString();
        if (intraday.length > 0 && intraday[intraday.length - 1]!.ts < nowIso) {
          intraday.push({ ts: nowIso, price });
        }

        out[def.key] = {
          price,
          previousClose: idxClose,
          dollarChange,
          percentChange,
          session: 'pre',
          pre: {
            price,
            pct: percentChange,
            dollarChange,
          },
          regular: {
            price: idxClose,
            dollarChange: tvIdx?.changeAbs ?? 0,
            percentChange: tvIdx?.change ?? 0,
          },
          intraday,
        };
      } else if (session === 'after') {
        const ahPct = typeof tvEtf?.postChange === 'number' ? tvEtf.postChange : null;
        const ahPrice = ahPct != null ? Number((idxClose * (1 + ahPct / 100)).toFixed(2)) : null;

        out[def.key] = {
          price: idxClose,
          previousClose: idxPrevClose,
          dollarChange: tvIdx?.changeAbs ?? (idxClose - idxPrevClose),
          percentChange: tvIdx?.change ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0),
          session: 'after',
          ah: ahPct != null ? { price: ahPrice!, pct: Number(ahPct.toFixed(2)) } : null,
          intraday: yh?.intraday ?? [],
        };
      } else {
        // 'live' or 'closed'
        const dollarChange = tvIdx?.changeAbs ?? (idxClose - idxPrevClose);
        const percentChange = tvIdx?.change ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0);

        out[def.key] = {
          price: idxClose,
          previousClose: idxPrevClose,
          dollarChange: Number(dollarChange.toFixed(2)),
          percentChange: Number(percentChange.toFixed(2)),
          session,
          intraday: yh?.intraday ?? [],
        };
      }
    });

    if (Object.keys(out).length === 0) {
      return NextResponse.json({ error: 'No index data' }, { status: 502 });
    }

    const cacheTtl = isPre || session === 'live' ? 30 : 300;
    return NextResponse.json(out, {
      status: 200,
      headers: { 'Cache-Control': `s-maxage=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}` },
    });
  } catch (error) {
    console.error('Error fetching market indices:', error);
    return NextResponse.json({ error: 'Failed to fetch index data' }, { status: 500 });
  }
}

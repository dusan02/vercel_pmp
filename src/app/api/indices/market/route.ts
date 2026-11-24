import { NextResponse } from 'next/server';
import { detectSession } from '@/lib/utils/timeUtils';
import { createETDate, getDateET, isInSessionET, isSameETDay } from '@/lib/utils/dateET';

export const dynamic = 'force-dynamic';

/**
 * Real index values for the header strip (S&P 500, NASDAQ Composite, DOW).
 *
 * Quotes come from CNBC (0-delay extended-hours & live) with TradingView scanner
 * and Yahoo Finance as fallbacks. Every session-specific TradingView field is
 * validated against its bar timestamp (`premarket_time`, `time`, `postmarket_time`)
 * because TV's free scanner lags ~15min after session open and otherwise returns
 * yesterday's move as today's.
 *
 * Market Sessions:
 * - 'pre' (04:00 - 09:30 ET): Cash indices do not trade; ETF proxies trade actively.
 *   We compute implied index levels from ETF premarket % change (CNBC PRE_MKT →
 *   today-verified TV premarket → today's Yahoo 5m premarket bars → 0%) and fetch
 *   today's pre-market 5m sparkline bars starting at 04:00 AM ET.
 * - 'live' (09:30 - 16:00 ET): Cash indices trade in real-time; sparklines show today's
 *   regular market session bars.
 * - 'after' (16:00 - 20:00 ET): Cash indices pinned at official close; AH drift from ETF.
 * - 'closed' (overnight / weekends): Official close + full previous regular session chart.
 */

// Yahoo rate-limits specific browser UA fingerprints, so TradingView/CNBC and Yahoo
// keep separate agents.
const TV_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const INDEX_DEFS = [
  { key: 'SPX', tv: 'SP:SPX', etfTv: 'AMEX:SPY', cnbc: '.SPX', etfCnbc: 'SPY', yahoo: '%5EGSPC', etfYahoo: 'SPY' },
  { key: 'IXIC', tv: 'NASDAQ:IXIC', etfTv: 'NASDAQ:QQQ', cnbc: '.IXIC', etfCnbc: 'QQQ', yahoo: '%5EIXIC', etfYahoo: 'QQQ' },
  { key: 'DJI', tv: 'DJ:DJI', etfTv: 'AMEX:DIA', cnbc: '.DJI', etfCnbc: 'DIA', yahoo: '%5EDJI', etfYahoo: 'DIA' },
] as const;

type TvRow = {
  close: number | null;
  change: number | null;
  changeAbs: number | null;
  /** undefined = column omitted (e.g. legacy mock), null = explicitly absent */
  timeMs: number | null | undefined;
  preClose: number | null;
  preChange: number | null;
  preChangeAbs: number | null;
  preTimeMs: number | null | undefined;
  postClose: number | null;
  postChange: number | null;
  postChangeAbs: number | null;
  postTimeMs: number | null | undefined;
};

type CnbcQuote = {
  last: number | null;
  previousDayClosing: number | null;
  change: number | null;
  changePct: number | null;
  isToday: boolean;
  extType: string | null;
  extPrice: number | null;
  extChangePct: number | null;
  extTimeMs: number | null;
};

type YahooChart = {
  intraday: { ts: string; price: number }[];
  regularMarketPrice: number | null;
  regularMarketTimeMs: number | null;
  previousClose: number | null;
};

function parseCnbcNum(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[,%\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isDateStringTodayET(dateOrIso: unknown, now: Date): boolean {
  if (typeof dateOrIso !== 'string' || !dateOrIso.trim()) return false;
  const trimmed = dateOrIso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed === getDateET(now);
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return false;
  return isSameETDay(parsed, now);
}

function parseTvTimestampMs(d: (string | number | null)[], idx: number): number | null | undefined {
  if (d.length <= idx) return undefined;
  const raw = d[idx];
  if (typeof raw !== 'number' || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function isTvBarFresh(barTimeMs: number | null | undefined, now: Date): boolean {
  if (barTimeMs === undefined) return true; // column not provided (legacy mock)
  if (barTimeMs === null) return false;     // explicitly null from TV
  return isSameETDay(new Date(barTimeMs), now);
}

async function fetchCnbcQuotes(now: Date): Promise<Map<string, CnbcQuote>> {
  const symbols = INDEX_DEFS.flatMap(i => [i.cnbc, i.etfCnbc]);
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(symbols.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': TV_UA },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`CNBC HTTP ${res.status}`);

  const json = await res.json();
  const out = new Map<string, CnbcQuote>();
  for (const q of json?.FormattedQuoteResult?.FormattedQuote ?? []) {
    if (!q?.symbol || q?.code !== 0) continue;
    const ext = q?.ExtendedMktQuote;
    const extTimeMs = typeof ext?.last_time === 'string' ? new Date(ext.last_time).getTime() : NaN;
    out.set(String(q.symbol), {
      last: parseCnbcNum(q.last),
      previousDayClosing: parseCnbcNum(q.previous_day_closing),
      change: parseCnbcNum(q.change),
      changePct: parseCnbcNum(q.change_pct),
      isToday: isDateStringTodayET(q.last_time, now),
      extType: typeof ext?.type === 'string' ? ext.type : null,
      extPrice: parseCnbcNum(ext?.last),
      extChangePct: parseCnbcNum(ext?.change_pct),
      extTimeMs: Number.isFinite(extTimeMs) && extTimeMs > 0 ? extTimeMs : null,
    });
  }
  return out;
}

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
        'time',
        'premarket_time',
        'postmarket_time',
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
      timeMs: parseTvTimestampMs(d, 10),
      preTimeMs: parseTvTimestampMs(d, 11),
      postTimeMs: parseTvTimestampMs(d, 12),
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
      regularMarketTimeMs: typeof meta.regularMarketTime === 'number' && meta.regularMarketTime > 0
        ? meta.regularMarketTime * 1000
        : null,
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

    const [cnbcMap, tvMap, ...yahooCharts] = await Promise.all([
      fetchCnbcQuotes(now).catch(() => null),
      fetchTvQuotes().catch(() => null),
      ...yahooSymbols.map(sym => fetchYahooChart(sym, isPre)),
    ]);

    const out: Record<string, unknown> = {};

    INDEX_DEFS.forEach((def, i) => {
      const cnbcIdx = cnbcMap?.get(def.cnbc);
      const cnbcEtf = cnbcMap?.get(def.etfCnbc);
      const tvIdx = tvMap?.get(def.tv);
      const tvEtf = tvMap?.get(def.etfTv);
      const yh = yahooCharts[i];

      if (isPre) {
        // In pre-market, yh is the ETF chart (SPY/QQQ/DIA), NOT the cash index.
        const idxClose = tvIdx?.close ?? cnbcIdx?.last ?? null;
        if (idxClose == null || idxClose <= 0) return;

        // In Yahoo range=1d during pre-market, regularMarketPrice is D-1 regular
        // close (whereas previousClose is D-2).
        const etfClose = cnbcEtf?.previousDayClosing ?? tvEtf?.close ?? yh?.regularMarketPrice ?? 0;

        // Filter ETF bars to today's pre-market session (>= 04:00 AM ET)
        const rawBars = yh?.intraday.filter(b => isInSessionET(new Date(b.ts).getTime(), 'pre', now)) ?? [];

        // 1. CNBC 0-delay PRE_MKT (same ET day)
        // 2. TradingView premarket_change ONLY if premarket_time is today ET
        // 3. Yahoo today's latest 5m pre-market bar vs D-1 ETF close
        // 4. Flat 0% until today's first pre-market print arrives
        let prePct = 0;
        const cnbcPreFresh =
          cnbcEtf?.extType === 'PRE_MKT' &&
          cnbcEtf.extTimeMs != null &&
          isSameETDay(new Date(cnbcEtf.extTimeMs), now);

        if (cnbcPreFresh && cnbcEtf?.extChangePct != null) {
          prePct = cnbcEtf.extChangePct;
        } else if (cnbcPreFresh && cnbcEtf?.extPrice != null && etfClose > 0) {
          prePct = (cnbcEtf.extPrice / etfClose - 1) * 100;
        } else if (isTvBarFresh(tvEtf?.preTimeMs, now) && typeof tvEtf?.preChange === 'number') {
          prePct = tvEtf.preChange;
        } else if (isTvBarFresh(tvEtf?.preTimeMs, now) && tvEtf?.preClose && etfClose > 0) {
          prePct = (tvEtf.preClose / etfClose - 1) * 100;
        } else if (rawBars.length > 0 && etfClose > 0) {
          prePct = (rawBars[rawBars.length - 1]!.price / etfClose - 1) * 100;
        }

        const price = Number((idxClose * (1 + prePct / 100)).toFixed(2));
        const dollarChange = Number((price - idxClose).toFixed(2));
        const percentChange = Number(prePct.toFixed(2));

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
            dollarChange: tvIdx?.changeAbs ?? cnbcIdx?.change ?? 0,
            percentChange: tvIdx?.change ?? cnbcIdx?.changePct ?? 0,
          },
          intraday,
        };
      } else if (session === 'after') {
        const tvFresh = isTvBarFresh(tvIdx?.timeMs, now);
        const cnbcFresh = Boolean(cnbcIdx?.isToday && cnbcIdx.last && cnbcIdx.last > 0);
        const yhFresh = yh?.regularMarketTimeMs != null && isSameETDay(new Date(yh.regularMarketTimeMs), now);

        const idxClose = (cnbcFresh ? cnbcIdx!.last : null)
          ?? (tvFresh ? tvIdx?.close : null)
          ?? (yhFresh ? yh?.regularMarketPrice : null)
          ?? tvIdx?.close
          ?? yh?.regularMarketPrice
          ?? cnbcIdx?.last
          ?? null;
        if (idxClose == null || idxClose <= 0) return;

        const idxPrevClose = (cnbcFresh ? cnbcIdx?.previousDayClosing : null)
          ?? (yhFresh ? yh?.previousClose : null)
          ?? (tvFresh && tvIdx?.changeAbs != null ? idxClose - tvIdx.changeAbs : null)
          ?? yh?.previousClose
          ?? (tvIdx?.changeAbs != null ? idxClose - tvIdx.changeAbs : idxClose);

        const dollarChange = (cnbcFresh ? cnbcIdx?.change : null)
          ?? (tvFresh ? tvIdx?.changeAbs : null)
          ?? (idxClose - idxPrevClose);
        const percentChange = (cnbcFresh ? cnbcIdx?.changePct : null)
          ?? (tvFresh ? tvIdx?.change : null)
          ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0);

        const cnbcPostFresh =
          cnbcEtf?.extType === 'POST_MKT' &&
          cnbcEtf.extTimeMs != null &&
          isSameETDay(new Date(cnbcEtf.extTimeMs), now);
        const etfClose = cnbcEtf?.previousDayClosing ?? tvEtf?.close ?? 0;

        let ahPct: number | null = null;
        if (cnbcPostFresh && cnbcEtf?.extChangePct != null) {
          ahPct = cnbcEtf.extChangePct;
        } else if (cnbcPostFresh && cnbcEtf?.extPrice != null && etfClose > 0) {
          ahPct = (cnbcEtf.extPrice / etfClose - 1) * 100;
        } else if (isTvBarFresh(tvEtf?.postTimeMs, now) && typeof tvEtf?.postChange === 'number') {
          ahPct = tvEtf.postChange;
        }

        const ahPrice = ahPct != null ? Number((idxClose * (1 + ahPct / 100)).toFixed(2)) : null;

        out[def.key] = {
          price: idxClose,
          previousClose: idxPrevClose,
          dollarChange,
          percentChange,
          session: 'after',
          ah: ahPct != null ? { price: ahPrice!, pct: Number(ahPct.toFixed(2)) } : null,
          intraday: yh?.intraday ?? [],
        };
      } else if (session === 'live') {
        // Guard against TV's ~15m lag right at 09:30 ET open (yesterday's close/change)
        const cnbcFresh = Boolean(cnbcIdx?.isToday && cnbcIdx.last && cnbcIdx.last > 0);
        const tvFresh = isTvBarFresh(tvIdx?.timeMs, now);
        const yhHasToday = yh?.regularMarketTimeMs == null
          ? Boolean(yh?.regularMarketPrice && yh.regularMarketPrice > 0)
          : isSameETDay(new Date(yh.regularMarketTimeMs), now);

        let idxClose: number | null = null;
        let idxPrevClose: number | null = null;
        let dollarChange = 0;
        let percentChange = 0;

        if (cnbcFresh) {
          idxClose = cnbcIdx!.last!;
          idxPrevClose = cnbcIdx?.previousDayClosing ?? yh?.previousClose ?? (cnbcIdx?.change != null ? idxClose - cnbcIdx.change : idxClose);
          dollarChange = cnbcIdx?.change ?? (idxClose - idxPrevClose);
          percentChange = cnbcIdx?.changePct ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0);
        } else if (tvFresh && tvIdx?.close && tvIdx.close > 0) {
          idxClose = tvIdx.close;
          idxPrevClose = yhHasToday && yh?.previousClose
            ? yh.previousClose
            : (tvIdx.changeAbs != null ? idxClose - tvIdx.changeAbs : idxClose);
          dollarChange = tvIdx.changeAbs ?? (idxClose - idxPrevClose);
          percentChange = tvIdx.change ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0);
        } else if (yhHasToday && yh?.regularMarketPrice && yh.regularMarketPrice > 0) {
          idxClose = yh.regularMarketPrice;
          idxPrevClose = yh.previousClose ?? idxClose;
          dollarChange = idxClose - idxPrevClose;
          percentChange = idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0;
        } else {
          // 09:30:00 ET before today's first print arrives anywhere: pin flat at D-1 close
          idxClose = tvIdx?.close ?? cnbcIdx?.last ?? yh?.regularMarketPrice ?? null;
          if (idxClose == null || idxClose <= 0) return;
          idxPrevClose = idxClose;
          dollarChange = 0;
          percentChange = 0;
        }

        out[def.key] = {
          price: idxClose,
          previousClose: idxPrevClose,
          dollarChange: Number(dollarChange.toFixed(2)),
          percentChange: Number(percentChange.toFixed(2)),
          session,
          intraday: yh?.intraday ?? [],
        };
      } else {
        // 'closed' — show last completed regular session
        const idxClose = tvIdx?.close ?? cnbcIdx?.last ?? yh?.regularMarketPrice ?? null;
        if (idxClose == null || idxClose <= 0) return;

        const idxPrevClose = yh?.previousClose ?? cnbcIdx?.previousDayClosing
          ?? (tvIdx?.changeAbs != null ? idxClose - tvIdx.changeAbs : idxClose);
        const dollarChange = tvIdx?.changeAbs ?? cnbcIdx?.change ?? (idxClose - idxPrevClose);
        const percentChange = tvIdx?.change ?? cnbcIdx?.changePct
          ?? (idxPrevClose > 0 ? (idxClose / idxPrevClose - 1) * 100 : 0);

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

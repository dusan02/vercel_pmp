import { NextRequest, NextResponse } from 'next/server';
import { nowET, detectSession } from '@/lib/utils/timeUtils';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') || 'SLB';
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Polygon API key not configured' }, { status: 500 });
  }

  try {
    // Get snapshot from Polygon
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
    const snapshotResponse = await fetch(snapshotUrl, {
      signal: AbortSignal.timeout(10000)
    });

    if (!snapshotResponse.ok) {
      return NextResponse.json({ 
        error: `Polygon API error: ${snapshotResponse.status} ${snapshotResponse.statusText}` 
      }, { status: snapshotResponse.status });
    }

    const snapshotData = await snapshotResponse.json();
    const tickerData = snapshotData.ticker || snapshotData.tickers?.[0];

    // Get previous close
    const prevCloseUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
    const prevCloseResponse = await fetch(prevCloseUrl, {
      signal: AbortSignal.timeout(10000)
    });
    const prevCloseData = prevCloseResponse.ok ? await prevCloseResponse.json() : null;

    // Get current session
    const etNow = nowET();
    const session = detectSession(etNow);

    // Extract all price sources
    const priceSources = {
      lastTrade: {
        price: tickerData?.lastTrade?.p,
        timestamp: tickerData?.lastTrade?.t,
        timestampMs: tickerData?.lastTrade?.t ? Number(tickerData.lastTrade.t) / 1_000_000 : null
      },
      min: {
        price: tickerData?.min?.c,
        timestamp: tickerData?.min?.t,
        timestampMs: tickerData?.min?.t ? Number(tickerData.min.t) / 1_000_000 : null
      },
      day: {
        price: tickerData?.day?.c,
        timestamp: null // day.c doesn't have timestamp
      },
      prevDay: {
        price: tickerData?.prevDay?.c,
        timestamp: null
      },
      lastQuote: {
        bid: tickerData?.lastQuote?.bp,
        ask: tickerData?.lastQuote?.ap,
        timestamp: tickerData?.lastQuote?.t,
        timestampMs: tickerData?.lastQuote?.t ? Number(tickerData.lastQuote.t) / 1_000_000 : null
      }
    };

    // Calculate what we would use
    let usedPrice = null;
    let usedSource = null;
    let calculatedPercentChange = null;
    let referencePrice = null;

    if (priceSources.lastTrade.price && priceSources.lastTrade.price > 0) {
      usedPrice = priceSources.lastTrade.price;
      usedSource = 'lastTrade';
    } else if (priceSources.min.price && priceSources.min.price > 0) {
      usedPrice = priceSources.min.price;
      usedSource = 'min';
    } else if (priceSources.day.price && priceSources.day.price > 0) {
      usedPrice = priceSources.day.price;
      usedSource = 'day';
    } else if (priceSources.prevDay.price && priceSources.prevDay.price > 0) {
      usedPrice = priceSources.prevDay.price;
      usedSource = 'prevDay';
    }

    const previousClose = prevCloseData?.results?.[0]?.c || null;

    if (usedPrice && previousClose) {
      referencePrice = previousClose;
      calculatedPercentChange = ((usedPrice / previousClose) - 1) * 100;
    }

    return NextResponse.json({
      ticker,
      session,
      etNow: etNow.toISOString(),
      polygonSnapshot: {
        raw: tickerData,
        priceSources,
        usedPrice,
        usedSource,
        previousClose,
        referencePrice,
        calculatedPercentChange: calculatedPercentChange ? calculatedPercentChange.toFixed(2) + '%' : null
      },
      prevCloseData: prevCloseData?.results?.[0] || null
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Error fetching Polygon data',
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

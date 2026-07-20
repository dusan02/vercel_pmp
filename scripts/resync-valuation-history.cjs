/**
 * Full re-sync of DailyValuationHistory for all tickers.
 *
 * Deletes all existing records and re-fetches 10Y adjusted daily prices
 * from Polygon, recomputing P/E, P/S, marketCap, EV/EBIT, FCF yield.
 *
 * Usage:
 *   node scripts/resync-valuation-history.cjs          # all tickers
 *   node scripts/resync-valuation-history.cjs NFLX TSLA  # specific tickers
 *
 * Requires DATABASE_URL and POLYGON_API_KEY env vars.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
if (!POLYGON_API_KEY) {
  console.error('Missing POLYGON_API_KEY');
  process.exit(1);
}

const BATCH_SIZE = 500;     // DB transaction batch size
const DELAY_MS = 300;       // delay between Polygon API calls (rate limit safety)
const CONCURRENCY = 3;      // parallel tickers

// TTM computation (mirrors src/lib/utils/ttm.ts computeTTMAtDate)
function computeTTMAtDate(stmts, date) {
  const sorted = [...stmts].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  const before = sorted.filter(s => s.endDate.getTime() <= date.getTime());
  const quarterly = before.filter(s => s.fiscalPeriod !== 'FY');
  const annual = before.filter(s => s.fiscalPeriod === 'FY');
  const latestQ = quarterly[0] || null;

  const matchingFY = latestQ?.fiscalYear != null
    ? annual.find(s => s.fiscalYear === latestQ.fiscalYear - 1) || null
    : null;

  const prevYearSameQ = latestQ
    ? quarterly.find(s => s.fiscalPeriod === latestQ.fiscalPeriod && s.fiscalYear === latestQ.fiscalYear - 1) || null
    : null;

  let netIncome = null;
  let revenue = null;

  if (latestQ && matchingFY && prevYearSameQ) {
    if (latestQ.netIncome != null && matchingFY.netIncome != null && prevYearSameQ.netIncome != null) {
      netIncome = latestQ.netIncome + matchingFY.netIncome - prevYearSameQ.netIncome;
    }
    if (latestQ.revenue != null && matchingFY.revenue != null && prevYearSameQ.revenue != null) {
      revenue = latestQ.revenue + matchingFY.revenue - prevYearSameQ.revenue;
    }
  }

  const fallbackFY = annual[0] || null;
  if (netIncome === null && fallbackFY?.netIncome != null) netIncome = fallbackFY.netIncome;
  if (revenue === null && fallbackFY?.revenue != null) revenue = fallbackFY.revenue;

  return { netIncome, revenue };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function syncOneTicker(symbol) {
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const toDate = new Date();

  const fromStr = tenYearsAgo.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  // Polygon aggs with adjusted=false (raw prices) — adjusted=true over-adjusts some tickers
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}?adjusted=false&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`  ✗ ${symbol}: Polygon API error ${resp.status}`);
    return { symbol, ok: false, count: 0 };
  }

  const data = await resp.json();
  const aggs = data.results || [];
  if (aggs.length === 0) {
    console.warn(`  ⚠ ${symbol}: no price data from Polygon`);
    return { symbol, ok: true, count: 0 };
  }

  // Fetch financial statements for P/E, P/S computation
  const statements = await prisma.financialStatement.findMany({
    where: { symbol },
    orderBy: { endDate: 'desc' },
  });

  // Detect stock splits from shares outstanding jumps in quarterly statements
  // and build a list of {date, ratio} split events
  // Sanity check: verify adjusted P/E is reasonable (5-300) to avoid false positives
  const splits = [];
  const quarterlyStmts = statements
    .filter(s => s.fiscalPeriod && s.fiscalPeriod !== 'FY')
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  // Helper: verify a real stock split by checking if raw price dropped proportionally
  // Since we use adjusted=false, a real split shows a price drop on the split date.
  // Financial statement dates are quarter-end, but splits happen mid-quarter,
  // so we search for the price drop within a 90-day window before the statement date.
  function isSplitReasonable(splitDate, splitRatio) {
    // Search 90 days before the statement date for a price drop matching splitRatio
    const windowStart = new Date(splitDate);
    windowStart.setDate(windowStart.getDate() - 90);

    // Find all daily prices in the window
    const windowPrices = [];
    for (const agg of aggs) {
      const d = new Date(agg.t);
      if (d.getTime() >= windowStart.getTime() && d.getTime() <= splitDate.getTime()) {
        windowPrices.push({ date: d, price: agg.c });
      }
    }
    if (windowPrices.length < 2) {
      console.log(`  ⚠ ${symbol}: split x${splitRatio} — cannot verify (insufficient price data in window)`);
      return true; // can't verify, allow
    }

    // Find the largest single-day price drop ratio in the window
    let maxDropRatio = 1;
    let dropDate = null;
    for (let i = 1; i < windowPrices.length; i++) {
      const ratio = windowPrices[i - 1].price / windowPrices[i].price;
      if (ratio > maxDropRatio) {
        maxDropRatio = ratio;
        dropDate = windowPrices[i].date;
      }
    }

    // For a real split, the largest drop should be ~splitRatio (within 30% tolerance)
    const expectedMin = splitRatio * 0.7;
    const expectedMax = splitRatio * 1.3;
    const reasonable = maxDropRatio >= expectedMin && maxDropRatio <= expectedMax;
    if (!reasonable) {
      console.log(`  ⚠ ${symbol}: split x${splitRatio} rejected — max price drop=${maxDropRatio.toFixed(2)}x (expected ~${splitRatio}x) in 90d window before ${splitDate.toISOString().slice(0, 10)}`);
    } else {
      console.log(`  ✓ ${symbol}: split x${splitRatio} confirmed — price drop ${maxDropRatio.toFixed(2)}x on ${dropDate.toISOString().slice(0, 10)}`);
    }
    return reasonable;
  }

  for (let i = 1; i < quarterlyStmts.length; i++) {
    const prev = quarterlyStmts[i - 1];
    const curr = quarterlyStmts[i];
    if (prev.sharesOutstanding && prev.sharesOutstanding > 0 &&
        curr.sharesOutstanding && curr.sharesOutstanding > 0) {
      const ratio = curr.sharesOutstanding / prev.sharesOutstanding;
      if (ratio > 1.5) {
        const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
        const nearest = commonSplits.reduce((best, r) =>
          Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
        );
        if (Math.abs(ratio - nearest) / nearest <= 0.15) {
          if (isSplitReasonable(curr.endDate, nearest)) {
            splits.push({ date: curr.endDate, ratio: nearest });
            console.log(`  ⚡ ${symbol}: split x${nearest} detected at ${curr.endDate.toISOString().slice(0, 10)}`);
          }
        }
      }
    }
  }

  // Also check Ticker.sharesOutstanding vs last statement for recent splits
  const tickerInfo = await prisma.ticker.findUnique({
    where: { symbol },
    select: { sharesOutstanding: true },
  });
  if (tickerInfo?.sharesOutstanding && tickerInfo.sharesOutstanding > 0 && quarterlyStmts.length > 0) {
    const lastQ = quarterlyStmts[quarterlyStmts.length - 1];
    if (lastQ?.sharesOutstanding && lastQ.sharesOutstanding > 0) {
      const ratio = tickerInfo.sharesOutstanding / lastQ.sharesOutstanding;
      if (ratio > 1.5) {
        const commonSplits = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
        const nearest = commonSplits.reduce((best, r) =>
          Math.abs(ratio - r) < Math.abs(ratio - best) ? r : best
        );
        if (Math.abs(ratio - nearest) / nearest <= 0.15) {
          // Check if we already detected this split
          const alreadyDetected = splits.some(s => s.ratio === nearest &&
            Math.abs(s.date.getTime() - lastQ.endDate.getTime()) < 90 * 86400000);
          if (!alreadyDetected && isSplitReasonable(lastQ.endDate, nearest)) {
            splits.push({ date: lastQ.endDate, ratio: nearest });
            console.log(`  ⚡ ${symbol}: split x${nearest} detected from ticker shares (recent)`);
          }
        }
      }
    }
  }

  // Function to adjust raw price for splits that occurred after the price date
  function adjustPrice(rawPrice, priceDate) {
    let adjusted = rawPrice;
    for (const split of splits) {
      if (priceDate.getTime() < split.date.getTime()) {
        adjusted = adjusted / split.ratio;
      }
    }
    return adjusted;
  }

  // Apply split adjustment to statements: multiply pre-split shares by split ratio
  // so that EPS is computed on a post-split basis (matching API route logic)
  for (const split of splits) {
    for (const s of statements) {
      if (s.endDate.getTime() < split.date.getTime() &&
          s.sharesOutstanding && s.sharesOutstanding > 0) {
        s.sharesOutstanding = s.sharesOutstanding * split.ratio;
      }
    }
  }

  // Delete existing records for this ticker
  await prisma.dailyValuationHistory.deleteMany({ where: { symbol } });

  const transactions = [];

  for (const agg of aggs) {
    const date = new Date(agg.t);
    const rawPrice = agg.c;
    const closePrice = adjustPrice(rawPrice, date);

    let peRatio = null;
    let psRatio = null;
    let marketCap = null;
    let evEbitda = null;
    let fcfYield = null;

    const { netIncome: ttmNI, revenue: ttmRev } = computeTTMAtDate(statements, date);

    const stmtsBeforeDate = statements.filter(s => s.endDate.getTime() <= date.getTime());
    const stmt = stmtsBeforeDate[0] || statements[statements.length - 1];

    if (stmt && stmt.sharesOutstanding) {
      marketCap = closePrice * stmt.sharesOutstanding;

      const effectiveNI = ttmNI ?? stmt.netIncome;
      if (effectiveNI && effectiveNI > 0) {
        peRatio = closePrice / (effectiveNI / stmt.sharesOutstanding);
      }

      const effectiveRev = ttmRev ?? stmt.revenue;
      if (effectiveRev && effectiveRev > 0) {
        psRatio = closePrice / (effectiveRev / stmt.sharesOutstanding);
      }

      if (stmt.ebit && stmt.ebit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null) {
        const ev = marketCap + stmt.totalDebt - stmt.cashAndEquivalents;
        evEbitda = ev / stmt.ebit;
      }

      if (stmt.operatingCashFlow !== null && stmt.capex !== null && marketCap > 0) {
        const fcf = stmt.operatingCashFlow - Math.abs(stmt.capex);
        fcfYield = fcf / marketCap;
      }
    }

    transactions.push(
      prisma.dailyValuationHistory.upsert({
        where: { symbol_date: { symbol, date } },
        update: { closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield },
        create: { symbol, date, closePrice, marketCap, peRatio, psRatio, evEbitda, fcfYield },
      })
    );
  }

  // Batch insert
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    await prisma.$transaction(transactions.slice(i, i + BATCH_SIZE));
  }

  console.log(`  ✓ ${symbol}: ${aggs.length} records synced`);
  return { symbol, ok: true, count: aggs.length };
}

async function runConcurrent(items, fn, concurrency) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        const result = await fn(current);
        results.push(result);
      } catch (err) {
        console.error(`  ✗ ${current}: ${err.message}`);
        results.push({ symbol: current, ok: false, count: 0 });
      }
      await sleep(DELAY_MS);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const argTickers = process.argv.slice(2);

  let symbols;
  if (argTickers.length > 0) {
    symbols = argTickers.map(s => s.toUpperCase());
  } else {
    const tickers = await prisma.ticker.findMany({
      where: { active: true },
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    });
    symbols = tickers.map(t => t.symbol);
  }

  console.log(`\n=== Full Re-sync of DailyValuationHistory ===`);
  console.log(`Tickers: ${symbols.length}`);
  console.log(`Concurrency: ${CONCURRENCY}, Delay: ${DELAY_MS}ms\n`);

  if (argTickers.length === 0) {
    // Full wipe — only when syncing all tickers
    console.log('Deleting all DailyValuationHistory records...');
    const deleted = await prisma.dailyValuationHistory.deleteMany({});
    console.log(`Deleted ${deleted.count} records.\n`);
  }

  const startTime = Date.now();
  const results = await runConcurrent(symbols, syncOneTicker, CONCURRENCY);

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const totalRecords = results.reduce((sum, r) => sum + r.count, 0);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Done ===`);
  console.log(`OK: ${ok}, Failed: ${failed}, Records: ${totalRecords}, Time: ${duration}s`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Diagnostic script: check price discrepancies on production
 * Run: ssh root@89.185.250.213 "cd /var/www/premarketprice && node scripts/diag-price.js"
 * Or with specific ticker: node scripts/diag-price.js ALGN
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SPOT_TICKERS = process.argv[2]
  ? [process.argv[2].toUpperCase()]
  : ['ALGN', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOG', 'NFLX', 'AMD'];

async function main() {
  console.log(`\n🔍 Price Diagnostic — ${new Date().toISOString()}\n`);
  console.log('='.repeat(110));
  console.log(
    'Ticker'.padEnd(8),
    'DB Price'.padEnd(12),
    'DB Chg%'.padEnd(10),
    'DB PrevClose'.padEnd(14),
    'PrevCloseDate'.padEnd(16),
    'LastUpdated'.padEnd(24),
    'Staleness'.padEnd(12),
    'Status'
  );
  console.log('='.repeat(110));

  const now = new Date();

  for (const symbol of SPOT_TICKERS) {
    const t = await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        lastPrice: true,
        lastChangePct: true,
        latestPrevClose: true,
        latestPrevCloseDate: true,
        lastPriceUpdated: true,
        lastMarketCap: true,
        updatedAt: true,
      },
    });

    if (!t) {
      console.log(`${symbol.padEnd(8)} NOT FOUND in DB`);
      continue;
    }

    const staleMins = t.lastPriceUpdated
      ? Math.round((now.getTime() - new Date(t.lastPriceUpdated).getTime()) / 60000)
      : null;

    // Compute expected change from price vs prevClose
    const expectedChg = t.latestPrevClose && t.latestPrevClose > 0
      ? ((t.lastPrice - t.latestPrevClose) / t.latestPrevClose * 100)
      : null;

    const chgMismatch = expectedChg !== null && t.lastChangePct !== null
      ? Math.abs(expectedChg - t.lastChangePct) > 1.0
      : false;

    const stale = staleMins !== null && staleMins > 60;
    const issues = [];
    if (stale) issues.push(`STALE(${staleMins}m)`);
    if (chgMismatch) issues.push(`CHG_MISMATCH(exp:${expectedChg?.toFixed(2)}% vs db:${t.lastChangePct?.toFixed(2)}%)`);
    if (!t.latestPrevClose) issues.push('NO_PREVCLOSE');
    if (t.lastPrice === 0) issues.push('ZERO_PRICE');

    const status = issues.length > 0 ? `⚠️  ${issues.join(' | ')}` : '✅ OK';

    console.log(
      symbol.padEnd(8),
      (`$${t.lastPrice?.toFixed(2) ?? '0.00'}`).padEnd(12),
      (`${t.lastChangePct?.toFixed(2) ?? 'N/A'}%`).padEnd(10),
      (`$${t.latestPrevClose?.toFixed(2) ?? 'N/A'}`).padEnd(14),
      (t.latestPrevCloseDate ? new Date(t.latestPrevCloseDate).toISOString().slice(0, 10) : 'N/A').padEnd(16),
      (t.lastPriceUpdated ? new Date(t.lastPriceUpdated).toISOString().slice(0, 19) : 'N/A').padEnd(24),
      (staleMins !== null ? `${staleMins}m` : 'N/A').padEnd(12),
      status
    );
  }

  // Also check Redis data via the same logic as /api/prices/cached
  console.log('\n\n📡 Redis Session Check:');
  console.log('='.repeat(80));

  try {
    // Check what session prices exist for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const symbol of SPOT_TICKERS.slice(0, 5)) {
      const sessions = await prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: today } },
        orderBy: { lastTs: 'desc' },
        take: 3,
      });

      if (sessions.length > 0) {
        for (const s of sessions) {
          console.log(
            `  ${symbol.padEnd(6)} ${s.session.padEnd(8)} price=$${s.lastPrice?.toFixed(2)} chg=${s.changePct?.toFixed(2)}% ts=${s.lastTs?.toISOString().slice(0, 19)} quality=${s.quality}`
          );
        }
      } else {
        console.log(`  ${symbol.padEnd(6)} No session data today`);
      }
    }
  } catch (e) {
    console.log('  Could not read SessionPrice:', e.message);
  }

  // Check if ALGN specifically has a prevClose mismatch
  console.log('\n\n🧮 ALGN Deep Dive:');
  console.log('='.repeat(80));
  const algn = await prisma.ticker.findUnique({
    where: { symbol: 'ALGN' },
  });
  if (algn) {
    console.log('  Full record:', JSON.stringify({
      lastPrice: algn.lastPrice,
      lastChangePct: algn.lastChangePct,
      latestPrevClose: algn.latestPrevClose,
      latestPrevCloseDate: algn.latestPrevCloseDate,
      lastPriceUpdated: algn.lastPriceUpdated,
      lastMarketCap: algn.lastMarketCap,
      lastMarketCapDiff: algn.lastMarketCapDiff,
      updatedAt: algn.updatedAt,
    }, null, 2));

    // Check DailyRef for ALGN
    const refs = await prisma.dailyRef.findMany({
      where: { symbol: 'ALGN' },
      orderBy: { date: 'desc' },
      take: 5,
    });
    console.log('\n  Recent DailyRef entries:');
    for (const r of refs) {
      console.log(`    date=${r.date.toISOString().slice(0, 10)} prevClose=$${r.previousClose?.toFixed(2)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * fix_delisted_tickers.ts
 *
 * 1. Načíta tickery s anomálnym changePct (>100% alebo <-50%) z DB
 * 2. Overí ich stav cez Polygon API (active/inactive)
 * 3. Delistované tickery:
 *    - Odstráni z Redis universe:sp500 + universe:pmp
 *    - Vymaže z DB (Ticker tabuľka + závislosti)
 * 4. Aktívnym tickerom resetuje changePct na 0 (bude opraven pri ďalšom ingest-e)
 *
 * Spustenie:
 *   npx tsx tmp/fix_delisted_tickers.ts
 * (vyžaduje POLYGON_API_KEY a REDIS_URL v .env.local)
 */

import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── .env.local loader ──────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

// ── Config ─────────────────────────────────────────────────────────────────
const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? '';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DRY_RUN = process.argv.includes('--dry-run');

if (!POLYGON_API_KEY) {
  console.error('❌ POLYGON_API_KEY chýba v .env.local');
  process.exit(1);
}

const prisma = new PrismaClient(DATABASE_URL ? {
  datasources: { db: { url: DATABASE_URL } }
} : {});

// ── Polygon ticker details ─────────────────────────────────────────────────
async function fetchTickerStatus(symbol: string): Promise<{
  active: boolean;
  name: string;
  reason?: string;
} | null> {
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return { active: false, name: symbol, reason: '404 Not Found' };
    if (!res.ok) {
      console.warn(`  ⚠️ ${symbol}: HTTP ${res.status}`);
      return null; // neznámy stav, preskočiť
    }
    const data = await res.json();
    const result = data?.results;
    if (!result) return { active: false, name: symbol, reason: 'No results' };
    return {
      active: result.active === true,
      name: result.name ?? symbol,
      reason: result.active === false ? (result.delisted_utc ? `delisted ${result.delisted_utc.slice(0, 10)}` : 'inactive') : undefined
    };
  } catch (err: any) {
    console.warn(`  ⚠️ ${symbol}: fetch error - ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'='.repeat(65)}`);
  console.log('🔧 FIX DELISTOVANÝCH TICKEROV' + (DRY_RUN ? ' [DRY RUN]' : ''));
  console.log('='.repeat(65));

  // 1. Načítaj anomálne tickery z DB
  const anomalous = await prisma.ticker.findMany({
    where: {
      OR: [
        { lastChangePct: { gt: 100 } },
        { lastChangePct: { lt: -50 } },
      ]
    },
    select: {
      symbol: true,
      lastPrice: true,
      lastChangePct: true,
      latestPrevClose: true,
      latestPrevCloseDate: true,
    },
    orderBy: { lastChangePct: 'desc' }
  });

  if (anomalous.length === 0) {
    console.log('✅ Žiadne anomálne tickery v DB (|changePct| > 100% alebo < -50%)');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\nNájdených ${anomalous.length} anomálnych tickerov:\n`);
  for (const t of anomalous) {
    const prevStr = t.latestPrevClose ? t.latestPrevClose.toFixed(2) : 'NULL';
    const dateStr = t.latestPrevCloseDate?.toISOString().slice(0, 10) ?? 'NULL';
    console.log(`  ${t.symbol.padEnd(8)} price=${t.lastPrice.toFixed(2).padStart(8)}  changePct=${String(t.lastChangePct?.toFixed(2) ?? '?').padStart(9)}%  prevClose=${prevStr} (${dateStr})`);
  }

  // 2. Polygon API check
  console.log(`\n${'─'.repeat(65)}`);
  console.log('🌐 Overujem stav cez Polygon API...\n');

  const DELAY_MS = 300; // rate limit buffer
  const delisted: string[] = [];
  const active: string[] = [];
  const unknown: string[] = [];

  for (const t of anomalous) {
    const status = await fetchTickerStatus(t.symbol);
    if (status === null) {
      console.log(`  ❓ ${t.symbol}: neznámy stav (API chyba)`);
      unknown.push(t.symbol);
    } else if (!status.active) {
      console.log(`  ❌ ${t.symbol}: NEAKTÍVNY (${status.reason}) – "${status.name}"`);
      delisted.push(t.symbol);
    } else {
      console.log(`  ✅ ${t.symbol}: aktívny – "${status.name}"`);
      active.push(t.symbol);
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // 3. Zhrnutie
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`📊 Výsledok:`);
  console.log(`  Neaktívnych (na odstránenie): ${delisted.length} → ${delisted.join(', ') || 'žiadne'}`);
  console.log(`  Aktívnych (len reset %): ${active.length} → ${active.join(', ') || 'žiadne'}`);
  console.log(`  Neznámych (preskočené): ${unknown.length} → ${unknown.join(', ') || 'žiadne'}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN – žiadne zmeny neboli vykonané.');
    console.log('    Spusti bez --dry-run pre skutočné odstránenie.');
    await prisma.$disconnect();
    return;
  }

  // 4. Pripoj Redis
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  // 5. Odstráň delistované
  if (delisted.length > 0) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`🗑️  Odstraňujem ${delisted.length} delistovaných tickerov...\n`);

    for (const symbol of delisted) {
      try {
        // Redis universes
        const removedSp500 = await redis.sRem('universe:sp500', symbol);
        const removedPmp = await redis.sRem('universe:pmp', symbol);

        // Redis price/heatmap keys
        const keyPatterns = [
          `last:pre:${symbol}`, `last:live:${symbol}`, `last:after:${symbol}`,
          `stock:${symbol}`, `prevclose:*:${symbol}`,
          `rank:*`, // zset – odstránime member
        ];

        // Odstráň z heatmap ZSETs
        for (const session of ['pre', 'live', 'after']) {
          await redis.zRem(`heatmap:${session}`, symbol);
          await redis.zRem(`rank:chg:${session}`, symbol);
          await redis.zRem(`rank:price:${session}`, symbol);
          await redis.zRem(`rank:cap:${session}`, symbol);
          await redis.zRem(`rank:capdiff:${session}`, symbol);
        }

        // Odstráň string keys
        for (const key of [`last:pre:${symbol}`, `last:live:${symbol}`, `last:after:${symbol}`, `stock:${symbol}`]) {
          await redis.del(key);
        }

        // DB: SessionPrice
        const spDel = await prisma.sessionPrice.deleteMany({ where: { symbol } });
        // DB: DailyRef
        const drDel = await prisma.dailyRef.deleteMany({ where: { symbol } });
        // DB: MoverEvent
        const meDel = await prisma.moverEvent.deleteMany({ where: { symbol } }).catch(() => ({ count: 0 }));
        // DB: Ticker (posledné – FK)
        await prisma.ticker.delete({ where: { symbol } });

        console.log(`  ✅ ${symbol} odstránený:`);
        console.log(`     Redis: universe:sp500=${removedSp500 > 0}, universe:pmp=${removedPmp > 0}`);
        console.log(`     DB: SessionPrice=${spDel.count}, DailyRef=${drDel.count}, MoverEvent=${meDel.count}`);

      } catch (err: any) {
        console.error(`  ❌ ${symbol}: chyba pri odstraňovaní – ${err.message}`);
      }
    }
  }

  // 6. Reset changePct pre aktívne tickery s anomálnou hodnotou
  if (active.length > 0) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`🔄 Resetujem changePct pre ${active.length} aktívnych tickerov s anomálnou hodnotou...\n`);

    for (const symbol of active) {
      try {
        await prisma.ticker.update({
          where: { symbol },
          data: { lastChangePct: 0, latestPrevClose: null, latestPrevCloseDate: null }
        });
        // Vymaž z heatmap – bude opravený pri ďalšom ingest-e
        for (const session of ['pre', 'live', 'after']) {
          await redis.zRem(`heatmap:${session}`, symbol);
        }
        console.log(`  ✅ ${symbol}: changePct resetovaný na 0, prevClose vymazaný (bude opravený pri ingest-e)`);
      } catch (err: any) {
        console.error(`  ❌ ${symbol}: ${err.message}`);
      }
    }
  }

  await redis.disconnect();
  await prisma.$disconnect();

  console.log(`\n${'='.repeat(65)}`);
  console.log(`✅ HOTOVO`);
  console.log(`  Odstránených delistovaných: ${delisted.length}`);
  console.log(`  Resetovaných aktívnych: ${active.length}`);
  console.log('='.repeat(65));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

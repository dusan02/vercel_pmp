/**
 * diagnose_prevclose.ts
 * 
 * Diagnostický skript pre abnormálne % change hodnoty.
 * Skontroluje stav prevClose v Redis aj DB a nájde problematické tickery.
 * 
 * Spustenie: npx ts-node --project tsconfig.scripts.json tmp/diagnose_prevclose.ts
 */

import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDateET(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

function getLastTradingDayYMD(beforeDateYMD: string): string {
  const d = new Date(beforeDateYMD + 'T12:00:00Z');
  while (true) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay(); // 0=Sun,6=Sat (in UTC noon, safe for ET midnight check)
    if (dow !== 0 && dow !== 6) {
      return d.toISOString().slice(0, 10);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const todayYMD = getDateET();
  const expectedPrevYMD = getLastTradingDayYMD(todayYMD);

  console.log('\n' + '='.repeat(70));
  console.log('🔍 DIAGNÓZA ABNORMÁLNYCH % CHANGE');
  console.log('='.repeat(70));
  console.log(`📅 Dnešný dátum (ET): ${todayYMD}`);
  console.log(`📅 Očakávaný prevClose dátum: ${expectedPrevYMD}`);

  // ── 1. Redis prevClose audit ─────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('1️⃣  REDIS prevClose CACHE');
  console.log('─'.repeat(60));

  const prevClosePattern = `prevclose:${todayYMD}:*`;
  const prevCloseKeys: string[] = [];
  for await (const key of redis.scanIterator({ MATCH: prevClosePattern, COUNT: 500 })) {
    prevCloseKeys.push(key);
  }

  console.log(`Nájdené prevClose kľúče pre ${todayYMD}: ${prevCloseKeys.length}`);

  if (prevCloseKeys.length === 0) {
    console.log('❌ KRITICKÉ: Žiadne prevClose kľúče v Redis pre dnešok!');
    console.log('   → Toto je priama príčina 0% changePct počas ingesta');
    console.log('   → Z DB sa načítajú staré stale hodnoty (napr. +999.99%)');

    // Skús aj predchádzajúci deň
    const prevPattern = `prevclose:${expectedPrevYMD}:*`;
    const prevKeys: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: prevPattern, COUNT: 200 })) {
      prevKeys.push(key);
    }
    console.log(`   Kľúče pre ${expectedPrevYMD}: ${prevKeys.length}`);
  } else {
    // Namátkovo skontroluj 5 hodnôt
    const sample = prevCloseKeys.slice(0, 5);
    console.log('Vzorka prevClose hodnôt:');
    for (const key of sample) {
      const val = await redis.get(key);
      const symbol = key.split(':').pop();
      console.log(`  ${symbol}: ${val}`);
    }
  }

  // Prever aktuálne TTL
  if (prevCloseKeys.length > 0) {
    const sampleKey = prevCloseKeys[0];
    if (sampleKey) {
      const ttl = await redis.ttl(sampleKey);
      console.log(`TTL vzorky (${sampleKey}): ${ttl}s (${(ttl / 3600).toFixed(1)}h)`);
    }
  }

  // ── 2. DB DailyRef audit ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('2️⃣  DB DailyRef (previousClose) AUDIT');
  console.log('─'.repeat(60));

  const todayDate = new Date(todayYMD + 'T05:00:00Z'); // ET midnight approx
  const prevDate = new Date(expectedPrevYMD + 'T05:00:00Z');

  const todayRefs = await prisma.dailyRef.count({ where: { date: todayDate, previousClose: { gt: 0 } } });
  const prevRefs = await prisma.dailyRef.count({ where: { date: prevDate, previousClose: { gt: 0 } } });

  console.log(`DailyRef záznamy pre ${todayYMD} (previousClose > 0): ${todayRefs}`);
  console.log(`DailyRef záznamy pre ${expectedPrevYMD} (previousClose > 0): ${prevRefs}`);

  if (todayRefs === 0) {
    console.log('❌ Žiadne DailyRef pre dnešok → bootstrap nebol spustený alebo zlyhal');
  }

  // ── 3. Ticker.latestPrevCloseDate audit ─────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('3️⃣  Ticker.latestPrevClose AUDIT');
  console.log('─'.repeat(60));

  const dateCounts = await prisma.$queryRaw<{ ymd: string; cnt: bigint }[]>`
    SELECT TO_CHAR("latestPrevCloseDate", 'YYYY-MM-DD') as ymd, COUNT(*) as cnt
    FROM "Ticker"
    WHERE "latestPrevCloseDate" IS NOT NULL
    GROUP BY ymd
    ORDER BY cnt DESC
    LIMIT 10
  `.catch(async () => {
    // Fallback pre SQLite
    return prisma.$queryRaw<{ ymd: string; cnt: bigint }[]>`
      SELECT strftime('%Y-%m-%d', "latestPrevCloseDate") as ymd, COUNT(*) as cnt
      FROM "Ticker"
      WHERE "latestPrevCloseDate" IS NOT NULL
      GROUP BY ymd
      ORDER BY cnt DESC
      LIMIT 10
    `;
  });

  console.log('Rozdelenie latestPrevCloseDate:');
  for (const row of dateCounts) {
    const isExpected = row.ymd === expectedPrevYMD;
    const isStale = row.ymd < expectedPrevYMD;
    const marker = isExpected ? '✅' : (isStale ? '❌ STALE' : '⚠️');
    console.log(`  ${marker} ${row.ymd}: ${row.cnt} tickerov`);
  }

  // ── 4. Anomálne tickery ──────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('4️⃣  ANOMÁLNE TICKERY (|changePct| > 100%)');
  console.log('─'.repeat(60));

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
      lastPriceUpdated: true,
    },
    orderBy: { lastChangePct: 'desc' },
    take: 20,
  });

  if (anomalous.length === 0) {
    console.log('✅ Žiadne anomálne tickery v DB');
  } else {
    console.log(`Nájdených ${anomalous.length} anomálnych tickerov:`);
    console.log('Symbol  |  Price  |  ChangePct  |  PrevClose  |  PrevCloseDate  |  LastUpdated');
    console.log('-'.repeat(90));
    for (const t of anomalous) {
      const dateStr = t.latestPrevCloseDate?.toISOString().slice(0, 10) ?? 'NULL';
      const updStr = t.lastPriceUpdated?.toISOString().slice(0, 16) ?? 'NULL';
      const calcPct = t.latestPrevClose && t.latestPrevClose > 0
        ? (((t.lastPrice / t.latestPrevClose) - 1) * 100).toFixed(2) + '%'
        : 'N/A (no prevClose)';
      console.log(
        `${t.symbol.padEnd(8)} | ${String(t.lastPrice.toFixed(2)).padStart(7)} | ${String(t.lastChangePct?.toFixed(2) ?? '?').padStart(11)}% | ${String(t.latestPrevClose?.toFixed(2) ?? 'NULL').padStart(11)} | ${dateStr.padEnd(15)} | ${updStr}`
      );
      console.log(`  → Reálny % (price/prevClose): ${calcPct}`);
    }
  }

  // ── 5. Redis heatmap stav ────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('5️⃣  REDIS HEATMAP (anomálne skóre)');
  console.log('─'.repeat(60));

  for (const session of ['pre', 'live', 'after'] as const) {
    const heatmapKey = `heatmap:${session}`;
    const top5 = await redis.zRangeWithScores(heatmapKey, 0, 4, { REV: true });
    if (top5.length > 0) {
      console.log(`\nTop 5 gainers v heatmap:${session}:`);
      for (const item of top5) {
        const pct = (item.score / 10000).toFixed(2);
        const flag = Math.abs(item.score / 10000) > 100 ? ' ← ANOMÁLIA!' : '';
        console.log(`  ${item.value}: ${pct}%${flag}`);
      }
    }
  }

  // ── 6. Záver a odporúčania ───────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('📋 ZÁVER A ODPORÚČANIA');
  console.log('='.repeat(70));

  if (prevCloseKeys.length === 0) {
    console.log(`
❌ ROOT CAUSE POTVRDENÝ: Redis nemá prevClose pre ${todayYMD}

OKAMŽITÁ OPRAVA:
  Spustiť bootstrap: npx ts-node scripts/fix-anomalous-data.ts
  alebo volať API: POST /api/cron/post-market-reset (manuálne)
  
DLHODOBÁ OPRAVA:
  Opraviť logiku v polygonWorker.ts (pozri implementation_plan.md)
`);
  } else if (anomalous.length > 0) {
    console.log(`
⚠️ Redis má prevClose (${prevCloseKeys.length} kľúčov), ale DB má anomálne hodnoty.
   → Pravdepodobne stale DB hodnoty neboli prepísané pri minulom ingeste.

OKAMŽITÁ OPRAVA:
  Spustiť force re-ingest pre anomálne tickery.
`);
  } else {
    console.log('✅ Všetko vyzerá OK v tomto momente.');
  }

  await redis.disconnect();
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

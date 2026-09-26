/**
 * Repair DailyValuationHistory for renamed tickers.
 *
 * Background:
 * - syncValuationHistory fetches Polygon aggs under the CURRENT symbol.
 *   When a company changed its ticker (FB→META, FISV→FI, BK→BNY,
 *   IIVI→COHR, SSUN→QXO), rows before the rename contain whatever
 *   traded under that symbol at the time — usually a different
 *   instrument (META rows 2021→2022-01 hold the ~$15 Metaverse ETF,
 *   not Meta Platforms). closePrice, marketCap and all four multiples
 *   are consistently wrong, polluting charts AND percentile stats.
 *
 * Modes:
 *   --symbol=X --source=OLD --from=D --to=D   Rewrite rows in window
 *     using OLD ticker's real Polygon closes; recompute multiples on the
 *     TTM basis (same math as repair-valuation-history-ttm.ts).
 *   --symbol=X --from=D --to=D --delete       Drop foreign-instrument
 *     rows (no old ticker exists — e.g. FIG, SAIL pre-IPO collisions).
 *
 * Usage:
 *   npx tsx scripts/repair-renamed-ticker-history.ts --symbol=META --source=FB --from=2021-01-01 --to=2022-06-08 [--dry-run]
 *   npx tsx scripts/repair-renamed-ticker-history.ts --symbol=FIG --from=2020-01-01 --to=2025-07-30 --delete [--dry-run]
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { computeTTMAtDate } from '../src/lib/utils/ttm';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

const dryRun = process.argv.includes('--dry-run');
const doDelete = process.argv.includes('--delete');
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
const SYMBOL = arg('symbol')?.toUpperCase() ?? null;
const SOURCE = arg('source')?.toUpperCase() ?? null;
const FROM = arg('from');
const TO = arg('to');

if (!SYMBOL || !FROM || !TO || (!doDelete && !SOURCE)) {
    console.error('Usage: --symbol=X (--source=OLD|--delete) --from=YYYY-MM-DD --to=YYYY-MM-DD [--dry-run]');
    process.exit(1);
}
if (!doDelete && !POLYGON_API_KEY) { console.error('Missing POLYGON_API_KEY'); process.exit(1); }

function multiplesFor(closePrice: number, stmts: any[], date: Date) {
    const ttm = computeTTMAtDate(stmts, date);
    const before = stmts.filter(s => s.endDate.getTime() <= date.getTime());
    const stmt = before[0] || stmts[stmts.length - 1];
    if (!stmt?.sharesOutstanding) return null;
    const marketCap = closePrice * stmt.sharesOutstanding;
    const ni = ttm.netIncome ?? stmt.netIncome;
    const rev = ttm.revenue ?? stmt.revenue;
    const ebit = ttm.ebit ?? stmt.ebit;
    const ocf = ttm.operatingCashFlow ?? stmt.operatingCashFlow;
    const capex = ttm.capex ?? stmt.capex;
    return {
        marketCap,
        peRatio: ni && ni > 0 ? closePrice / (ni / stmt.sharesOutstanding) : null,
        psRatio: rev && rev > 0 ? closePrice / (rev / stmt.sharesOutstanding) : null,
        evEbitda: ebit && ebit > 0 && stmt.totalDebt !== null && stmt.cashAndEquivalents !== null
            ? (marketCap + stmt.totalDebt - stmt.cashAndEquivalents) / ebit : null,
        fcfYield: ocf !== null && capex !== null ? (ocf - Math.abs(capex)) / marketCap : null,
    };
}

async function main() {
    const from = new Date(FROM + 'T00:00:00Z');
    const to = new Date(TO + 'T00:00:00Z');

    if (doDelete) {
        let doomed = await prisma.dailyValuationHistory.findMany({
            where: { symbol: SYMBOL, date: { gte: from, lte: to } },
            select: { id: true, date: true, closePrice: true },
            orderBy: { date: 'asc' },
        });
        // Stray-aware delete: with --source, only drop rows whose date the
        // old ticker did NOT trade (keeps rows already rewritten correctly).
        if (SOURCE) {
            const url = `https://api.polygon.io/v2/aggs/ticker/${SOURCE}/range/1/day/${FROM}/${TO}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
            const res = await fetch(url);
            const srcDates = new Set(((await res.json()).results ?? []).map((r: any) => r.t));
            doomed = doomed.filter(r => !srcDates.has(r.date.getTime()));
            console.log(`[repair] source ${SOURCE} covers ${srcDates.size} dates — those rows kept`);
        }
        console.log(`[repair] ${SYMBOL}: ${doomed.length} foreign rows ${FROM}→${TO} ${dryRun ? '(dry-run)' : 'to delete'}`);
        if (doomed.length > 0) {
            console.log(`  first: ${doomed[0]!.date.toISOString().slice(0, 10)} $${doomed[0]!.closePrice}  last: ${doomed[doomed.length - 1]!.date.toISOString().slice(0, 10)} $${doomed[doomed.length - 1]!.closePrice}`);
        }
        if (!dryRun && doomed.length > 0) {
            await dbWrite(() => prisma.dailyValuationHistory.deleteMany({ where: { id: { in: doomed.map(r => r.id) } } }));
            console.log(`[repair] deleted ${doomed.length}`);
        }
        return;
    }

    // Fetch the OLD ticker's real daily closes for the window
    const url = `https://api.polygon.io/v2/aggs/ticker/${SOURCE}/range/1/day/${FROM}/${TO}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon ${res.status}: ${await res.text()}`);
    const aggs: { t: number; c: number }[] = (await res.json()).results ?? [];
    console.log(`[repair] ${SOURCE} aggs ${FROM}→${TO}: ${aggs.length} bars`);
    if (aggs.length === 0) { console.warn('Nothing returned — check source ticker/window.'); return; }

    const stmts = await prisma.financialStatement.findMany({
        where: { symbol: SYMBOL! },
        orderBy: { endDate: 'desc' },
    });
    if (stmts.length === 0) console.warn(`[repair] ${SYMBOL}: no statements — multiples stay null`);

    const existing = await prisma.dailyValuationHistory.findMany({
        where: { symbol: SYMBOL!, date: { gte: from, lte: to } },
        select: { date: true, closePrice: true },
    });
    const existingSet = new Set(existing.map(r => r.date.getTime()));
    console.log(`[repair] ${SYMBOL}: ${existing.length} existing rows in window (avg $${(existing.reduce((a, r) => a + (r.closePrice ?? 0), 0) / Math.max(1, existing.length)).toFixed(2)}), ${aggs.length} incoming (avg $${(aggs.reduce((a, r) => a + r.c, 0) / aggs.length).toFixed(2)})`);

    const ops: any[] = [];
    for (const agg of aggs) {
        const date = new Date(agg.t);
        const closePrice = agg.c;
        const m = multiplesFor(closePrice, stmts, date);
        const data = { closePrice, marketCap: m?.marketCap ?? null, peRatio: m?.peRatio ?? null, psRatio: m?.psRatio ?? null, evEbitda: m?.evEbitda ?? null, fcfYield: m?.fcfYield ?? null };
        ops.push(prisma.dailyValuationHistory.upsert({
            where: { symbol_date: { symbol: SYMBOL!, date } },
            update: data,
            create: { symbol: SYMBOL!, date, ...data },
        }));
    }

    const fresh = aggs.filter(a => !existingSet.has(a.t)).length;
    console.log(`[repair] ${ops.length} rows to upsert (${fresh} new, ${ops.length - fresh} rewritten) ${dryRun ? '(dry-run)' : ''}`);
    if (!dryRun) {
        const CHUNK = 500;
        for (let i = 0; i < ops.length; i += CHUNK) {
            await dbWrite(() => prisma.$transaction(ops.slice(i, i + CHUNK)));
        }
        console.log('[repair] done');
    }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

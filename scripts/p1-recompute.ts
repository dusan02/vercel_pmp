/**
 * Phase-1 controlled AnalysisCache recompute — dump / run / gate.
 *
 *   npx tsx scripts/p1-recompute.ts dump /tmp/ac-pre.csv
 *   npx tsx scripts/p1-recompute.ts run          # recomputes the 48 approved tickers
 *   npx tsx scripts/p1-recompute.ts gate /tmp/ac-pre.csv /tmp/ac-post.csv
 *
 * Recompute calls calculateScores(symbol, { skipNotify: true }) — no
 * notifications, no lastQualitySignalAt write, no ISR purge.
 *
 * gate exit codes: 0 = clean, 1 = anomalies (review, do not continue).
 * Diffs EVERY AnalysisCache row — out-of-scope changes are caught too.
 * verdictKey changes are always listed (expected ⊆ the 8 known flips,
 * but price drift can shift valuation legs — eyeball, don't auto-pass).
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();
import { calculateScores } from '@/services/analysis/scoreCalculator';
import { prisma } from '@/lib/db/prisma';
import fs from 'fs';

const TICKERS = [
    'KKR','BX','BAM','APO','ARES','CG','TROW','BN','AIG','JPM','DELL','MSFT',
    'PCAR','FCX','COF','T','PG','GD','HOOD','ABT','JNJ','LNG','ESS','DOCU','KMX','SONO','AHR','AMG','THC','MKL','PINS','PTGX','RRC','CELH',
    'CMG','GRMN','VEEV','AXON','SNOW','GEV','FANG','ROP','ROL','CNH','GMED','MANH','MEDP','ZION',
];
const SCOPE = new Set(TICKERS);

// Verdict flips expected from the final dry-run comparison (v4, Option B).
// Reference, not guarantee — live prices move valuation legs.
const EXPECTED_FLIPS = new Set(['PCAR','COF','T','JNJ','AHR','AMG','THC','CELH']);

// Every writable column EXCEPT: verdictText (normal path never writes it;
// insufficient-data path nulls it — a change here means a ticker lost its
// statements = anomaly) and lastQualitySignalAt (skipNotify guarantees no
// write — any change means notifications were not suppressed).
const SCORE_COLS = [
    'healthScore','profitabilityScore','valuationScore','growthScore',
    'qualityScore','moatScore','overallScore',
    'piotroskiScore','beneishScore','interestCoverage','revenueCagr',
    'netIncomeCagr','altmanZ','debtRepaymentYears','fcfConversion','fcfMargin',
    'marginStability','negativeNiYears','pePercentile','peVsMedian3yPct',
    'fundLevel','valLevel','verdictKey','roic','epsCagr5y','priceToCash',
    'humanDebtInfo','humanPeInfo',
    'rsi14','sma20Pct','sma50Pct','sma200Pct',
    'perf1m','perf3m','perf6m','perfYtd','perf1y',
    'updatedAt',
] as const;
const FORBIDDEN_COLS = ['verdictText','lastQualitySignalAt'] as const;
const ALL_COLS = [...SCORE_COLS, ...FORBIDDEN_COLS] as const;

const PILLARS = ['healthScore','profitabilityScore','valuationScore','growthScore','qualityScore','moatScore','overallScore'];

async function dump(path: string) {
    const rows = await prisma.analysisCache.findMany({
        select: { symbol: true, ...Object.fromEntries(ALL_COLS.map(c => [c, true])) } as any,
        orderBy: { symbol: 'asc' },
    });
    const esc = (v: any) => v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    const lines = ['symbol,' + ALL_COLS.join(',')];
    for (const r of rows) {
        lines.push([r.symbol, ...ALL_COLS.map(c => esc((r as any)[c]))].join(','));
    }
    fs.writeFileSync(path, lines.join('\n'));
    console.log(`dumped ${rows.length} rows -> ${path}`);
}

function readDump(path: string): Map<string, Record<string, string | null>> {
    const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
    const map = new Map<string, Record<string, string | null>>();
    // humanDebtInfo/humanPeInfo are free text and CAN contain commas — naive
    // split(',') shifts the tail columns (updatedAt/verdictText showed up as
    // a false FORBIDDEN change). The 27 leading cols (symbol + 26 scores) and
    // the 12 trailing cols (rsi14..lastQualitySignalAt — numeric/ISO/null,
    // comma-free) are positionally stable; the variable middle is the joined
    // human-info text, compared as one field.
    const HEAD = 27;                    // symbol + 26 score cols
    const TAIL = ALL_COLS.slice(-12);   // rsi14..perf1y, updatedAt, verdictText, lastQualitySignalAt
    const HEAD_COLS = ['symbol', ...ALL_COLS.slice(0, 26)];
    for (const line of lines.slice(1)) {
        const v = line.split(',');
        const r: Record<string, string | null> = {};
        HEAD_COLS.forEach((h, i) => { r[h] = v[i] === '' ? null : v[i]!; });
        TAIL.forEach((h, i) => { r[h] = v[v.length - TAIL.length + i] === '' ? null : v[v.length - TAIL.length + i]!; });
        const mid = v.slice(HEAD, v.length - TAIL.length).join(',');
        r.humanDebtInfo = mid === '' ? null : mid;
        r.humanPeInfo = null; // folded into humanDebtInfo for diff purposes
        map.set(r.symbol!, r);
    }
    return map;
}

async function gate(prePath: string, postPath: string) {
    const pre = readDump(prePath), post = readDump(postPath);
    const anomalies: string[] = [];
    const verdictFlips: string[] = [];
    const pillarDeltas: string[] = [];
    let changedRows = 0, changedFields = 0;

    // Out-of-scope rows.
    for (const [sym, r] of post) {
        if (SCOPE.has(sym)) continue;
        const p = pre.get(sym);
        if (!p) { anomalies.push(`OUT-OF-SCOPE row created: ${sym}`); continue; }
        for (const c of ALL_COLS) {
            if ((p[c] ?? '') !== (r[c] ?? '')) anomalies.push(`OUT-OF-SCOPE change: ${sym}.${c} ${p[c]} -> ${r[c]}`);
        }
    }
    for (const sym of pre.keys()) {
        if (!SCOPE.has(sym) && !post.has(sym)) anomalies.push(`OUT-OF-SCOPE row deleted: ${sym}`);
    }

    // In-scope rows.
    for (const sym of TICKERS) {
        const p = pre.get(sym), r = post.get(sym);
        if (!p && !r) { anomalies.push(`NO CACHE ROW: ${sym} (expected existing AnalysisCache row)`); continue; }
        if (!p) { anomalies.push(`IN-SCOPE row created: ${sym}`); continue; }
        if (!r) { anomalies.push(`IN-SCOPE row deleted: ${sym}`); continue; }
        let rowChanged = false;
        const d: string[] = [];
        for (const c of FORBIDDEN_COLS) {
            if ((p[c] ?? '') !== (r[c] ?? '')) anomalies.push(`FORBIDDEN change: ${sym}.${c} ${p[c]} -> ${r[c]} (skipNotify/normal-path violation)`);
        }
        for (const c of SCORE_COLS) {
            if ((p[c] ?? '') === (r[c] ?? '')) continue;
            rowChanged = true; changedFields++;
            if (c === 'verdictKey') {
                const flag = EXPECTED_FLIPS.has(sym) ? 'expected' : 'UNEXPECTED-FLIP';
                verdictFlips.push(`  ${sym}: ${p[c]} -> ${r[c]} (${flag})`);
                if (!EXPECTED_FLIPS.has(sym)) anomalies.push(`UNEXPECTED VERDICT FLIP: ${sym} ${p[c]} -> ${r[c]}`);
            } else if (c !== 'updatedAt' && !c.startsWith('perf') && !c.startsWith('sma') && c !== 'rsi14') {
                d.push(`${c} ${p[c]}->${r[c]}`);
            }
        }
        if (d.length) pillarDeltas.push(`  ${sym}: ${d.join(', ')}`);
        if (rowChanged) changedRows++;
    }

    // Missing expected flips are informational — price drift or fresher
    // inputs can legitimately keep a verdict in place.
    const flippedSet = new Set(verdictFlips.map(v => v.trim().split(':')[0]));
    const missing = [...EXPECTED_FLIPS].filter(s => !flippedSet.has(s));
    if (missing.length) console.log(`note: expected flips that did NOT occur: ${missing.join(', ')} (price/leg drift — review)`);

    console.log(`\n=== RECOMPUTE GATE ===`);
    console.log(`changed rows (in-scope): ${changedRows}/${TICKERS.length}; changed fields: ${changedFields}`);
    console.log(`verdict flips: ${verdictFlips.length}`); verdictFlips.forEach(x => console.log(x));
    console.log(`pillar/metric deltas: ${pillarDeltas.length} tickers`);
    pillarDeltas.slice(0, 50).forEach(x => console.log(x));
    if (anomalies.length === 0) { console.log('ANOMALIES: 0 — PASS'); process.exitCode = 0; }
    else {
        console.log(`ANOMALIES: ${anomalies.length} — REVIEW REQUIRED, no auto-repair`);
        anomalies.slice(0, 100).forEach(x => console.log('  ' + x));
        process.exitCode = 1;
    }
}

async function run() {
    let done = 0;
    for (const s of TICKERS) {
        const t0 = Date.now();
        try {
            await calculateScores(s, { skipNotify: true });
            done++;
            console.log(`[${s}] ok ${((Date.now() - t0) / 1000).toFixed(1)}s (${done}/${TICKERS.length})`);
        } catch (e) {
            console.log(`[${s}] FAIL after ${done}/${TICKERS.length}: ${(e as Error).message?.slice(0, 200)}`);
            console.log(`ABORTING — ${done} tickers recomputed. Run 'gate' on partial state to evaluate.`);
            process.exitCode = 1;
            return;
        }
    }
    console.log(`RUN COMPLETE: ${done}/${TICKERS.length} tickers recomputed — now dump+gate.`);
}

const [cmd, a1, a2] = process.argv.slice(2);
(async () => {
    if (cmd === 'dump') await dump(a1!);
    else if (cmd === 'run') await run();
    else if (cmd === 'gate') await gate(a1!, a2!);
    else { console.log('usage: p1-recompute.ts dump|run|gate'); process.exit(2); }
    // scoreCalculator -> NotificationService pulls in nodemailer/webpush
    // handles that keep the event loop alive after disconnect — force exit
    // once the command's work is done (output already flushed above).
    await prisma.$disconnect().catch(() => {});
    process.exit(process.exitCode ?? 0);
})();

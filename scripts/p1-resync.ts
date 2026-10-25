/**
 * Phase-1 controlled resync tooling — dump / run / gate.
 *
 *   npx tsx scripts/p1-resync.ts dump /tmp/fs-pre.csv
 *   npx tsx scripts/p1-resync.ts run          # resyncs the 48 approved tickers
 *   npx tsx scripts/p1-resync.ts gate /tmp/fs-pre.csv /tmp/fs-post.csv
 *
 * gate exit codes: 0 = clean (only allowed changes), 1 = anomalies (review).
 * The gate diffs EVERY FinancialStatement row in the DB — including symbols
 * outside the approved set — so any out-of-scope write is caught, not just
 * field-level drift inside the 48.
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();
import { syncFinancials } from '@/services/analysis/financialsSync';
import { prisma } from '@/lib/db/prisma';
import fs from 'fs';

const TICKERS = [
    'KKR','BX','BAM','APO','ARES','CG','TROW','BN','AIG','JPM','DELL','MSFT',
    'PCAR','FCX','COF','T','PG','GD','HOOD','ABT','JNJ','LNG','ESS','DOCU','KMX','SONO','AHR','AMG','THC','MKL','PINS','PTGX','RRC','CELH',
    'CMG','GRMN','VEEV','AXON','SNOW','GEV','FANG','ROP','ROL','CNH','GMED','MANH','MEDP','ZION',
];
const SCOPE = new Set(TICKERS);

// Expected null→filled counts per ticker from the v1→v4 local validation —
// reference values, NOT guarantees. >±20% deviation → manual review flag.
const EXPECTED_FILLS: Record<string, number> = {
    ABT:27, AHR:40, AMG:86, APO:21, ARES:52, AXON:36, BAM:7, BX:46, CELH:32,
    CG:27, CMG:36, CNH:48, COF:49, DELL:32, DOCU:57, ESS:72, FANG:38, FCX:21,
    GD:58, GEV:32, GMED:30, GRMN:34, HOOD:60, JNJ:36, JPM:9, KKR:98, KMX:43,
    LNG:26, MANH:38, MEDP:37, MKL:37, PCAR:55, PG:37, PINS:36, PTGX:69,
    ROL:31, ROP:37, RRC:58, SNOW:39, SONO:48, T:58, THC:65, TROW:126, VEEV:48,
    ZION:41,
    AIG:0, BN:0, MSFT:0, // validated tickers with no expected fills
};

const FIELDS = [
    'revenue','netIncome','ebit','grossProfit','operatingCashFlow','capex',
    'totalAssets','totalLiabilities','currentAssets','currentLiabilities',
    'retainedEarnings','totalEquity','sharesOutstanding','sbc','interestExpense',
    'totalDebt','cashAndEquivalents','netPPE',
] as const;

type Row = Record<string, any> & { symbol: string; fiscalYear: number; fiscalPeriod: string };

async function dump(path: string) {
    const rows = await prisma.financialStatement.findMany({
        select: {
            symbol: true, fiscalYear: true, fiscalPeriod: true, endDate: true,
            ...Object.fromEntries(FIELDS.map(f => [f, true])),
        } as any,
        orderBy: [{ symbol: 'asc' }, { fiscalYear: 'asc' }, { fiscalPeriod: 'asc' }],
    });
    const esc = (v: any) => v === null || v === undefined ? '' : String(v);
    const lines = ['symbol,fiscalYear,fiscalPeriod,endDate,' + FIELDS.join(',')];
    for (const r of rows) {
        lines.push([r.symbol, r.fiscalYear, r.fiscalPeriod, (r.endDate as Date)?.toISOString?.().slice(0, 10) ?? '', ...FIELDS.map(f => esc((r as any)[f]))].join(','));
    }
    fs.writeFileSync(path, lines.join('\n'));
    console.log(`dumped ${rows.length} rows -> ${path}`);
}

function readDump(path: string): Map<string, Row> {
    const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
    const hdr = lines[0]!.split(',');
    const map = new Map<string, Row>();
    for (const line of lines.slice(1)) {
        const v = line.split(',');
        const r: any = {};
        hdr.forEach((h, i) => { r[h] = v[i] === '' ? null : v[i]; });
        map.set(`${r.symbol}|${r.fiscalYear}|${r.fiscalPeriod}`, r as Row);
    }
    return map;
}

async function gate(prePath: string, postPath: string) {
    const pre = readDump(prePath), post = readDump(postPath);
    const anomalies: string[] = [];
    const fills = new Map<string, number>();
    const allowedFilled: string[] = [];
    const newRows: string[] = [];

    // Out-of-scope: any row created/deleted/changed for a non-approved symbol.
    for (const [k, r] of post) {
        if (!SCOPE.has(r.symbol) && !pre.has(k)) anomalies.push(`OUT-OF-SCOPE row created: ${k}`);
    }
    for (const [k, r] of pre) {
        if (!SCOPE.has(r.symbol) && !post.has(k)) anomalies.push(`OUT-OF-SCOPE row deleted: ${k}`);
        if (!SCOPE.has(r.symbol) && post.has(k)) {
            for (const f of FIELDS) {
                if (String(r[f] ?? '') !== String(post.get(k)![f] ?? ''))
                    anomalies.push(`OUT-OF-SCOPE field change: ${k} ${f} ${r[f]} -> ${post.get(k)![f]}`);
            }
        }
    }

    // In-scope rows.
    for (const [k, r] of post) {
        if (!SCOPE.has(r.symbol)) continue;
        const p = pre.get(k);
        if (!p) { newRows.push(k); continue; }
        for (const f of FIELDS) {
            const a = p[f] as any, b = r[f] as any;
            if (String(a ?? '') === String(b ?? '')) continue;
            if (a === null && b !== null) {
                fills.set(r.symbol, (fills.get(r.symbol) ?? 0) + 1);
            } else if (a !== null && b === null) {
                anomalies.push(`FILLED->NULL: ${k} ${f} ${a} -> null`);
            } else if (f === 'ebit') {
                // Zero tolerance: ANY existing-ebit change is an anomaly —
                // expected count is 0; a reported restatement is the only
                // legitimate cause and must be eyeballed, not auto-passed.
                anomalies.push(`EBIT CHANGE: ${k} ${a} -> ${b} (expected 0 — review required)`);
            } else {
                // Non-ebit filled->filled: only the two documented repair
                // classes are expected (negative-capex fix, suspicious-shares).
                const capexFix = f === 'capex' && Number(a) < 0 && Number(b) >= 0;
                const sharesFix = f === 'sharesOutstanding';
                if (capexFix || sharesFix) allowedFilled.push(`${k} ${f}: ${a} -> ${b} (${capexFix ? 'capex<0 repair' : 'shares repair — VERIFY vs isSuspiciousShareCount'})`);
                else anomalies.push(`UNEXPECTED field change: ${k} ${f} ${a} -> ${b}`);
            }
        }
    }
    for (const [k] of pre) {
        if (SCOPE.has(k.split('|')[0]!) && !post.has(k)) anomalies.push(`IN-SCOPE row deleted: ${k}`);
    }

    // Deviation check vs expected fills (reference, not guarantee).
    for (const s of SCOPE) {
        const got = fills.get(s) ?? 0, exp = EXPECTED_FILLS[s];
        if (exp === undefined) continue;
        const lo = exp * 0.8, hi = exp * 1.2;
        if (got < lo || got > hi) {
            anomalies.push(`DEVIATION>±20%: ${s} fills=${got} expected≈${exp} — stop & review (payload variance vs genuine anomaly)`);
        }
    }

    console.log(`\n=== GATE RESULT ===`);
    console.log(`new in-scope rows: ${newRows.length} ${newRows.join(', ')}`);
    console.log(`null->filled: ${[...fills.values()].reduce((a, b) => a + b, 0)} across ${fills.size} tickers`);
    console.log(`allowed repairs: ${allowedFilled.length}`); allowedFilled.forEach(x => console.log('  ' + x));
    if (anomalies.length === 0) { console.log('ANOMALIES: 0 — PASS'); process.exitCode = 0; }
    else {
        console.log(`ANOMALIES: ${anomalies.length} — REVIEW REQUIRED`);
        anomalies.slice(0, 100).forEach(x => console.log('  ' + x));
        process.exitCode = 1;
    }
}

async function run() {
    let done = 0;
    for (const s of TICKERS) {
        const t0 = Date.now();
        try {
            await syncFinancials(s);
            done++;
            console.log(`[${s}] ok ${((Date.now() - t0) / 1000).toFixed(1)}s (${done}/${TICKERS.length})`);
        } catch (e) {
            // Abort the whole operation on the first failure — never leave an
            // ambiguous "some tickers synced, rest unknown" state. The gate
            // is a separate step and still diffs the partial result.
            console.log(`[${s}] FAIL after ${done}/${TICKERS.length}: ${(e as Error).message?.slice(0, 200)}`);
            console.log(`ABORTING — ${done} tickers synced before failure. Run 'gate' on the partial state to evaluate, do not continue blindly.`);
            process.exitCode = 1;
            return;
        }
    }
    console.log(`RUN COMPLETE: ${done}/${TICKERS.length} tickers synced — now run dump+gate.`);
}

const [cmd, a1, a2] = process.argv.slice(2);
(async () => {
    if (cmd === 'dump') await dump(a1!);
    else if (cmd === 'run') await run();
    else if (cmd === 'gate') await gate(a1!, a2!);
    else { console.log('usage: p1-resync.ts dump|run|gate'); process.exit(2); }
    await prisma.$disconnect();
})();

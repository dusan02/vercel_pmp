/**
 * Phase-1 dry-run comparison report — three states, no writes.
 *
 *   stored      → existing AnalysisCache columns (write-path output)
 *   legacyRead  → simulated OLD read path: live inputs mixed with cached
 *                 AnalysisCache fields (the bug being fixed)
 *   newShared   → derivePillarInputs() on the same DB inputs
 *
 * Delta attribution:
 *   interest-selection   interestCoverage changed by annual-first row choice
 *   missing-tag-recovery with --extract-sim: re-derives after patching
 *                        interestExpense via the widened XBRL tag list
 *                        (InterestExpenseNonoperating/Operating/InterestPaidNet)
 *   window-bound         fields that change when the write path's old
 *                        unbounded take:120 set is reduced to endDate >= 10y
 *   live-vs-cached-mix   legacyRead ≠ newShared on inputs read from cache
 *
 * Usage:
 *   DATABASE_URL=file:/tmp/pmp-snapshot.db npx tsx scripts/compare-pillar-derivation.ts
 *   DATABASE_URL=... npx tsx ... --symbols=KKR,BX,MSFT
 *   DATABASE_URL=... npx tsx ... --extract-sim          # + Finnhub fetch per symbol (slow)
 *   DATABASE_URL=... npx tsx ... --csv=/tmp/report.csv
 */
import { loadEnvFromFiles } from './_utils/loadEnv';
loadEnvFromFiles();

import { prisma } from '@/lib/db/prisma';
import { derivePillarInputs, selectInterestCoverage, type PillarStmt } from '@/services/analysis/pillarInputs';
import { computePillars, type PillarInputs } from '@/services/analysis/pillars';
import { isAnnualPeriod } from '@/lib/utils/ttm';
import { isPeDistorted } from '@/lib/analysis/peDistortion';
import { classifyVerdict } from '@/lib/analysis/verdict';
import { applySplitAdjustments, applyPostSplitAdjustment } from '@/lib/utils/splitAdjustment';
import * as fs from 'fs';

const args = process.argv.slice(2);
const optSymbols = args.find(a => a.startsWith('--symbols='))?.split('=')[1]?.split(',').map(s => s.trim().toUpperCase());
const extractSim = args.includes('--extract-sim');
const csvPath = args.find(a => a.startsWith('--csv='))?.split('=')[1] ?? null;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

const REQUIRED = ['KKR', 'BX', 'BAM', 'APO', 'ARES', 'CG', 'TROW', 'BN', 'AIG', 'JPM', 'DELL', 'MSFT'];

// ── Widened interest-expense extraction (mirror of financialsSync change) ───
function extractTag(report: any, section: 'ic' | 'bs' | 'cf', names: string[]): number | null {
    const arr = report?.[section];
    if (!Array.isArray(arr)) return null;
    for (const name of names) {
        const hit = arr.find((c: any) => c.concept === name);
        const v = hit?.value;
        if (v != null && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}
function widenedInterestExpense(report: any): number | null {
    return extractTag(report, 'ic', [
        'us-gaap_InterestExpense', 'us-gaap_InterestExpenseDebt',
        'us-gaap_InterestExpenseNonoperating', 'us-gaap_InterestExpenseOperating',
    ]) ?? extractTag(report, 'cf', ['us-gaap_InterestPaidNet']);
}

async function fetchWidenedInterest(symbol: string): Promise<Map<string, number | null> | null> {
    if (!FINNHUB_API_KEY) return null;
    try {
        const res = await fetch(`https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=annual&token=${FINNHUB_API_KEY}`);
        if (!res.ok) return null;
        const data = await res.json();
        const map = new Map<string, number | null>();
        for (const item of data.data ?? []) {
            map.set(`FY:${item.year}`, widenedInterestExpense(item.report));
        }
        return map;
    } catch { return null; }
}

/** Reproduce the OLD read-path pillarsInput: live values + cached fields. */
function legacyReadInput(cached: any, d: ReturnType<typeof derivePillarInputs>, stmts: PillarStmt[], finnhubMetrics: any): PillarInputs {
    const legacyIcStmt = stmts.find(s => s.ebit != null && s.interestExpense != null && s.interestExpense !== 0);
    const legacyIc = legacyIcStmt
        ? legacyIcStmt.ebit! / Math.abs(legacyIcStmt.interestExpense!)
        : (finnhubMetrics?.interestCoverage ?? null);
    const stats = d.valuationHistoryStats;
    const distorted = isPeDistorted(stats?.pe.current ?? null, stats?.pe.median ?? null);
    return {
        pePercentile: distorted ? null : (stats?.pe.percentile ?? null),
        fcfYield: d.currentFcfYield ?? d.latestValuation?.fcfYield ?? null,
        psRatio: d.currentPs ?? finnhubMetrics?.psRatio ?? null,
        evEbit: d.currentEvEbit,
        revenueCagr: cached.revenueCagr ?? null,
        netIncomeCagr: cached.netIncomeCagr ?? null,
        epsCagr5y: d.epsCagr5y,
        forwardImpliedGrowth: d.forwardImpliedGrowth,
        roic: d.roic,
        roe: d.pillarsInput.roe,
        netMargin: d.pillarsInput.netMargin,
        operatingMargin: d.pillarsInput.operatingMargin,
        altmanZ: cached.altmanZ ?? null,
        currentRatio: d.pillarsInput.currentRatio,
        interestCoverage: legacyIc,
        netCash: d.pillarsInput.netCash,
        debtRatio: d.pillarsInput.debtRatio,
        piotroski: cached.piotroskiScore ?? null,
        beneish: cached.beneishScore ?? null,
        fcfConversion: d.fcfConversion ?? cached.fcfConversion ?? null,
        marginStability: d.marginStability ?? cached.marginStability ?? null,
        moatRoicDurability: d.moatDerived.roicDurability,
        moatGmMedian: d.moatDerived.gmMedian,
        moatFcfDurability: d.moatDerived.fcfDurability,
        moatMarginFloor: d.moatDerived.marginFloor,
    };
}

const INPUT_LABELS: [keyof PillarInputs, string][] = [
    ['pePercentile', 'pePercentile'], ['fcfYield', 'fcfYield'], ['psRatio', 'psRatio'], ['evEbit', 'evEbit'],
    ['revenueCagr', 'revenueCagr'], ['netIncomeCagr', 'netIncomeCagr'], ['epsCagr5y', 'epsCagr5y'],
    ['forwardImpliedGrowth', 'forwardImpliedGrowth'],
    ['roic', 'roic'], ['roe', 'roe'], ['netMargin', 'netMargin'], ['operatingMargin', 'operatingMargin'],
    ['altmanZ', 'altmanZ'], ['currentRatio', 'currentRatio'], ['interestCoverage', 'interestCoverage'],
    ['netCash', 'netCash'], ['debtRatio', 'debtRatio'],
    ['piotroski', 'piotroskiScore'], ['beneish', 'beneishScore'], ['fcfConversion', 'fcfConversion'],
    ['marginStability', 'marginStability'],
];

const close = (a: unknown, b: unknown) => {
    if (a == null && b == null) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < Math.max(1e-6, Math.abs(b) * 1e-6);
    return a === b;
};

interface Row {
    symbol: string;
    sector: string | null;
    stored: Record<string, unknown>;
    legacyPillars: Record<string, number> | null;
    newPillars: Record<string, number>;
    storedVerdict: string | null;
    legacyVerdict: string | null;
    newVerdict: string | null;
    storedOverall: number | null;
    legacyOverall: number | null;
    newOverall: number | null;
    legDiffs: string[];        // leg-level point changes legacy→new
    diffs: string[];           // "field: old→new (cause)"
    causes: Set<string>;
    inputDiffs: string[];      // legacy-vs-new input diffs
}

async function analyze(symbol: string): Promise<Row | null> {
    const cached: any = await prisma.analysisCache.findUnique({ where: { symbol } });
    const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { sector: true, lastPrice: true, lastMarketCap: true, sharesOutstanding: true },
    });

    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const stmts = await prisma.financialStatement.findMany({
        where: { symbol, endDate: { gte: tenYearsAgo } },
        orderBy: { endDate: 'desc' },
    }) as unknown as PillarStmt[];
    const stmtsAll = await prisma.financialStatement.findMany({
        where: { symbol },
        orderBy: { endDate: 'desc' },
        take: 120,
    }) as unknown as PillarStmt[];
    const windowDropped = stmtsAll.length - stmts.length;

    const valuationRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol },
        orderBy: { date: 'asc' },
        select: { date: true, closePrice: true, marketCap: true, peRatio: true, psRatio: true, evEbitda: true, fcfYield: true },
    });
    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    try {
        await applySplitAdjustments(stmts as never, symbol, tenYearsAgo);
        applyPostSplitAdjustment(stmts as never, ticker?.sharesOutstanding ?? null);
        if (stmtsAll !== stmts) {
            await applySplitAdjustments(stmtsAll as never, symbol, tenYearsAgo);
            applyPostSplitAdjustment(stmtsAll as never, ticker?.sharesOutstanding ?? null);
        }
    } catch { /* non-critical */ }

    const tickerData = ticker
        ? { lastPrice: ticker.lastPrice ?? null, lastMarketCap: ticker.lastMarketCap ?? null, sharesOutstanding: ticker.sharesOutstanding ?? null }
        : null;

    const causes = new Set<string>();
    const diffs: string[] = [];
    const inputDiffs: string[] = [];

    const d = derivePillarInputs({ stmts, tickerData, finnhubMetrics, valuationRows });

    // ── window-bound probe: same derivation over the old unbounded set ──
    if (windowDropped > 0) {
        const dUnbounded = derivePillarInputs({ stmts: stmtsAll, tickerData, finnhubMetrics, valuationRows });
        for (const [k, label] of INPUT_LABELS) {
            if (!close(dUnbounded.pillarsInput[k], d.pillarsInput[k])) {
                causes.add('window-bound');
                diffs.push(`${label}: unbounded=${JSON.stringify(dUnbounded.pillarsInput[k])} → 10y=${JSON.stringify(d.pillarsInput[k])} (window-bound)`);
            }
        }
        for (const pk of ['health', 'moat', 'growth', 'quality', 'profitability', 'valuation'] as const) {
            if (dUnbounded.pillars[pk].score !== d.pillars[pk].score)
                diffs.push(`pillar.${pk}: ${dUnbounded.pillars[pk].score} → ${d.pillars[pk].score} (window-bound)`);
        }
    }

    // ── missing-tag recovery simulation ──
    if (extractSim) {
        const map = await fetchWidenedInterest(symbol);
        if (map) {
            let patched = false;
            const patchedStmts = stmts.map(s => {
                if (s.fiscalPeriod === 'FY' && s.fiscalYear != null) {
                    const v = map.get(`FY:${s.fiscalYear}`);
                    if (v !== undefined && v !== null && v !== s.interestExpense) {
                        patched = true;
                        return { ...s, interestExpense: v };
                    }
                }
                return s;
            });
            if (patched) {
                const dX = derivePillarInputs({ stmts: patchedStmts, tickerData, finnhubMetrics, valuationRows });
                if (!close(dX.interestCoverage, d.interestCoverage)) {
                    causes.add('missing-tag-recovery');
                    diffs.push(`interestCoverage: ${JSON.stringify(d.interestCoverage)} → ${JSON.stringify(dX.interestCoverage)} (missing-tag-recovery)`);
                }
                const oldPts = d.pillars.health.legs.find(l => l.key === 'interestCoverage')!.points;
                const newPts = dX.pillars.health.legs.find(l => l.key === 'interestCoverage')!.points;
                if (oldPts !== newPts) diffs.push(`health.interestCoverage pts: ${oldPts} → ${newPts} (missing-tag-recovery)`);
            }
        }
    }

    // ── interest-selection: old newest-first scan vs annual-first ──
    const legacyIcStmt = stmts.find(s => s.ebit != null && s.interestExpense != null && s.interestExpense !== 0);
    const { stmt: newIcStmt } = selectInterestCoverage(stmts, d.annualStmts, finnhubMetrics?.interestCoverage);
    if ((legacyIcStmt?.endDate?.getTime() ?? 0) !== (newIcStmt?.endDate?.getTime() ?? 0)) {
        causes.add('interest-selection');
        diffs.push(`interestStmt: ${legacyIcStmt ? `${legacyIcStmt.fiscalPeriod}${legacyIcStmt.fiscalYear}` : 'none→finnhub'} → ${newIcStmt ? `${newIcStmt.fiscalPeriod}${newIcStmt.fiscalYear}` : 'finnhub'} (interest-selection)`);
    }

    // ── legacyRead vs newShared input mix ──
    let legacyPillars: Record<string, number> | null = null;
    let legacyVerdict: string | null = null;
    let legacyOverall: number | null = null;
    const legDiffs: string[] = [];
    if (cached) {
        const li = legacyReadInput(cached, d, stmts, finnhubMetrics);
        const lp = computePillars(li);
        legacyPillars = {
            health: lp.health.score, profitability: lp.profitability.score, valuation: lp.valuation.score,
            growth: lp.growth.score, quality: lp.quality.score, moat: lp.moat.score,
        };
        legacyOverall = (lp.health.score + lp.profitability.score + lp.valuation.score + lp.growth.score + lp.quality.score) / 5;
        const lv = classifyVerdict({
            pillars: lp, insufficientData: d.insufficientData,
            pePercentile: d.pePercentile, peCurrent: d.peForPct, peMedian: d.peMedian,
            psPercentile: d.psPercentile, forwardPe: d.forwardPe,
        });
        legacyVerdict = lv.verdictKey;
        for (const [k, label] of INPUT_LABELS) {
            if (!close(li[k], d.pillarsInput[k])) {
                causes.add('live-vs-cached-mix');
                inputDiffs.push(`${label}: legacy=${JSON.stringify(li[k])} → new=${JSON.stringify(d.pillarsInput[k])}`);
            }
        }
        // leg-level attribution: which legs moved legacy→new
        for (const pk of ['health', 'profitability', 'valuation', 'growth', 'quality', 'moat'] as const) {
            const legMap = new Map(d.pillars[pk].legs.map(l => [l.key, l.points]));
            for (const leg of lp[pk].legs) {
                const np = legMap.get(leg.key);
                if (np !== undefined && np !== leg.points) {
                    legDiffs.push(`${pk}.${leg.key}: ${leg.points}→${np}`);
                }
            }
        }
    }

    // ── stored vs new ──
    const newVerdict = classifyVerdict({
        pillars: d.pillars,
        insufficientData: d.insufficientData,
        pePercentile: d.pePercentile,
        peCurrent: d.peForPct,
        peMedian: d.peMedian,
        psPercentile: d.psPercentile,
        forwardPe: d.forwardPe,
    });
    const newPillars = {
        health: d.pillars.health.score, profitability: d.pillars.profitability.score,
        valuation: d.pillars.valuation.score, growth: d.pillars.growth.score,
        quality: d.pillars.quality.score, moat: d.pillars.moat.score,
    };
    const storedMap: [string, unknown][] = [
        ['healthScore', newPillars.health], ['profitabilityScore', newPillars.profitability],
        ['valuationScore', newPillars.valuation], ['growthScore', newPillars.growth],
        ['qualityScore', newPillars.quality], ['moatScore', newPillars.moat],
        ['piotroskiScore', d.piotroskiScore], ['beneishScore', d.beneishScore],
        ['interestCoverage', d.interestCoverage], ['revenueCagr', d.revenueCagr],
        ['netIncomeCagr', d.netIncomeCagr], ['altmanZ', d.altmanZ],
        ['debtRepaymentYears', d.debtRepaymentYears], ['fcfMargin', d.fcfMargin],
        ['fcfConversion', d.fcfConversion], ['marginStability', d.marginStability],
        ['negativeNiYears', d.negativeNiYears], ['pePercentile', d.pePercentile],
        ['peVsMedian3yPct', d.peVsMedian3yPct],
    ];
    if (cached) {
        for (const [field, nv] of storedMap) {
            if (!close(cached[field], nv)) {
                diffs.push(`${field}: stored=${JSON.stringify(cached[field])} → new=${JSON.stringify(nv)}`);
            }
        }
        if (cached.verdictKey !== newVerdict.verdictKey) {
            diffs.push(`verdictKey: ${cached.verdictKey} → ${newVerdict.verdictKey}`);
            causes.add('verdict-flip');
        }
    }

    const newOverall = (newPillars.health + newPillars.profitability + newPillars.valuation + newPillars.growth + newPillars.quality) / 5;
    return {
        symbol, sector: ticker?.sector ?? null,
        stored: cached ? {
            health: cached.healthScore, profitability: cached.profitabilityScore,
            valuation: cached.valuationScore, growth: cached.growthScore,
            quality: cached.qualityScore, moat: cached.moatScore, overall: cached.overallScore,
            verdictKey: cached.verdictKey,
        } : {},
        legacyPillars, newPillars,
        storedVerdict: cached?.verdictKey ?? null,
        legacyVerdict, newVerdict: newVerdict.verdictKey,
        storedOverall: cached?.overallScore ?? null,
        legacyOverall, newOverall,
        legDiffs, diffs, causes, inputDiffs,
    };
}

async function main() {
    const symbols = optSymbols ?? (await prisma.analysisCache.findMany({ select: { symbol: true } })).map(r => r.symbol);
    const ordered = [...new Set([...REQUIRED, ...symbols])];

    const rows: Row[] = [];
    for (const symbol of ordered) {
        try {
            const r = await analyze(symbol);
            if (r) rows.push(r);
        } catch (e) {
            console.error(`[${symbol}] failed:`, (e as Error).message);
        }
    }

    // ── Console summary ──
    const changed = rows.filter(r => r.diffs.length > 0);
    const verdictFlips = rows.filter(r => r.storedVerdict && r.storedVerdict !== r.newVerdict);
    const mixAffected = rows.filter(r => r.inputDiffs.length > 0);
    console.log(`\n=== DRY-RUN COMPARISON (${rows.length} tickers) ===`);
    console.log(`changed rows: ${changed.length} | verdict flips: ${verdictFlips.length} | live-vs-cached-mix affected: ${mixAffected.length}`);
    const causeCounts = new Map<string, number>();
    for (const r of rows) for (const c of r.causes) causeCounts.set(c, (causeCounts.get(c) ?? 0) + 1);
    console.log('causes:', Object.fromEntries([...causeCounts.entries()].sort((a, b) => b[1] - a[1])));

    console.log('\n=== REQUIRED TICKERS ===');
    for (const sym of REQUIRED) {
        const r = rows.find(x => x.symbol === sym);
        if (!r) { console.log(`${sym}: NO DATA`); continue; }
        console.log(`\n${sym} (${r.sector ?? '?'})`);
        console.log(`  stored : ${JSON.stringify(r.stored)}`);
        console.log(`  legacy : ${JSON.stringify(r.legacyPillars)}`);
        console.log(`  new    : ${JSON.stringify(r.newPillars)} verdict ${r.storedVerdict} → ${r.newVerdict}`);
        for (const dLn of r.diffs) console.log(`    Δ ${dLn}`);
        for (const iLn of r.inputDiffs) console.log(`    mix ${iLn}`);
    }

    console.log('\n=== TOP DELTAS (|new − stored| on any pillar ≥ 10) ===');
    const big = rows.filter(r => r.stored.health != null && (
        Math.abs((r.newPillars.health ?? 0) - (r.stored.health as number)) >= 10 ||
        Math.abs((r.newPillars.moat ?? 0) - ((r.stored.moat as number) ?? 0)) >= 10 ||
        Math.abs((r.newPillars.quality ?? 0) - ((r.stored.quality as number) ?? 0)) >= 10
    ));
    for (const r of big.sort((a, b) => (b.diffs.length - a.diffs.length)).slice(0, 40)) {
        console.log(`${r.symbol} (${r.sector}): stored H${r.stored.health} Q${r.stored.quality} M${r.stored.moat} → new H${r.newPillars.health} Q${r.newPillars.quality} M${r.newPillars.moat} | causes: ${[...r.causes].join(',') || 'unattributed'}`);
    }

    console.log('\n=== VERDICT FLIPS (stored / legacy-read / new-shared) ===');
    for (const r of verdictFlips) {
        console.log(`\n${r.symbol} (${r.sector})`);
        console.log(`  verdict: stored=${r.storedVerdict} legacy=${r.legacyVerdict} new=${r.newVerdict}`);
        console.log(`  overall: stored=${r.storedOverall} legacy=${r.legacyOverall?.toFixed(1) ?? 'null'} new=${r.newOverall?.toFixed(1)}`);
        console.log(`  pillars: stored H${r.stored.health} P${r.stored.profitability} V${r.stored.valuation} G${r.stored.growth} Q${r.stored.quality} M${r.stored.moat}`);
        console.log(`           legacy H${r.legacyPillars?.health} P${r.legacyPillars?.profitability} V${r.legacyPillars?.valuation} G${r.legacyPillars?.growth} Q${r.legacyPillars?.quality} M${r.legacyPillars?.moat}`);
        console.log(`           new    H${r.newPillars.health} P${r.newPillars.profitability} V${r.newPillars.valuation} G${r.newPillars.growth} Q${r.newPillars.quality} M${r.newPillars.moat}`);
        console.log(`  causes: ${[...r.causes].join(', ') || '—'}`);
        if (r.legDiffs.length) console.log(`  legs: ${r.legDiffs.join(' | ')}`);
        for (const dLn of r.diffs) console.log(`    Δ ${dLn}`);
    }

    if (csvPath) {
        const header = 'symbol,sector,stored_health,stored_profit,stored_val,stored_growth,stored_quality,stored_moat,stored_overall,stored_verdict,legacy_health,legacy_profit,legacy_val,legacy_growth,legacy_quality,legacy_moat,legacy_overall,legacy_verdict,new_health,new_profit,new_val,new_growth,new_quality,new_moat,new_overall,new_verdict,causes,leg_diffs,input_diffs,diffs\n';
        const body = rows.map(r => [
            r.symbol, r.sector ?? '', r.stored.health ?? '', r.stored.profitability ?? '', r.stored.valuation ?? '',
            r.stored.growth ?? '', r.stored.quality ?? '', r.stored.moat ?? '', r.storedOverall ?? '', r.storedVerdict ?? '',
            r.legacyPillars?.health ?? '', r.legacyPillars?.profitability ?? '', r.legacyPillars?.valuation ?? '',
            r.legacyPillars?.growth ?? '', r.legacyPillars?.quality ?? '', r.legacyPillars?.moat ?? '',
            r.legacyOverall?.toFixed(2) ?? '', r.legacyVerdict ?? '',
            r.newPillars.health, r.newPillars.profitability, r.newPillars.valuation, r.newPillars.growth,
            r.newPillars.quality, r.newPillars.moat, r.newOverall.toFixed(2), r.newVerdict,
            [...r.causes].join('|'), r.legDiffs.join(' ~ ').replace(/[\n,]/g, ';'),
            r.inputDiffs.join(' ~ ').replace(/[\n,]/g, ';'), r.diffs.join(' ~ ').replace(/[\n,]/g, ';'),
        ].join(',')).join('\n');
        fs.writeFileSync(csvPath, header + body);
        console.log(`\nCSV written: ${csvPath}`);
    }
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

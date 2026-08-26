/**
 * Audit script: compute Data-Driven Valuation metrics across representative tickers.
 * Run on production server: tsx scripts/audit-dd-valuation.ts
 *
 * Output: CSV-like table with all metrics for normalization analysis.
 */
import { prisma } from '../src/lib/db/prisma';
import { computeTTM } from '../src/lib/utils/ttm';
import { applySplitAdjustments, applyPostSplitAdjustment } from '../src/lib/utils/splitAdjustment';
import { buildStats } from '../src/lib/utils/analysisMath';
import { computeTTMAtDate } from '../src/lib/utils/ttm';

const TICKERS = [
    'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA', 'TSM', 'JPM',
    'WMT', 'ORCL', 'LLY', 'V', 'MA', 'NFLX', 'XOM', 'COST', 'JNJ', 'HD',
    'PLTR', 'PG', 'ABBV', 'BAC', 'CVX', 'KO', 'GE', 'AMD', 'CSCO', 'PM',
    'WFC', 'CRM', 'IBM', 'GS', 'MCD', 'INTU', 'UNH', 'RTX', 'DIS', 'CAT',
    'MRK', 'PEP', 'NOW', 'UBER', 'BKNG',
];

interface Row {
    symbol: string;
    sector: string | null;
    currentPrice: number | null;
    currentEps: number | null;
    currentPe: number | null;
    forwardPe: number | null;
    forwardEps: number | null;
    epsCagr3y: number | null;
    epsCagr5y: number | null;
    peP25: number | null;
    peMedian: number | null;
    peP75: number | null;
    peCount: number;
    // 5Y projection (base case: forwardEps × (1+cagr5y)^5 × medianPE)
    projEps: number | null;
    projPriceBase: number | null;
    projCagrBase: number | null;
    projPriceBull: number | null;
    projCagrBull: number | null;
}

async function audit(): Promise<void> {
    const rows: Row[] = [];

    for (const symbol of TICKERS) {
        try {
            const row = await computeRow(symbol);
            rows.push(row);
            process.stdout.write('.');
        } catch (e: any) {
            process.stdout.write('x');
            rows.push({
                symbol, sector: null, currentPrice: null, currentEps: null, currentPe: null,
                forwardPe: null, forwardEps: null, epsCagr3y: null, epsCagr5y: null,
                peP25: null, peMedian: null, peP75: null, peCount: 0,
                projEps: null, projPriceBase: null, projCagrBase: null,
                projPriceBull: null, projCagrBull: null,
            });
        }
    }

    console.log('\n');
    // Print CSV header
    const header = [
        'Symbol', 'Sector', 'Price', 'CurrEPS', 'CurrPE', 'FwdPE', 'FwdEPS',
        'CAGR3Y', 'CAGR5Y', 'PE_P25', 'PE_Med', 'PE_P75', 'PE_n',
        'ProjEPS', 'ProjBase', 'CAGRBase', 'ProjBull', 'CAGRBull',
    ];
    console.log(header.join('\t'));

    // Sort by CAGR5Y descending
    rows.sort((a, b) => (b.epsCagr5y ?? -999) - (a.epsCagr5y ?? -999));

    for (const r of rows) {
        const fmt = (v: number | null, dec = 2) => v === null ? 'N/A' : v.toFixed(dec);
        const vals = [
            r.symbol,
            r.sector ?? '—',
            fmt(r.currentPrice),
            fmt(r.currentEps),
            fmt(r.currentPe, 1),
            fmt(r.forwardPe, 1),
            fmt(r.forwardEps),
            fmt(r.epsCagr3y, 1),
            fmt(r.epsCagr5y, 1),
            fmt(r.peP25, 1),
            fmt(r.peMedian, 1),
            fmt(r.peP75, 1),
            String(r.peCount),
            fmt(r.projEps),
            fmt(r.projPriceBase),
            fmt(r.projCagrBase, 1),
            fmt(r.projPriceBull),
            fmt(r.projCagrBull, 1),
        ];
        console.log(vals.join('\t'));
    }

    // Summary stats
    console.log('\n--- Summary ---');
    const cagr5yVals = rows.map(r => r.epsCagr5y).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const medianPEVals = rows.map(r => r.peMedian).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const cagrBaseVals = rows.map(r => r.projCagrBase).filter((v): v is number => v !== null && isFinite(v)).sort((a, b) => a - b);

    const pct = (arr: number[], p: number) => {
        if (arr.length === 0) return null;
        const idx = (p / 100) * (arr.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(Math.ceil(idx), arr.length - 1);
        return arr[lo]! + (arr[hi]! - arr[lo]!) * (idx - lo);
    };

    console.log(`5Y EPS CAGR: n=${cagr5yVals.length}, min=${cagr5yVals[0]?.toFixed(1)}, p25=${pct(cagr5yVals, 25)?.toFixed(1)}, median=${pct(cagr5yVals, 50)?.toFixed(1)}, p75=${pct(cagr5yVals, 75)?.toFixed(1)}, max=${cagr5yVals[cagr5yVals.length-1]?.toFixed(1)}`);
    console.log(`5Y Median P/E: n=${medianPEVals.length}, min=${medianPEVals[0]?.toFixed(1)}, p25=${pct(medianPEVals, 25)?.toFixed(1)}, median=${pct(medianPEVals, 50)?.toFixed(1)}, p75=${pct(medianPEVals, 75)?.toFixed(1)}, max=${medianPEVals[medianPEVals.length-1]?.toFixed(1)}`);
    console.log(`Base CAGR: n=${cagrBaseVals.length}, min=${cagrBaseVals[0]?.toFixed(1)}, p25=${pct(cagrBaseVals, 25)?.toFixed(1)}, median=${pct(cagrBaseVals, 50)?.toFixed(1)}, p75=${pct(cagrBaseVals, 75)?.toFixed(1)}, max=${cagrBaseVals[cagrBaseVals.length-1]?.toFixed(1)}`);

    await prisma.$disconnect();
}

async function computeRow(symbol: string): Promise<Row> {
    const ticker = await prisma.ticker.findUnique({
        where: { symbol },
        select: { symbol: true, sector: true, lastPrice: true, sharesOutstanding: true },
    });

    const finnhubMetrics = await prisma.finnhubMetrics.findUnique({ where: { symbol } });

    // Financial statements for TTM EPS
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const stmts = await prisma.financialStatement.findMany({
        where: { symbol, endDate: { gte: tenYearsAgo } },
        orderBy: { endDate: 'desc' },
    });

    if (stmts.length > 0) {
        try { await applySplitAdjustments(stmts, symbol, tenYearsAgo); } catch {}
    }
    if (stmts.length > 0 && ticker?.sharesOutstanding) {
        applyPostSplitAdjustment(stmts, ticker.sharesOutstanding);
    }

    const latestStmt = stmts[0] ?? null;
    const ttm = computeTTM(stmts);
    const ttmNetIncome = ttm.netIncome;
    const sharesOutstanding = latestStmt?.sharesOutstanding ?? null;

    const effectivePrice = ticker?.lastPrice ?? 0;

    // Current EPS
    let currentEps: number | null = finnhubMetrics?.netIncomePerShare ?? null;
    if (currentEps === null && ttmNetIncome !== null && sharesOutstanding && sharesOutstanding > 0) {
        currentEps = ttmNetIncome / sharesOutstanding;
    }

    // Current P/E
    let currentPe: number | null = finnhubMetrics?.peRatio ?? null;

    // Forward P/E & implied forward EPS
    const forwardPe = finnhubMetrics?.forwardPe ?? null;
    const forwardEps = (forwardPe !== null && forwardPe > 0 && effectivePrice > 0)
        ? effectivePrice / forwardPe
        : null;

    // Historical P/E distribution (daily, 10Y)
    const valRows = await prisma.dailyValuationHistory.findMany({
        where: { symbol, date: { gte: tenYearsAgo } },
        select: { peRatio: true },
        orderBy: { date: 'asc' },
    });
    const validPe = valRows.map(r => r.peRatio).filter((v): v is number => v !== null && v > 3 && v < 200);
    const peStats = buildStats(validPe);

    // EPS CAGR from per-share history
    const epsPerShareHistory: { date: string; value: number }[] = [];
    let prevShares: number | null = null;
    const sortedStmts = [...stmts].sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
    for (const s of sortedStmts) {
        if (!s.fiscalPeriod || s.fiscalPeriod === 'FY') continue;
        const { netIncome: ttmNI } = computeTTMAtDate(stmts, s.endDate);
        let shares = s.sharesOutstanding;
        if (shares && shares > 0 && prevShares && prevShares > 0 && shares > prevShares * 2) {
            const sharesRatio = shares / prevShares;
            const commonRatios = [2, 3, 4, 5, 7, 8, 10, 15, 20, 25];
            const nearest = commonRatios.reduce((best, r) =>
                Math.abs(sharesRatio - r) < Math.abs(sharesRatio - best) ? r : best
            );
            if (Math.abs(sharesRatio - nearest) / nearest > 0.15) {
                shares = prevShares;
            }
        }
        if (shares && shares > 0 && s.endDate) {
            prevShares = shares;
            const endDate = new Date(s.endDate.getTime() + 24 * 60 * 60 * 1000);
            const dateStr = endDate.toISOString().split('T')[0] as string;
            if (ttmNI != null && ttmNI > 0) {
                epsPerShareHistory.push({ date: dateStr, value: parseFloat((ttmNI / shares).toFixed(4)) });
            }
        }
    }

    function computeEpsCagr(years: number): number | null {
        if (epsPerShareHistory.length < 2) return null;
        const last = epsPerShareHistory[epsPerShareHistory.length - 1]!;
        const lastDate = new Date(last.date);
        const targetDate = new Date(lastDate);
        targetDate.setFullYear(targetDate.getFullYear() - years);
        let candidate = epsPerShareHistory[0]!;
        for (const pt of epsPerShareHistory) {
            if (new Date(pt.date) <= targetDate) {
                candidate = pt;
            } else {
                break;
            }
        }
        const actualYears = (lastDate.getTime() - new Date(candidate.date).getTime())
            / (365 * 24 * 60 * 60 * 1000);
        if (actualYears < years * 0.8) return null;
        if (candidate.value <= 0 || last.value <= 0) return null;
        const cagr = Math.pow(last.value / candidate.value, 1 / actualYears) - 1;
        return parseFloat((cagr * 100).toFixed(2));
    }

    const epsCagr3y = computeEpsCagr(3);
    const epsCagr5y = computeEpsCagr(5);

    // 5Y projection (base case)
    const ddBaseEps = (forwardEps && forwardEps > 0) ? forwardEps : (currentEps ?? 0);
    const growthRate = epsCagr5y ?? epsCagr3y ?? 10;
    const projEps = ddBaseEps * Math.pow(1 + growthRate / 100, 5);
    const peMedian = peStats?.median ?? null;
    const peP75 = peStats?.p75 ?? null;

    const projPriceBase = (peMedian && peMedian > 0) ? projEps * peMedian : null;
    const projCagrBase = (projPriceBase && effectivePrice > 0)
        ? (Math.pow(projPriceBase / effectivePrice, 1 / 5) - 1) * 100 : null;

    const projPriceBull = (peP75 && peP75 > 0) ? projEps * peP75 : null;
    const projCagrBull = (projPriceBull && effectivePrice > 0)
        ? (Math.pow(projPriceBull / effectivePrice, 1 / 5) - 1) * 100 : null;

    return {
        symbol,
        sector: ticker?.sector ?? null,
        currentPrice: effectivePrice > 0 ? effectivePrice : null,
        currentEps,
        currentPe,
        forwardPe,
        forwardEps,
        epsCagr3y,
        epsCagr5y,
        peP25: peStats?.p25 ?? null,
        peMedian: peStats?.median ?? null,
        peP75: peStats?.p75 ?? null,
        peCount: peStats?.count ?? 0,
        projEps,
        projPriceBase,
        projCagrBase,
        projPriceBull,
        projCagrBull,
    };
}

audit().catch(e => { console.error(e); process.exit(1); });

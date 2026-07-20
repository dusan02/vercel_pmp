/**
 * Sync financial statements from stockanalysis.com for ADR/foreign tickers
 * that don't have XBRL data in Finnhub.
 *
 * Scrapes income statement, balance sheet, and cash flow from stockanalysis.com
 * which embeds financial data as JS objects in the HTML.
 *
 * Run: npx tsx scripts/sync-adr-financials.ts
 */
import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';

const SA_BASE = 'https://stockanalysis.com/stocks';
const HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

interface SAData {
    datekey: string[];
    fiscalYear: string[];
    fiscalQuarter: string[];
    [key: string]: any;
}

function extractFinancialData(html: string): SAData | null {
    const idx = html.indexOf('financialData:{');
    if (idx < 0) return null;

    const start = idx + 'financialData:'.length;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        if (depth === 0) {
            const objStr = html[start] + html.slice(start + 1, i + 1);
            // 1. Quote unquoted JS keys: {key: -> {"key":
            let jsonStr = objStr.replace(/([{,])([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":');
            // 2. Replace JS void 0 (undefined) with null for valid JSON
            jsonStr = jsonStr.replace(/void 0/g, 'null');
            // 3. Fix JS number literals without leading zero: .06306 -> 0.06306, -.06306 -> -0.06306
            //    JSON requires a leading digit before the decimal point
            jsonStr = jsonStr.replace(/([\[:,\[])(-?)\.(\d)/g, '$1$20.$3');
            try {
                return JSON.parse(jsonStr);
            } catch (e) {
                console.error('  Failed to parse financialData JSON:', (e as Error).message);
                return null;
            }
        }
    }
    return null;
}

async function fetchSAData(symbol: string, statement: string): Promise<SAData | null> {
    const url = `${SA_BASE}/${symbol.toLowerCase()}/financials/${statement}/`;
    try {
        const resp = await fetch(url, { headers: HEADERS });
        if (!resp.ok) {
            console.error(`  HTTP ${resp.status} for ${statement}`);
            return null;
        }
        const html = await resp.text();
        return extractFinancialData(html);
    } catch (err) {
        console.error(`  Fetch error for ${statement}:`, (err as Error).message);
        return null;
    }
}

function numArr(data: SAData, key: string): (number | null)[] {
    if (!data[key]) return [];
    return data[key].map((v: any) => (v === null || v === undefined || isNaN(v)) ? null : Number(v));
}

async function syncTickerFinancials(symbol: string): Promise<boolean> {
    // Fetch all three statements
    const [income, balance, cashflow] = await Promise.all([
        fetchSAData(symbol, ''),
        fetchSAData(symbol, 'balance-sheet'),
        fetchSAData(symbol, 'cash-flow-statement'),
    ]);

    if (!income) {
        console.log(`  No income statement data for ${symbol}`);
        return false;
    }

    // Ensure ticker exists
    await prisma.ticker.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name: symbol },
    });

    const periods = income.datekey.length;
    let upserted = 0;

    for (let i = 0; i < periods; i++) {
        const dateStr = income.datekey[i]!;
        const fiscalYear = parseInt(income.fiscalYear[i]!, 10);
        const fiscalQuarter = income.fiscalQuarter[i]!;
        const endDate = new Date(dateStr + 'T00:00:00Z');

        // Determine fiscal period
        const fiscalPeriod: string = (fiscalQuarter === 'Q4' || fiscalQuarter === 'FY') ? 'FY' : fiscalQuarter;

        // Skip TTM (first entry is usually TTM)
        if (dateStr === 'TTM') continue;

        // Income statement values
        const revenue = numArr(income, 'revenue')[i];
        const netIncome = numArr(income, 'netIncome')[i];
        const ebit = numArr(income, 'ebit')[i] ?? numArr(income, 'operatingIncome')[i];
        const grossProfit = numArr(income, 'grossProfit')[i];
        const interestExpense = numArr(income, 'income_statement_interest_expense')[i];
        const sharesOutstanding = numArr(income, 'sharesDiluted')[i] ?? numArr(income, 'sharesBasic')[i];
        const sbc = numArr(income, 'sbc')[i] ?? null;

        // Balance sheet values
        const totalAssets = balance ? numArr(balance, 'assets')[i] : null;
        const totalLiabilities = balance ? numArr(balance, 'liabilities')[i] : null;
        const currentAssets = balance ? numArr(balance, 'assetsc')[i] : null;
        const currentLiabilities = balance ? numArr(balance, 'liabilitiesc')[i] : null;
        const retainedEarnings = balance ? numArr(balance, 'balance_sheet_retained_earnings')[i] : null;
        const totalEquity = balance ? numArr(balance, 'equity')[i] : null;
        const totalDebt = balance ? numArr(balance, 'debt')[i] : null;
        const cashAndEquivalents = balance ? numArr(balance, 'totalcash')[i] ?? numArr(balance, 'cashneq')[i] : null;
        const netPPE = balance ? numArr(balance, 'balance_sheet_net_property_plant_and_equipment')[i] : null;

        // Cash flow values
        const operatingCashFlow = cashflow ? numArr(cashflow, 'cash_flow_statement_net_cash_from_operating_activities')[i]
            ?? numArr(cashflow, 'cfo')[i] : null;
        const capex = cashflow ? numArr(cashflow, 'cash_flow_statement_capital_expenditure')[i]
            ?? numArr(cashflow, 'capex')[i] : null;

        const stmtData = {
            endDate,
            revenue: revenue ?? null, netIncome: netIncome ?? null, ebit: ebit ?? null, grossProfit: grossProfit ?? null,
            operatingCashFlow: operatingCashFlow ?? null, capex: capex ?? null,
            totalAssets: totalAssets ?? null, totalLiabilities: totalLiabilities ?? null, currentAssets: currentAssets ?? null, currentLiabilities: currentLiabilities ?? null,
            retainedEarnings: retainedEarnings ?? null, totalEquity: totalEquity ?? null, sharesOutstanding: sharesOutstanding ?? null,
            sbc: sbc ?? null, interestExpense: interestExpense ?? null, totalDebt: totalDebt ?? null, cashAndEquivalents: cashAndEquivalents ?? null, netPPE: netPPE ?? null,
        };

        await prisma.financialStatement.upsert({
            where: {
                symbol_fiscalYear_fiscalPeriod: {
                    symbol,
                    fiscalYear,
                    fiscalPeriod,
                },
            },
            update: stmtData,
            create: {
                symbol, period: fiscalPeriod,
                fiscalYear, fiscalPeriod,
                ...stmtData,
            },
        });
        upserted++;
    }

    console.log(`  Upserted ${upserted} statements`);
    return upserted > 0;
}

async function main() {
    console.log('🔄 sync-adr-financials starting...');

    // Get tickers without financial statements
    const all = await prisma.ticker.findMany({
        select: { symbol: true },
        orderBy: { lastMarketCap: 'desc' },
    });

    const stmtSymbols = await prisma.financialStatement.findMany({
        distinct: ['symbol'],
        select: { symbol: true },
    });
    const stmtSet = new Set(stmtSymbols.map(s => s.symbol));
    const missing = all.filter(t => !stmtSet.has(t.symbol)).map(t => t.symbol);

    console.log(`Tickers without financial statements: ${missing.length}`);

    // Filter out non-stock tickers
    const skip = new Set(['EURUSD', 'SPY', 'QQQ', 'DIA', 'SPCX', 'SKHY', 'SKHYV', 'CLO', 'SOUND', 'T1', 'REDWIRE', 'BRKB', 'BRK.B', 'PBR-A']);
    const toSync = missing.filter(s => !skip.has(s));

    console.log(`Syncing ${toSync.length} tickers (skipping ${missing.length - toSync.length} ETFs/invalid)`);

    let success = 0;
    let failed = 0;
    const errors: { symbol: string; error: string }[] = [];

    for (let i = 0; i < toSync.length; i++) {
        const symbol = toSync[i]!;
        process.stdout.write(`[${i + 1}/${toSync.length}] ${symbol}... `);
        try {
            const ok = await syncTickerFinancials(symbol);
            if (ok) {
                success++;
                console.log('✓');
            } else {
                failed++;
                console.log('✗ (no data)');
                errors.push({ symbol, error: 'no data' });
            }
        } catch (err: any) {
            failed++;
            console.log(`✗ ${err?.message || 'error'}`);
            errors.push({ symbol, error: err?.message || 'unknown' });
        }
        // Rate limit: 1.5s between tickers
        if (i < toSync.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n=== DONE ===`);
    console.log(`Success: ${success}, Failed: ${failed}, Total: ${toSync.length}`);
    if (errors.length > 0) {
        console.log('\nFailed tickers:');
        for (const e of errors) {
            console.log(`  ${e.symbol}: ${e.error}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(console.error);
